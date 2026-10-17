"use client";

/**
 * Web Push on the client: ask, subscribe, store, re-sync, unsubscribe, test.
 *
 * The browser must grant permission from a real user gesture, so enabling only
 * ever happens from the "Turn on notifications" button in the bell. The flow:
 * request permission → get the server's VAPID public key → subscribe the
 * service worker's push manager → POST the subscription to the API so the
 * office audience's devices can be woken when a request lands.
 *
 * A stored subscription is not permanent: Chrome and Firefox rotate push
 * endpoints, a browser updates itself out of a subscription, and clearing site
 * data takes it with it. When that happens the server holds an address nobody
 * answers at, delivery is refused, and the phone simply stops ringing while the
 * app still says notifications are on. `syncPushSubscription` is the repair:
 * every signed-in visit re-registers whatever the browser actually holds.
 */

// Same convention as site-nav: an unset variable means the API lives on this
// very origin (nginx proxies /api) — a loopback fallback here would send the
// deployed site's browsers chasing 127.0.0.1 and every call would fail.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushSupport =
  | { supported: false; reason: "insecure" | "unsupported" }
  | { supported: true; enabled: boolean };

/** The browser halves push needs, and a secure origin to use them on. */
function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return false;
  }
  return window.isSecureContext;
}

/** What the bell should show: nothing (unsupported), an on-switch, or an off-switch. */
export async function getPushState(): Promise<PushSupport> {
  if (typeof window === "undefined") return { supported: false, reason: "unsupported" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { supported: false, reason: "unsupported" };
  }
  // Push only exists in a secure context (https — or localhost during dev).
  if (!window.isSecureContext) return { supported: false, reason: "insecure" };
  try {
    // A browser that supports push is not "unsupported" just because this
    // visit has not started the service worker yet — and on a fresh browser it
    // usually has not, which left the bell with no switch and no permission ask
    // at all. Registering here is the same call the enable flow makes, so the
    // worker the subscription needs exists by the time the switch is pressed.
    const registration =
      (await navigator.serviceWorker.getRegistration("/")) ??
      (await navigator.serviceWorker.register("/sw.js"));
    if (!registration) return { supported: false, reason: "unsupported" };
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported: true,
      enabled: !!subscription && Notification.permission === "granted",
    };
  } catch {
    return { supported: false, reason: "unsupported" };
  }
}

/** Hand one subscription to the server, replacing whatever it held for it. */
export async function postPushSubscription(subscription: PushSubscription): Promise<boolean> {
  const token = localStorage.getItem("access_token");
  if (!token) return false;
  const res = await fetch(`${API_URL}/api/members/push/subscribe/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

/** Ask the server for its browser key; null when push is not configured there. */
async function fetchServerKey(token: string): Promise<string | null> {
  try {
    const keyRes = await fetch(`${API_URL}/api/members/push/key/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!keyRes.ok) return null;
    const { public_key } = (await keyRes.json()) as { public_key?: string };
    return public_key || null;
  } catch {
    return null;
  }
}

/**
 * Whether a subscription was made with the key the server has on record.
 *
 * A VAPID pair can be replaced on purpose, and every device that subscribed
 * before that still holds a subscription the push service will refuse: the
 * key it was registered with is no longer the key the server signs with. The
 * browser reports the key it used, so the mismatch is detectable here rather
 * than showing up as a silent phone. Browsers that do not report it (Safari)
 * are left alone.
 */
function subscriptionMatchesKey(subscription: PushSubscription, publicKey: string): boolean {
  const held = subscription.options?.applicationServerKey;
  if (!held) return true;
  const expected = urlBase64ToUint8Array(publicKey);
  const heldBytes = new Uint8Array(held as ArrayBuffer);
  if (heldBytes.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (heldBytes[i] !== expected[i]) return false;
  }
  return true;
}

/** The subscription this browser should hold for that key, replaced if stale. */
async function ensureSubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string
): Promise<PushSubscription> {
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !subscriptionMatchesKey(subscription, publicKey)) {
    try {
      await subscription.unsubscribe();
    } catch {
      // A browser that refuses leaves the subscribe call below to fail loudly.
    }
    subscription = null;
  }
  if (subscription) return subscription;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return { ok: false, error: "Sign in first." };

    // Must happen inside the click's user gesture.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "Permission was not granted." };

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const publicKey = await fetchServerKey(token);
    if (!publicKey) return { ok: false, error: "The server could not provide a push key." };

    const subscription = await ensureSubscription(registration, publicKey);

    const saved = await postPushSubscription(subscription);
    if (!saved) return { ok: false, error: "Could not save the subscription." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not enable notifications." };
  }
}

/**
 * Re-register the subscription this browser currently holds, if it has one.
 *
 * Called on every signed-in visit. It is deliberately tolerant: a device that
 * never enabled push, a browser that refuses, or a server that cannot be
 * reached all just leave the state as it was — the button still works, and the
 * next visit tries again.
 */
export async function syncPushSubscription(): Promise<boolean> {
  try {
    if (!pushSupported()) return false;
    if (Notification.permission !== "granted") return false;
    const token = localStorage.getItem("access_token");
    if (!token) return false;
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return false;

    // The key is fetched first: it says whether the subscription this browser
    // holds is still one the server can deliver to. The browser retired one
    // (rotation, a reinstall, cleared site data) has to be re-made — permission
    // is already granted, so no new prompt is involved.
    const publicKey = await fetchServerKey(token);
    if (!publicKey) return false;

    const subscription = await ensureSubscription(registration, publicKey);
    return await postPushSubscription(subscription);
  } catch {
    return false;
  }
}

/**
 * Send one test notice to this account's devices and report what happened.
 *
 * An empty device list and a refused delivery are the two ways "notifications
 * don't work" hides, and neither is visible from the phone.
 */
export async function sendTestPush(): Promise<
  | {
      ok: true;
      keysReady: boolean;
      devices: number;
      delivered: number;
      results: { device: string; delivered: boolean; status: number | null; error: string }[];
    }
  | { ok: false; error: string }
> {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return { ok: false, error: "Sign in first." };
    const res = await fetch(`${API_URL}/api/members/push/test/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, error: "The server could not send a test notification." };
    const data = (await res.json()) as {
      devices?: number;
      delivered?: number;
      keys_ready?: boolean;
      results?: { device: string; delivered: boolean; status: number | null; error: string }[];
    };
    return {
      ok: true,
      keysReady: data.keys_ready ?? true,
      devices: data.devices ?? 0,
      delivered: data.delivered ?? 0,
      results: data.results ?? [],
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not send a test notification." };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const token = localStorage.getItem("access_token");
    if (token) {
      fetch(`${API_URL}/api/members/push/subscribe/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});
    }
    await subscription.unsubscribe();
  } catch {
    // Turning off must never throw into the UI.
  }
}
