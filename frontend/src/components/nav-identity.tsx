"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Inbox,
  LogIn,
  LogOut,
  X,
} from "lucide-react";
import Swal from "sweetalert2";

import { AccessibilityMenu } from "./accessibility-menu";
import { resolveAttachmentUrl } from "./announcement-attachment";
import { isPwaInstalled, pwaInstallLabel, triggerPwaInstall } from "./pwa-register";
import { accountMenuKeys, destinationOf, isStaffRole } from "@/config/navigation";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { clearSession } from "@/lib/auth";
import { enablePush, getPushState, postPushSubscription, PushSupport, syncPushSubscription } from "@/lib/push";
import {
  markCachedNotificationsRead,
  resetHeaderSession,
  useHeaderData,
  type ChurchNotificationItem,
} from "@/hooks/use-header-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * How many things the bell would call unread.
 *
 * Shared with the phone's tab bar so the badge on the rail's drawer tab and
 * the badge in the rail itself can never disagree. Reads the cached header
 * hook — no request of its own.
 */
const READ_IDS_KEY = "read_notification_ids";

/** Which announcements this device has already opened. */
function subscribeToReadIds(onChange: () => void) {
  window.addEventListener("nav-notifications-read", onChange);
  // Another tab of the same app reading a notification counts too.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("nav-notifications-read", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The stored ids as the raw string, deliberately.
 *
 * `useSyncExternalStore` compares snapshots by identity, so parsing here would
 * hand it a fresh array on every read and spin. The string is stable until the
 * storage actually changes; it is parsed once, below.
 */
function readIdsSnapshot(): string {
  try {
    return localStorage.getItem(READ_IDS_KEY) ?? "[]";
  } catch {
    // Storage unavailable: everything simply counts as unread.
    return "[]";
  }
}

/**
 * What this device calls installing, read once and never changing.
 *
 * The answer lives in `navigator`, which server rendering does not have and
 * hydration begins without, so it is read through `useSyncExternalStore` — the
 * server and the first client pass get "Install the app", and React re-renders
 * with the real label the moment the browser's own answer is available. There
 * is nothing to subscribe to: a device does not change what its menu is called
 * while the page is open.
 */
const subscribeToNothing = () => () => {};
const installLabelOnServer = () => "Install the app";
/** Whether the app is already installed, read the same way: an app window
    says so in `navigator`, and the server cannot see it. */
const installedOnServer = () => false;

export function useUnreadNotifications(): number {
  const { announcements, notifications } = useHeaderData();
  const stored = useSyncExternalStore(subscribeToReadIds, readIdsSnapshot, () => "[]");

  const readIds = (() => {
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? (parsed as number[]) : [];
    } catch {
      return [];
    }
  })();

  const unreadServer = notifications.filter((n) => !n.read).length;
  const unreadAnnouncements = announcements.filter((n) => !readIds.includes(n.id)).length;
  return unreadServer + unreadAnnouncements;
}

/**
 * The member's identity controls, sitting at the right end of the top bar.
 *
 * This is the bell, the accessibility menu and the account menu — everything
 * the bar carries that is *not* navigation. The colour mode is not here: it
 * follows the device by default and is chosen on My Profile, so the bar no
 * longer spends a control on it. The rail owns the map, so these are the only
 * things that ever load a page from here: the member's own profile and its
 * givings, and the console for staff.
 *
 * Installing the app is an action on the account rather than a place, so it
 * rides inside the account menu beside the member's own pages instead of
 * taking a tile of its own in the bar — and the same menu is what a phone and
 * a PC both open, where a bare control in the bar could only ever serve one
 * of them.
 */
export function NavIdentity() {
  const router = useRouter();
  const { me, hasToken, announcements, notifications } = useHeaderData();
  const roles = Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"];
  const isStaff = isStaffRole(roles);
  const isLoggedIn = hasToken;

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pushState, setPushState] = useState<PushSupport | null>(null);
  // What this device calls installing: "Install the app" where the browser
  // raises its own prompt, "Add to Home Screen" on iOS and macOS Safari, which
  // have no prompt to raise.
  const installLabel = useSyncExternalStore(subscribeToNothing, pwaInstallLabel, installLabelOnServer);
  // The installed app has nothing to install, so the row is not offered there.
  const appInstalled = useSyncExternalStore(subscribeToNothing, isPwaInstalled, installedOnServer);
  const unreadCount = useUnreadNotifications();
  const controlsRef = useRef<HTMLDivElement>(null);

  // Whether this device can take browser notifications, re-registering the
  // subscription it already holds first. A device whose endpoint the browser
  // rotated (or whose row the server dropped as dead) is silently out of reach
  // otherwise: the app would keep saying notifications are on while nothing
  // arrives. Only asked once per sign-in; a stale reading while signed out is
  // harmless because every consumer also guards on the signed-in state.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    syncPushSubscription()
      .then(() => getPushState())
      .then((state) => {
        if (!cancelled) setPushState(state);
      })
      .catch(() => {
        if (!cancelled) setPushState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  // A member who has not turned notifications on gets one gentle ask per
  // sign-in session, a moment after the page settles. Three doors: turn on,
  // not now (asked again next session), or never (they configure it later in
  // their profile's Notification preferences). Blocked at the browser level
  // already? Asking again would be rude — skip silently.
  const askedThisSession = useRef(false);
  useEffect(() => {
    if (!isLoggedIn || !pushState) return;
    if (!pushState.supported || pushState.enabled) return;
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
    try {
      if (localStorage.getItem("push_prompt_dismissed") === "true") return;
    } catch {
      // Storage unavailable: still ask once, politely.
    }
    if (askedThisSession.current) return;
    askedThisSession.current = true;
    const timer = setTimeout(() => {
      Swal.fire({
        title: "Notifications on this device?",
        text: "Turn on notifications and the church can reach you on this device even with the app closed. You can change this anytime under Notification preferences on your profile.",
        icon: "question",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: "Turn on",
        confirmButtonColor: brand.ember,
        denyButtonText: "Don't ask again",
        denyButtonColor: brand.grayui,
        cancelButtonText: "Not now",
        cancelButtonColor: brand.bark,
        // The permission request must ride the click's user gesture, so the
        // enable happens inside preConfirm rather than after the dialog.
        preConfirm: () => enablePush(),
      }).then((result) => {
        if (result.isConfirmed) {
          const outcome = result.value as { ok: boolean; error?: string } | undefined;
          if (outcome?.ok) {
            setPushState({ supported: true, enabled: true });
            showAlert("Notifications on", "You will now be alerted on this device when something needs you.", "success");
          } else {
            showAlert("Not enabled", outcome?.error || "This browser would not allow notifications.", "warning");
          }
        } else if (result.isDenied) {
          try {
            localStorage.setItem("push_prompt_dismissed", "true");
          } catch {
            // ignore
          }
        }
        // "Not now": nothing stored — we simply ask again next session.
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [isLoggedIn, pushState]);

  // Clicking away closes whichever panel is open.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // A notification tapped while the app is already open asks this tab to move.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "push-navigate" && event.data.link) router.push(event.data.link);
      // The worker renewed a subscription the browser had rotated: hand the
      // replacement to the server, or this device goes quiet from here on.
      if (event.data?.type === "push-resubscribe" && event.data.subscription) {
        postPushSubscription(event.data.subscription as PushSubscription).catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  /**
   * Mark exactly these notifications read — the ones the member opened, or
   * the one they pressed "Mark as read" on.
   *
   * The bell used to sweep every unread row into read the moment the panel
   * opened, which left the member no way to keep an item waiting: the badge
   * cleared itself whether or not anything was acted on. Reading is now a
   * choice per row, so `ids` is always the rows the member chose.
   */
  const markNotificationsRead = (ids: number[]) => {
    if (ids.length === 0) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    markCachedNotificationsRead(ids);
    fetch(`${API_URL}/api/members/notifications/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  };

  /** Open where the member can act on a notification, and read it on the way. */
  const openNotification = (notification: ChurchNotificationItem) => {
    markNotificationsRead([notification.id]);
    setShowNotifications(false);
    if (!notification.link) return;
    // Most destinations are in-app paths; a few older notices carry the whole
    // site address, which `router.push` would treat as a route of this app.
    if (/^https?:\/\//i.test(notification.link)) {
      window.location.assign(notification.link);
      return;
    }
    router.push(notification.link);
  };

  /** An announcement opens the board it was posted on, and stops counting. */
  const openAnnouncement = (id: number, href = "/announcements") => {
    try {
      const stored = localStorage.getItem(READ_IDS_KEY);
      const read: number[] = stored ? JSON.parse(stored) : [];
      localStorage.setItem(READ_IDS_KEY, JSON.stringify(Array.from(new Set([...read, id]))));
      window.dispatchEvent(new Event("nav-notifications-read"));
    } catch {
      // Storage unavailable: the badge simply stays until the next visit.
    }
    setShowNotifications(false);
    router.push(href);
  };

  const openNotifications = () => {
    const next = !showNotifications;
    setShowNotifications(next);
    setShowUserMenu(false);
    if (!next) return;
    if (announcements.length > 0) {
      try {
        const stored = localStorage.getItem("read_notification_ids");
        const read: number[] = stored ? JSON.parse(stored) : [];
        const updated = Array.from(new Set([...read, ...announcements.map((n) => n.id)]));
        localStorage.setItem("read_notification_ids", JSON.stringify(updated));
        window.dispatchEvent(new Event("nav-notifications-read"));
      } catch {
        // Storage unavailable: the badge simply stays until the next visit.
      }
    }
  };

  const signOut = () => {
    clearSession();
    resetHeaderSession();
    setPushState(null);
    setShowUserMenu(false);
    router.push("/login");
    router.refresh();
  };

  /**
   * The bar's buttons: one size, one shape, icons only.
   *
   * The bar is `bark`, so they are the ghost tiles the phone's tab bar and the
   * marketing header use on dark chrome — white ink on a light wash — rather
   * than the white cards they were on the old light bar.
   */
  const barButton =
    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20 focus:outline-none";

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 rounded-xl bg-ember px-3.5 py-2 text-xs font-bold text-white transition hover:bg-ember-dark"
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </Link>
    );
  }

  return (
    <div ref={controlsRef} className="flex items-center gap-1.5">
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={openNotifications}
            className={barButton}
            aria-label="Notifications"
            aria-expanded={showNotifications}
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {/* The badge rings in `sand-card`, the surface of the button it
                cuts out of, so it sits correctly in either theme. */}
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold leading-none text-white ring-2 ring-bark">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            /* A phone pins the panel to the screen rather than to the bell:
               anchored to the button it hung off the left edge, because the
               bell sits near the right of the bar and the panel is wider
               than the room beside it. From `sm` up it is the bell's own
               dropdown again, hanging under it on the right. */
            <div className="fixed left-2 right-2 top-[4.25rem] z-50 max-h-[calc(100dvh-5.5rem)] space-y-3 overflow-y-auto rounded-2xl border border-sand-line bg-white p-4 text-slate-900 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-96 sm:max-w-[calc(100vw-2rem)] sm:overflow-visible">
              {/* A little wider than the old panel, so a notice reads as a
                  notice rather than a headline: four lines of text fit, and
                  the whole of it is still on the row's own title. */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-bark">Notifications</span>
                  {announcements.length + notifications.length > 0 && (
                    <span className="rounded-full bg-bark/10 px-2 py-0.5 text-[10px] font-bold text-bark">
                      {announcements.length + notifications.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                  aria-label="Close notifications"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* The list, not the panel, is what scrolls: the panel takes the
                  height its rows need up to most of the screen, so a member
                  with three notices reads them without scrolling a window the
                  size of two. */}
              <div className="max-h-[min(60dvh,28rem)] space-y-2 overflow-y-auto">
                {notifications.length > 0 && (
                  <div className="space-y-2">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-xl border bg-sand p-2.5 transition ${
                          n.read ? "border-slate-200/70" : "border-ember/40 ring-1 ring-ember/20"
                        }`}
                      >
                        {/* The notice itself is the door: pressing it opens the
                            page the member can act on, and reads it on the
                            way. The whole message stays on the title, for the
                            one that runs past the four lines shown. */}
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
                          title={n.message}
                          className="flex w-full items-start gap-2.5 rounded-lg text-left transition hover:bg-white/70"
                        >
                          <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                          <div className="min-w-0 flex-1">
                            <strong className="block truncate text-xs text-bark" title={n.title}>
                              {n.title}
                            </strong>
                            <p className="mt-0.5 line-clamp-4 text-[11px] leading-4 text-slate-500">{n.message}</p>
                          </div>
                          {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ember" />}
                        </button>
                        <div className="mt-1.5 flex items-center justify-end gap-1.5 border-t border-slate-200/60 pt-1.5">
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => markNotificationsRead([n.id])}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-500 transition hover:bg-white hover:text-bark"
                            >
                              <Check className="h-3 w-3" aria-hidden="true" /> Mark as read
                            </button>
                          )}
                          {n.link && (
                            <button
                              type="button"
                              onClick={() => openNotification(n)}
                              className="inline-flex items-center gap-0.5 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-ember transition hover:bg-ember hover:text-white"
                            >
                              Open <ChevronRight className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {announcements.length > 0 && notifications.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Announcements</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
                {announcements.length > 0 ? (
                  announcements.map((ann) => {
                    const text = ann.text || ann.detail || "New church announcement posted.";
                    return (
                      <div
                        key={ann.id}
                        className="rounded-xl border border-slate-200/70 bg-slate-50 p-2.5 transition"
                      >
                        <button
                          type="button"
                          onClick={() => openAnnouncement(ann.id)}
                          title={text}
                          className="flex w-full items-start gap-2.5 rounded-lg text-left transition hover:bg-slate-100/70"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                          <div className="min-w-0 flex-1">
                            <strong className="block truncate text-xs text-bark" title={ann.title}>
                              {ann.title}
                            </strong>
                            <p className="mt-0.5 line-clamp-4 text-[11px] leading-4 text-slate-500">{text}</p>
                          </div>
                        </button>
                        <div className="mt-1.5 flex items-center justify-end border-t border-slate-200/60 pt-1.5">
                          <button
                            type="button"
                            onClick={() => openAnnouncement(ann.id)}
                            className="inline-flex items-center gap-0.5 rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-ember transition hover:bg-ember hover:text-white"
                          >
                            Read <ChevronRight className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  notifications.length === 0 && (
                    <div className="py-4 text-center text-xs text-slate-500">No new notifications at this time.</div>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        <AccessibilityMenu buttonClassName={barButton} />
      </div>

      {/* The account control: who you are, and the way out. The name rides
          beside the avatar while there is room for it, and the avatar alone
          on a phone. */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowUserMenu(!showUserMenu);
            setShowNotifications(false);
          }}
          className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-1 pr-1 text-white transition hover:bg-white/20 sm:pr-3"
          aria-expanded={showUserMenu}
        >
          {me?.photo_url ? (
            // The member's own picture once one is chosen; the initial below
            // is the fallback — a photo-less account never shows a broken
            // image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveAttachmentUrl(me.photo_url)}
              alt=""
              className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ember text-xs font-bold text-white">
              {(me?.name || me?.username || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="hidden min-w-0 max-w-40 text-left sm:block">
            <span className="block truncate text-xs font-semibold text-white">{me?.name || me?.username}</span>
            <span className="block truncate text-[10px] text-white/70">{me?.email || `@${me?.username}`}</span>
          </span>
        </button>

        {showUserMenu && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-sand-line bg-white p-4 text-slate-900 shadow-2xl">
            <div className="space-y-1">
              {accountMenuKeys
                .filter(({ staffOnly, key }) => {
                  if (!staffOnly) return true;
                  // An office entry answers to its destination's own
                  // audience, not just to "any staff": Administration keeps
                  // its console roles (administrator and clerk), so an
                  // elder — who holds every desk but not the console — reads
                  // the menu without it.
                  if (!isStaff) return false;
                  const audience = destinationOf(key).audience;
                  return !audience || audience.some((role) => roles.includes(role));
                })
                .map(({ key }) => {
                  const dest = destinationOf(key);
                  const Icon = dest.icon;
                  return (
                    <Link
                      key={key}
                      href={dest.href}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-slate-500" />
                        {dest.label}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
                  );
                })}

              {/* Installing the app is an action, not a page, so it is a row
                  of its own in the list rather than a destination. The menu
                  closes first: the browser's own install prompt (or, where
                  there is none, the how-to alert) is the thing to read, not
                  a popover hanging over it. Inside the installed app the row
                  is left out entirely — there is nothing there to install. */}
              {!appInstalled && (
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    triggerPwaInstall();
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <span className="flex items-center gap-2.5">
                    <Download className="h-4 w-4 text-slate-500" />
                    {installLabel}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </button>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
