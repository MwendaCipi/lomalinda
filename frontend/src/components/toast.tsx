"use client";

/**
 * The two connection notices.
 *
 * Rule 2 — ConnectivityToast: the moment the network drops, a small note
 * slides up above the tab bar telling the user what is about to happen —
 * pages they have opened before keep working from the device's copy; the
 * next thing that must talk to the server will wait until they are back.
 * It clears itself quietly when the network returns.
 *
 * Rule 3 — showOfflineGuard: every action that must reach the server —
 * a save, a hand-over, an export — calls it first. Online, this is a
 * no-op and the action runs exactly as before. Offline, the click gets
 * an answer instead of failing silently: a note explaining the action
 * needs the network, and that the charts and pages opened before are
 * still readable.
 */

/* ─────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import Swal from "sweetalert2";
import { brand } from "@/lib/brand";

/* ── Rule 2: the live watcher ─────────────────────────────────────────── */

/** Renders itself; mounts anywhere in the shell (once per layout). */
export function ConnectivityToast() {
  // SSR-safe initial state: server renders with no navigator; once mounted on
  // the client we read the live value (below) rather than hydrate a wrong one.
  const [offline, setOffline] = useState(true);

  useEffect(() => {
    installOfflineFetchGuard();
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    goOffline();
    goOnline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      data-testid="connectivity-toast"
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-bark px-4 py-3 text-white shadow-lg md:bottom-6"
    >
      <WifiOff className="h-5 w-5 shrink-0" aria-hidden />
      <p className="text-sm">
        <span className="font-semibold">You&apos;re offline.</span> Pages
        you&apos;ve opened before still work. Actions that need the internet
        wait until you&apos;re back.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

/* ── Rule 3: the action guard ─────────────────────────────────────────── */

export type DoingWhat =
  | "saving changes"
  | "sending message"
  | "exporting PDF"
  | "loading data"
  | "signing you in";

/** Single place an offline click goes. Call before the network call. */
export function showOfflineGuard(action: DoingWhat = "saving changes") {
  if (navigator.onLine) return false; // online: run normally

  void Swal.fire({
    title: "You're offline",
    html: `<p class="text-sm leading-6">This action (${action}) needs an internet connection. Please try again when you're back online.</p><p class="mt-2 text-xs text-gray-500">You can keep reading pages you've already opened — everything you've viewed is still available.</p>`,
    toast: false,
    timer: 6000,
    timerProgressBar: true,
    showConfirmButton: true,
    confirmButtonText: "OK",
    confirmButtonColor: brand.bark,
    icon: "warning",
    iconColor: brand.bark,
  });
  return true; // offline: the click stops here
}

/* ─────────────────────────────────────────────────────────────────────── */

/* ── The net under every fetch ───────────────────────────────────────────
   The app's API calls are spread across a hundred desks, each with its own
   handler, and a handler that was written for a server error may stay
   silent when the request never leaves the device. So instead of relying
   on every desk to check the network first, the guard watches window.fetch
   itself: whenever the browser is offline, any call that must change
   something (POST) answers in person — the guard note opens, and the
   promise rejects the same way a browser does when the network drops, so
   every desk's own "could not …" path still runs and nothing is swallowed.

   Reads are left alone: pages keep reading from the offline cache, which
   is the whole point of an installed app on the road. */

const GUARD_REPEAT_WINDOW_MS = 6000;
let lastGuardShown = 0;
let fetchPatched = false;

function noteOffline(method: string) {
  const now = Date.now();
  if (now - lastGuardShown < GUARD_REPEAT_WINDOW_MS) return;
  lastGuardShown = now;
  const action: DoingWhat =
    method === "POST" ? "saving changes" : "signing you in";
  showOfflineGuard(action);
}

export function installOfflineFetchGuard() {
  if (fetchPatched || typeof window === "undefined" || typeof window.fetch !== "function") return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = function scopedFetch(input: RequestInfo | URL, init?: RequestInit) {
    let method: string | undefined;
    if (typeof init?.method === "string") method = init.method;
    else if (input instanceof Request) method = input.method;
    method = (method ?? "GET").toUpperCase();
    if (method === "GET" || navigator.onLine) return originalFetch(input as RequestInfo, init);
    noteOffline(method);
    return Promise.reject(new TypeError("Failed to fetch"));
  };
}

/* ─────────────────────────────────────────────────────────────────────── */

/** Back on the network after being off it — a short, quiet note. */
export function showBackOnlineNotice() {
  void Swal.fire({
    title: "Back online",
    html: `<p class="text-sm">You are connected again. Clicks now work normally.</p>`,
    toast: true,
    position: "bottom-end",
    timer: 2500,
    showConfirmButton: false,
    icon: "success",
    iconColor: brand.bark,
  });
}

/** Exposed for pages that want one icon styling consistent with this file. */
export const ConnectionIcons = { wifi: Wifi, wifiOff: WifiOff };