"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
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
import { ThemeToggle } from "./theme-toggle";
import { triggerPwaInstall } from "./pwa-register";
import { accountMenuKeys, destinationOf, isStaffRole } from "@/config/navigation";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { clearSession } from "@/lib/auth";
import { disablePush, enablePush, getPushState, PushSupport } from "@/lib/push";
import {
  markCachedNotificationsRead,
  patchCachedMe,
  resetHeaderSession,
  useHeaderData,
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
 * This is the bell, the theme switch, the accessibility menu, install and the
 * account menu — everything the bar carries that is *not* navigation. The rail
 * owns the map, so these are the only three things that ever load a page: the
 * member's own account, the calendar, and the console for staff.
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
  const unreadCount = useUnreadNotifications();
  const controlsRef = useRef<HTMLDivElement>(null);

  const announcePrefs = me ? { email: me.announce_email, push: me.announce_push } : null;

  // Whether this device can take browser notifications. Only asked once per
  // sign-in; a stale reading while signed out is harmless because every
  // consumer also guards on the signed-in state.
  useEffect(() => {
    if (!isLoggedIn) return;
    getPushState().then(setPushState).catch(() => setPushState(null));
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
        text: "Turn on notifications and the church can reach you on this device even with the app closed — announcements, and requests waiting for your office if you serve. You can change this anytime under Notification preferences on your profile.",
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
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  const updateAnnouncePref = (field: "email" | "push", value: boolean) => {
    if (!announcePrefs) return;
    patchCachedMe(field === "email" ? { announce_email: value } : { announce_push: value });
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch(`${API_URL}/api/members/me/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ [field === "email" ? "announce_email" : "announce_push"]: value }),
    }).catch(() => {});
  };

  const markServerNotificationsRead = () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    markCachedNotificationsRead(unread.map((n) => n.id));
    fetch(`${API_URL}/api/members/notifications/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unread.map((n) => n.id) }),
    }).catch(() => {});
  };

  const openNotifications = () => {
    const next = !showNotifications;
    setShowNotifications(next);
    setShowUserMenu(false);
    if (!next) return;
    markServerNotificationsRead();
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

  const toggleDeviceNotifications = async () => {
    if (!pushState?.supported) return;
    if (pushState.enabled) {
      await disablePush();
      setPushState({ supported: true, enabled: false });
      return;
    }
    const result = await enablePush();
    if (result.ok) {
      setPushState({ supported: true, enabled: true });
      showAlert("Notifications on", "You will now be alerted on this device when something needs you.", "success");
    } else {
      showAlert("Not enabled", result.error || "This browser would not allow notifications.", "warning");
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
        {/* The light/dark switch leads the controls: the member's own display
            choice comes before everything the church sends them. */}
        <ThemeToggle className={barButton} />

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
            <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-sand-line bg-white p-4 text-slate-900 shadow-2xl">
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

              <div className="max-h-72 space-y-2 overflow-y-auto">
                {notifications.length > 0 && (
                  <div className="space-y-2">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          markServerNotificationsRead();
                          setShowNotifications(false);
                          if (n.link) router.push(n.link);
                        }}
                        className={`flex w-full items-start gap-2.5 rounded-xl border bg-sand p-2.5 text-left transition ${
                          n.read ? "border-slate-200/70 hover:bg-slate-100/70" : "border-ember/40 ring-1 ring-ember/20"
                        }`}
                      >
                        <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-xs text-bark">{n.title}</strong>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{n.message}</p>
                        </div>
                        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ember" />}
                      </button>
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
                  announcements.map((ann) => (
                    <div
                      key={ann.id}
                      className="flex items-start gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50 p-2.5 transition hover:bg-slate-100/70"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-xs text-bark">{ann.title}</strong>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">
                          {ann.text || ann.detail || "New church announcement posted."}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  notifications.length === 0 && (
                    <div className="py-4 text-center text-xs text-slate-500">No new notifications at this time.</div>
                  )
                )}
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-2">
                {pushState?.supported && (
                  <button
                    type="button"
                    onClick={toggleDeviceNotifications}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      pushState.enabled
                        ? "border-sand-line bg-white text-moss hover:bg-sand"
                        : "border-ember bg-ember text-white hover:bg-ember-dark"
                    }`}
                  >
                    {pushState.enabled ? "Turn off notifications" : "Turn on notifications"}
                  </button>
                )}
                {announcePrefs && (
                  <div className="space-y-1.5 rounded-xl bg-sand p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-moss">Announcements reach me by</p>
                    <label className="flex cursor-pointer items-center justify-between text-xs text-bark">
                      <span>Email</span>
                      <input
                        type="checkbox"
                        checked={announcePrefs.email}
                        onChange={(e) => updateAnnouncePref("email", e.target.checked)}
                        className="h-3.5 w-3.5 accent-sage"
                      />
                    </label>
                    {pushState?.supported && (
                      <label className="flex cursor-pointer items-center justify-between text-xs text-bark">
                        <span>Notifications</span>
                        <input
                          type="checkbox"
                          checked={announcePrefs.push}
                          onChange={(e) => updateAnnouncePref("push", e.target.checked)}
                          className="h-3.5 w-3.5 accent-sage"
                        />
                      </label>
                    )}
                    <p className="text-[10px] text-slate-400">
                      Requests for the office always notify, whatever you switch off here.
                    </p>
                  </div>
                )}
                <Link
                  href="/announcements"
                  onClick={() => setShowNotifications(false)}
                  className="block text-center text-xs font-semibold text-ember hover:underline"
                >
                  View All Announcements &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

        <AccessibilityMenu buttonClassName={barButton} />

        <button
          type="button"
          onClick={triggerPwaInstall}
          title="Install the app"
          aria-label="Install the app"
          className={`${barButton} hidden sm:flex`}
        >
          <Download className="h-4 w-4 text-ember" />
        </button>
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
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ember text-xs font-bold text-white">
            {(me?.name || me?.username || "?").charAt(0).toUpperCase()}
          </span>
          <span className="hidden min-w-0 max-w-40 text-left sm:block">
            <span className="block truncate text-xs font-semibold text-white">{me?.name || me?.username}</span>
            <span className="block truncate text-[10px] text-white/70">{me?.email || `@${me?.username}`}</span>
          </span>
        </button>

        {showUserMenu && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-sand-line bg-white p-4 text-slate-900 shadow-2xl">
            <div className="space-y-1">
              {accountMenuKeys
                .filter(({ staffOnly }) => !staffOnly || isStaff)
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
