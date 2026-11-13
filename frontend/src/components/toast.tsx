"use client";

/**
 * The two connection notices.
 *
 * Rule 2 — ConnectivityToast: when a page fails to load because the network
 * is gone, a small note slides up above the tab bar saying so — pages already
 * opened keep working from the device's copy. It is raised by the failed page
 * itself (`PAGE_LOAD_FAILED_EVENT`), never by the network merely dropping and
 * never by a failed save or sign-in: an alert about a page that has not failed
 * is noise, and the thing in front of the member already says what went wrong.
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
import { PAGE_LOAD_FAILED_EVENT } from "@/lib/offline-fetch";

/* ── Rule 2: the live watcher ─────────────────────────────────────────── */

/** Renders itself; mounts anywhere in the shell (once per layout). */
export function ConnectivityToast() {
  // Nothing shows until a page actually fails to load, so the first render —
  // server and client alike — is silent.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const failed = () => setOffline(true);
    const back = () => setOffline(false);
    window.addEventListener(PAGE_LOAD_FAILED_EVENT, failed);
    window.addEventListener("online", back);
    return () => {
      window.removeEventListener(PAGE_LOAD_FAILED_EVENT, failed);
      window.removeEventListener("online", back);
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
        <span className="font-semibold">You&apos;re offline.</span> This page
        could not load. Pages you&apos;ve opened before still work.
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

/* ── Why there is no net under every fetch ───────────────────────────────
   This file used to patch `window.fetch` so that any POST made offline — a
   save, a sign-in, a poll — opened a “You're offline” note of its own. It
   could not tell a page that had failed from a background call that had, so
   it fired on things the member never asked to hear about: pressing Sign in
   on a dropped network produced an offline alert instead of the sign-in
   page's own message.

   The notice now belongs to the page that failed to load (Rule 2), and an
   action a member deliberately pressed still answers for itself through
   `showOfflineGuard` at the place that sends it. */

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