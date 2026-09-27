"use client";

/**
 * Web Push on the client: ask, subscribe, store, unsubscribe.
 *
 * The browser must grant permission from a real user gesture, so this is only
 * ever called from the "Turn on phone notifications" button in the bell. The
 * flow: request permission → get the server's VAPID public key → subscribe
 * the service worker's push manager → POST the subscription to the API so the
 * office audience's devices can be woken when a request lands.
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

/** What the bell should show: nothing (unsupported), an on-switch, or an off-switch. */
export async function getPushState(): Promise<PushSupport> {
  if (typeof window === "undefined") return { supported: false, reason: "unsupported" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { supported: false, reason: "unsupported" };
  }
  // Push only exists in a secure context (https — or localhost during dev).
  if (!window.isSecureContext) return { supported: false, reason: "insecure" };
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
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

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) return { ok: false, error: "Sign in first." };

    // Must happen inside the click's user gesture.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "Permission was not granted." };

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const keyRes = await fetch(`${API_URL}/api/members/push/key/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!keyRes.ok) return { ok: false, error: "The server is not ready for push yet." };
    const { public_key } = (await keyRes.json()) as { public_key?: string };
    if (!public_key) return { ok: false, error: "Push keys are not configured yet." };

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key),
      });
    }

    const res = await fetch(`${API_URL}/api/members/push/subscribe/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) return { ok: false, error: "Could not save the subscription." };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not enable notifications." };
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
