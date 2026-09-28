"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users,
  Home,
  BookOpen,
  CircleDollarSign,
  Church,
  Info,
  Bell,
  User as UserIcon,
  LogOut,
  LogIn,
  ShieldCheck,
  HeartHandshake,
  ChevronRight,
  CheckCircle2,
  Calendar,
  X,
  UserPlus,
  Download,
  Inbox
} from "lucide-react";
import { AccessibilityMenu } from "./accessibility-menu";
import { triggerPwaInstall } from "./pwa-register";
import { disablePush, enablePush, getPushState, PushSupport } from "@/lib/push";
import { showAlert } from "@/lib/alerts";
import Swal from "sweetalert2";
import { normalizePath } from "@/lib/paths";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const staffRoles = [
  "admin",
  "clerk",
  "elder",
  "youth_leader",
  "choir_director",
  "children_ministry",
  "men_ministry",
  "women_ministry",
  "chaplaincy",
  "treasurer"
];

interface AnnouncementItem {
  id: number;
  title: string;
  text?: string;
  detail?: string;
  created_at?: string;
}

/** A server-pushed notification (e.g. a join request waiting for the office). */
interface ChurchNotificationItem {
  id: number;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: string;
}

export function SiteNav({ navigationLocked = false }: { navigationLocked?: boolean } = {}) {
  // Normalised once, here: the build's trailing slash makes every exact-path
  // comparison below answer no if left as the hook returns it.
  const pathname = normalizePath(usePathname());
  const router = useRouter();

  // On the surfaces that are read by scrolling — the dashboard, the
  // announcements feed and the live reports board — the tab bar steps out of
  // the way on the way down and comes straight back on any upward movement,
  // so a long read gets the whole screen without stranding anyone. Elsewhere
  // the bar stays put.
  const navHidesOnScroll =
    pathname === "/dashboard" ||
    pathname.startsWith("/announcements") ||
    pathname === "/support/reports";
  const [navHidden, setNavHidden] = useState(false);

  useEffect(() => {
    if (!navHidesOnScroll) {
      setNavHidden(false);
      return;
    }
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const moved = y - lastY;
      lastY = y;
      // Near the top the bar is always shown, whatever the last movement was:
      // this is what brings it back if the reader arrives here by a route the
      // deltas below ignored.
      if (y <= 64) {
        setNavHidden(false);
        return;
      }
      // A few pixels of jitter (rubber-banding, a collapsing URL bar) is not a
      // scroll: without this the bar flickers while the page settles.
      if (Math.abs(moved) < 8) return;
      setNavHidden(moved > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [navHidesOnScroll]);

  const [userState, setUserState] = useState<{
    isLoggedIn: boolean;
    role: string;
    roles: string[];
    username: string;
    name: string;
    email: string;
  }>({
    isLoggedIn: false,
    role: "",
    roles: [],
    username: "",
    name: "",
    email: "",
  });

  const [notifications, setNotifications] = useState<AnnouncementItem[]>([]);
  const [serverNotifications, setServerNotifications] = useState<ChurchNotificationItem[]>([]);
  const [pushState, setPushState] = useState<PushSupport | null>(null);
  const [announcePrefs, setAnnouncePrefs] = useState<{ email: boolean; push: boolean } | null>(null);
  const pushPromptShown = useRef(false);
  const [readNotificationIds, setReadNotificationIds] = useState<number[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const controlsRef = useRef<HTMLDivElement>(null);

  // Load read notification IDs from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("read_notification_ids");
        if (stored) {
          setReadNotificationIds(JSON.parse(stored));
        }
      } catch {
        // ignore JSON parse error
      }
    }
  }, []);

  // Load user data on route change
  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token) {
        // Flip the brand link to the dashboard immediately on mount, so the
        // first click never races the profile fetch below.
        setUserState((prev) => ({ ...prev, isLoggedIn: true }));
        fetch(`${API_URL}/api/members/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) {
              const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ");
              setUserState({
                isLoggedIn: true,
                role: data.role || "member",
                roles: Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : [data.role || "member"],
                username: data.username || "Member",
                name: fullName || data.username || "Member",
                email: data.email || "",
              });
            } else {
              setUserState({
                isLoggedIn: false,
                role: "",
                roles: [],
                username: "",
                name: "",
                email: "",
              });
            }
          })
          .catch(() => {
            setUserState({
              isLoggedIn: false,
              role: "",
              roles: [],
              username: "",
              name: "",
              email: "",
            });
          });
      } else {
        setUserState({
          isLoggedIn: false,
          role: "",
          roles: [],
          username: "",
          name: "",
          email: "",
        });
      }
    }
  }, [pathname]);

  // Load announcements / notifications
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setNotifications(data.slice(0, 5));
        }
      })
      .catch(() => setNotifications([]));
  }, [pathname]);

  // Load personal notifications (requests waiting on this office holder).
  // Anonymous visitors get nothing — the bell simply shows announcements.
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setServerNotifications([]);
      return;
    }
    fetch(`${API_URL}/api/members/notifications/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        setServerNotifications(Array.isArray(data) ? data.slice(0, 8) : []);
      })
      .catch(() => setServerNotifications([]));
  }, [pathname]);

  // Whether this device can take phone notifications (and whether they're on),
  // plus the member's announcement channel preferences. Only asked once signed
  // in — the bell gains its toggles for signed-in users.
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setPushState(null);
      setAnnouncePrefs(null);
      return;
    }
    getPushState().then(setPushState).catch(() => setPushState(null));
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAnnouncePrefs({ email: !!data.announce_email, push: !!data.announce_push });
      })
      .catch(() => setAnnouncePrefs(null));
  }, [pathname, userState.isLoggedIn]);

  const updateAnnouncePref = (field: "email" | "push", value: boolean) => {
    if (!announcePrefs) return;
    const apiField = field === "email" ? "announce_email" : "announce_push";
    setAnnouncePrefs({ ...announcePrefs, [field]: value });
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch(`${API_URL}/api/members/me/`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ [apiField]: value }),
    }).catch(() => {});
  };

  // A member who has not turned notifications on gets one gentle ask per
  // sign-in session, a moment after the page settles. Three doors: turn on,
  // not now (asked again next session), or never (they configure it later in
  // their profile's Notification preferences). Blocked at the browser level
  // already? Asking again would be rude — skip silently.
  useEffect(() => {
    if (!userState.isLoggedIn || !pushState) return;
    if (!pushState.supported || pushState.enabled) return;
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
    try {
      if (localStorage.getItem("push_prompt_dismissed") === "true") return;
    } catch {
      // Storage unavailable: still ask once, politely.
    }
    if (pushPromptShown.current) return;
    pushPromptShown.current = true;
    const timer = setTimeout(() => {
      Swal.fire({
        title: "Notifications on this device?",
        text: "Turn on phone notifications and the church can reach you here even with the app closed — announcements, and requests waiting for your office if you serve. You can change this anytime under Notification preferences on your profile.",
        icon: "question",
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: "Turn on",
        confirmButtonColor: "#b36b3c",
        denyButtonText: "Don't ask again",
        denyButtonColor: "#6b7280",
        cancelButtonText: "Not now",
        cancelButtonColor: "#26352f",
        // The permission request must ride the click's user gesture, so the
        // enable happens inside preConfirm rather than after the dialog.
        preConfirm: () => enablePush(),
      }).then((result) => {
        if (result.isConfirmed) {
          const outcome = result.value as { ok: boolean; error?: string } | undefined;
          if (outcome?.ok) {
            setPushState({ supported: true, enabled: true });
            showAlert("Phone notifications on", "You will now be alerted on this device when something needs you.", "success");
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
  }, [userState.isLoggedIn, pushState]);

  const handleTogglePhoneNotifications = async () => {
    if (!pushState?.supported) return;
    if (pushState.enabled) {
      await disablePush();
      setPushState({ supported: true, enabled: false });
      return;
    }
    const result = await enablePush();
    if (result.ok) {
      setPushState({ supported: true, enabled: true });
      showAlert("Phone notifications on", "You will now be alerted on this device when a request is waiting for the office.", "success");
    } else {
      showAlert("Not enabled", result.error || "This browser would not allow notifications.", "warning");
    }
  };

  // A notification tapped while the app is already open asks this tab to navigate.
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "push-navigate" && event.data.link) {
        router.push(event.data.link);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  const unreadServerNotifications = serverNotifications.filter((n) => !n.read);

  const markServerNotificationsRead = () => {
    const unread = serverNotifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    // Optimistic flip so the dot clears at once; a failed POST just means the
    // dot returns on the next load — never worth blocking the popover for.
    setServerNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    fetch(`${API_URL}/api/members/notifications/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unread.map((n) => n.id) }),
    }).catch(() => {});
  };

  const handleToggleNotifications = () => {
    const nextShow = !showNotifications;
    setShowNotifications(nextShow);
    setShowUserMenu(false);

    if (nextShow) {
      markServerNotificationsRead();
      if (notifications.length > 0) {
        const updated = Array.from(new Set([...readNotificationIds, ...notifications.map((n) => n.id)]));
        setReadNotificationIds(updated);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("read_notification_ids", JSON.stringify(updated));
          } catch {
            // ignore
          }
        }
      }
    }
  };

  // The bell's badge: everything the popover would call unread — personal
  // notifications the server still marks unread, plus announcements not yet
  // opened on this device.
  const unreadAnnouncements = notifications.filter((n) => !readNotificationIds.includes(n.id)).length;
  const unreadCount = unreadServerNotifications.length + unreadAnnouncements;
  const hasUnread = unreadCount > 0;

  // Click outside to close popovers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      // Privacy on shared devices: signing out always closes the giving
      // record, so the next person never inherits it revealed (the give
      // page writes this key when the eye is opened).
      localStorage.removeItem("my_givings_visible");
    }
    setUserState({
      isLoggedIn: false,
      role: "",
      roles: [],
      username: "",
      name: "",
      email: "",
    });
    setShowUserMenu(false);
    router.push("/login");
    router.refresh();
  };

  const isStaff = userState.roles.length > 0 ? userState.roles.some((r) => staffRoles.includes(r)) : staffRoles.includes(userState.role);

  // Desktop navigation items
  const desktopNavItems = [
    ...(userState.isLoggedIn
      ? [{ href: "/dashboard", label: "Dashboard", active: pathname.startsWith("/dashboard") }]
      : []),
    {
      href: "/announcements",
      label: "Fellowship",
      active: pathname.startsWith("/share") || pathname.startsWith("/spiritual") || pathname.startsWith("/announcements"),
    },
    { href: "/materials", label: "Materials", active: pathname.startsWith("/materials") },
    { href: "/give", label: "Giving", active: pathname.startsWith("/support") || pathname.startsWith("/give") },
    { href: "/about", label: "About", active: pathname.startsWith("/about") },
    ...(isStaff
      ? [
          {
            href: "/administration",
            label: "Admin",
            active: pathname.startsWith("/administration"),
          },
        ]
      : []),
  ];

  // Mobile bottom tab navigation items, in the order a member moves through the
  // app on a phone: home, the fellowship hub, study materials, then giving.
  //
  // These point at the same *app* destinations the desktop bar uses, not at the
  // public website's hubs: the Giving tab has always opened /support, while
  // Fellowship and Requests used to open /share and /requests — marketing pages
  // a member had no reason to see from the app's own tab bar, and a different
  // place from where the same label took them on a laptop. The public website
  // still links its own hubs from the marketing header.
  const mobileBottomNavItems = [
    {
      // Same destination as the header logo: a signed-in member lands on their
      // dashboard, everyone else on the public home page. Going home replaces
      // the current entry instead of stacking, so back from home does not
      // replay every page tapped since.
      href: userState.isLoggedIn ? "/dashboard" : "/",
      label: "Home",
      icon: Home,
      active: pathname === "/" || pathname.startsWith("/dashboard"),
      replace: true,
    },
    {
      href: "/fellowship",
      label: "Fellowship",
      icon: Users,
      active: pathname.startsWith("/fellowship") || pathname.startsWith("/share") || pathname.startsWith("/spiritual") || pathname.startsWith("/announcements") || pathname.startsWith("/services"),
    },
    {
      href: "/materials",
      label: "Materials",
      icon: BookOpen,
      active: pathname.startsWith("/materials"),
    },
    {
      href: "/support",
      label: "Giving",
      icon: CircleDollarSign,
      active: pathname.startsWith("/support") || pathname.startsWith("/give"),
    },
    // About moved into the user menu; the office reaches its console from the
    // tab bar instead.
    ...(isStaff
      ? [
          {
            href: "/administration",
            label: "Admin",
            icon: ShieldCheck,
            active: pathname.startsWith("/administration"),
          },
        ]
      : []),
  ];

  return (
    <>
      {/* Top 100% Full-Width Header Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#26352f] border-b border-white/10 shadow-md text-white px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left: Church Banner / Logo & Church Name */}
        <Link href={userState.isLoggedIn ? "/dashboard" : "/"} className="flex items-center gap-2.5 sm:gap-3 group shrink-0 min-w-0">
          <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 flex items-center justify-center rounded-xl bg-white/10 p-1 border border-white/15">
            <Image
              src="/adventist-symbol.svg"
              alt="SDA Church Emblem"
              width={36}
              height={36}
              className="h-full w-auto object-contain"
              priority
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-white text-sm sm:text-base tracking-tight leading-tight truncate">
              SDA Church
            </span>
            <span className="text-white/75 text-[11px] sm:text-xs leading-tight truncate">
              Loma Linda
            </span>
          </div>
        </Link>

        {/* Center: Desktop Navigation Menu */}
        <nav hidden={navigationLocked} className="hidden md:flex items-center gap-1 lg:gap-1.5" aria-label="Main navigation">
          {desktopNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-1.5 text-xs lg:text-sm font-medium transition ${
                item.active
                  ? "bg-white/15 text-white font-semibold shadow-xs"
                  : "text-white/80 hover:bg-white/10 hover:text-[#f1c89e]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right: Accessibility, Notifications & User Account Controls */}
        <div ref={controlsRef} hidden={navigationLocked} className="flex items-center gap-2 sm:gap-3 relative shrink-0">

          {/* Accessibility Settings & Options Menu */}
          <AccessibilityMenu />

          {/* Notifications Icon Button */}
          <div className="relative">
            <button
              type="button"
              onClick={handleToggleNotifications}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 border border-white/15 focus:outline-none"
              title="Notifications & Announcements"
              aria-label="Notifications"
            >
              <Bell className="w-4.5 h-4.5" />
              {hasUnread && (
                <span
                  className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#b36b3c] px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#26352f]"
                  aria-label={`${unreadCount > 9 ? "9+" : unreadCount} unread notifications`}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Popover Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-[#dfdbd1] shadow-2xl p-4 z-50 text-slate-900 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#26352f]">Notifications</span>
                    {notifications.length + serverNotifications.length > 0 && (
                      <span className="text-[10px] bg-[#26352f]/10 text-[#26352f] font-bold px-2 py-0.5 rounded-full">
                        {notifications.length + serverNotifications.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {serverNotifications.length > 0 && (
                    <div className="space-y-2">
                      {serverNotifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            markServerNotificationsRead();
                            setShowNotifications(false);
                            if (n.link) router.push(n.link);
                          }}
                          className={`w-full text-left bg-[#f7f4ee] p-2.5 rounded-xl border transition flex items-start gap-2.5 ${
                            n.read ? "border-slate-200/70 hover:bg-slate-100/70" : "border-[#b36b3c]/40 ring-1 ring-[#b36b3c]/20"
                          }`}
                        >
                          <Inbox className="w-4 h-4 text-[#b36b3c] shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <strong className="text-xs text-[#26352f] block truncate">{n.title}</strong>
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{n.message}</p>
                          </div>
                          {!n.read && <span className="h-2 w-2 rounded-full bg-[#b36b3c] shrink-0 mt-1.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {notifications.length > 0 && serverNotifications.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Announcements</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                  {notifications.length > 0 || serverNotifications.length > 0 ? (
                    notifications.map((ann) => (
                      <div
                        key={ann.id}
                        className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 hover:bg-slate-100/70 transition flex items-start gap-2.5"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#b36b3c] shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <strong className="text-xs text-[#26352f] block truncate">
                            {ann.title}
                          </strong>
                          <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                            {ann.text || ann.detail || "New church announcement posted."}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-xs text-slate-500">
                      No new notifications at this time.
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  {pushState?.supported && userState.isLoggedIn && (
                    <button
                      type="button"
                      onClick={handleTogglePhoneNotifications}
                      className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                        pushState.enabled
                          ? "border-[#dfdbd1] bg-white text-[#617068] hover:bg-[#f7f4ee]"
                          : "border-[#b36b3c] bg-[#b36b3c] text-white hover:bg-[#96552e]"
                      }`}
                    >
                      {pushState.enabled ? "Turn off phone notifications" : "Turn on phone notifications"}
                    </button>
                  )}
                  {announcePrefs && (
                    <div className="rounded-xl bg-[#f7f4ee] p-2.5 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#617068]">Announcements reach me by</p>
                      <label className="flex items-center justify-between text-xs text-[#26352f] cursor-pointer">
                        <span>Email</span>
                        <input
                          type="checkbox"
                          checked={announcePrefs.email}
                          onChange={(e) => updateAnnouncePref("email", e.target.checked)}
                          className="h-3.5 w-3.5 accent-[#5f8067]"
                        />
                      </label>
                      {pushState?.supported && (
                        <label className="flex items-center justify-between text-xs text-[#26352f] cursor-pointer">
                          <span>Phone notification</span>
                          <input
                            type="checkbox"
                            checked={announcePrefs.push}
                            onChange={(e) => updateAnnouncePref("push", e.target.checked)}
                            className="h-3.5 w-3.5 accent-[#5f8067]"
                          />
                        </label>
                      )}
                      <p className="text-[10px] text-slate-400">Requests for the office always notify, whatever you switch off here.</p>
                    </div>
                  )}
                  <Link
                    href="/announcements"
                    onClick={() => setShowNotifications(false)}
                    className="block text-center text-xs font-semibold text-[#b36b3c] hover:underline"
                  >
                    View All Announcements &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* User Account / Profile Button & Menu */}
          <div className="relative flex items-center gap-2">
            {!userState.isLoggedIn && (
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-[#f1c89e] px-3 py-2 text-xs font-bold text-[#26352f] transition-colors hover:bg-white"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in</span>
              </Link>
            )}

            {userState.isLoggedIn ? (
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-2.5 py-1.5 transition-colors focus:outline-none"
                title={`Signed in as ${userState.name || userState.username}`}
              >
                <div className="h-6 w-6 rounded-full bg-[#b36b3c] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {userState.name
                    ? userState.name.charAt(0).toUpperCase()
                    : userState.username.charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:inline text-xs font-semibold text-white max-w-[100px] truncate">
                  {userState.username}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors focus:outline-none"
                title="Sign In / Member Account"
                aria-label="Member Account"
              >
                <UserIcon className="w-4.5 h-4.5" />
              </button>
            )}

            {/* User Menu Popover Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-[#dfdbd1] shadow-2xl p-4 z-50 text-slate-900 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                {userState.isLoggedIn ? (
                  <>
                    {/* User Summary Header */}
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                      <div className="w-10 h-10 rounded-full bg-[#b36b3c] text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                        {userState.name
                          ? userState.name.charAt(0).toUpperCase()
                          : userState.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-[#26352f] text-sm truncate">
                          {userState.name}
                        </h4>
                        <p className="text-xs text-slate-500 truncate">{userState.email || `@${userState.username}`}</p>
                        <span className="inline-block mt-1 text-[9px] bg-[#26352f]/10 text-[#26352f] font-semibold px-2 py-0.5 rounded uppercase font-mono tracking-wider">
                          {userState.role}
                        </span>
                      </div>
                    </div>

                    {/* Quick Menu Links */}
                    <div className="space-y-1">
                      <Link
                        href="/member"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserIcon className="w-4 h-4 text-slate-500" />
                          <span>My Account &amp; Giving</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </Link>

                      <Link
                        href="/give"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <HeartHandshake className="w-4 h-4 text-slate-500" />
                          <span>Give / Money Giving</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </Link>

                      <Link
                        href="/calendar"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <Calendar className="w-4 h-4 text-slate-500" />
                          <span>Church Calendar</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </Link>

                      <Link
                        href="/about"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <Info className="w-4 h-4 text-slate-500" />
                          <span>About the Church</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </Link>

                      {isStaff && (
                        <Link
                          href="/administration"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-[#26352f] hover:bg-[#26352f]/10 transition"
                        >
                          <div className="flex items-center gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-[#26352f]" />
                            <span>Admin Portal</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          triggerPwaInstall();
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          <Download className="w-4 h-4 text-[#b36b3c]" />
                          <span>Install App</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#b36b3c] bg-[#b36b3c]/10 px-1.5 py-0.5 rounded">PWA</span>
                      </button>
                    </div>

                    {/* Sign Out Button */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="pb-2 border-b border-slate-100">
                      <h4 className="font-bold text-[#26352f] text-sm">Member Portal</h4>
                      <p className="text-xs text-slate-500">Sign in to access your member account and giving history.</p>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <Link
                        href="/login"
                        onClick={() => setShowUserMenu(false)}
                        className="w-full flex items-center justify-center gap-2 bg-[#26352f] hover:bg-[#1c2924] text-white py-2 px-3 rounded-xl text-xs font-semibold transition"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign In</span>
                      </Link>

                      <Link
                        href="/create-account"
                        onClick={() => setShowUserMenu(false)}
                        className="w-full flex items-center justify-center gap-2 border border-[#b36b3c] text-[#b36b3c] hover:bg-[#b36b3c]/10 py-2 px-3 rounded-xl text-xs font-semibold transition"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Create Account</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          triggerPwaInstall();
                        }}
                        className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 py-2 px-3 rounded-xl text-xs font-semibold transition mt-2"
                      >
                        <Download className="w-4 h-4 text-[#b36b3c]" />
                        <span>Install Desktop/Mobile App</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Top Header Placeholder Spacer (h-16 = 64px) */}
      <div className="h-16" aria-hidden="true" />

      {/* Mobile Bottom Tab Navigation Menu (Fixed at bottom on md:hidden) */}
      <nav
        hidden={navigationLocked}
        aria-hidden={navHidden}
        className={`md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#26352f]/95 backdrop-blur-md border-t border-white/15 px-1.5 py-1.5 flex justify-around items-center shadow-lg text-white pb-[calc(0.375rem+env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${
          navHidden ? "translate-y-full pointer-events-none" : "translate-y-0"
        }`}
        aria-label="Mobile Bottom Navigation"
      >
        {mobileBottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.active;
          return (
            <Link
              key={item.href}
              href={item.href}
              replace={"replace" in item && item.replace}
              className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-colors text-center min-w-[46px] min-h-[44px] ${
                isActive
                  ? "text-white font-bold bg-white/20 border border-white/30 shadow-xs"
                  : "text-white/75 hover:text-white"
              }`}
            >
              <Icon
                className={`w-5 h-5 mb-0.5 transition-colors ${
                  isActive ? "text-[#f1c89e]" : "text-white/80"
                }`}
              />
              <span className="text-[10px] tracking-tight leading-none truncate max-w-[52px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
