"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Users,
  BookOpen,
  HandHeart,
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
  Download
} from "lucide-react";
import { AccessibilityMenu } from "./accessibility-menu";
import { triggerPwaInstall } from "./pwa-register";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const staffRoles = [
  "admin",
  "leader",
  "clerk",
  "elder",
  "youth_leader",
  "choir_director",
  "children_ministry",
  "men_ministry",
  "women_ministry",
  "chaplaincy",
  "finance",
  "treasurer"
];

interface AnnouncementItem {
  id: number;
  title: string;
  text?: string;
  detail?: string;
  created_at?: string;
}

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();

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

  const handleToggleNotifications = () => {
    const nextShow = !showNotifications;
    setShowNotifications(nextShow);
    setShowUserMenu(false);

    if (nextShow && notifications.length > 0) {
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
  };

  const hasUnread = notifications.some((n) => !readNotificationIds.includes(n.id));

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
    {
      href: "/community/prayer",
      label: "Requests",
      active: pathname.startsWith("/requests") || pathname.startsWith("/community") || pathname.startsWith("/enroll") || pathname.startsWith("/partnerships"),
    },
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

  // Mobile bottom tab navigation items
  const mobileBottomNavItems = [
    {
      href: "/share",
      label: "Fellowship",
      icon: Users,
      active: pathname.startsWith("/share") || pathname.startsWith("/spiritual") || pathname.startsWith("/announcements"),
    },
    {
      href: "/materials",
      label: "Materials",
      icon: BookOpen,
      active: pathname.startsWith("/materials"),
    },
    {
      href: "/requests",
      label: "Requests",
      icon: HandHeart,
      active: pathname.startsWith("/requests") || pathname.startsWith("/community") || pathname.startsWith("/enroll") || pathname.startsWith("/partnerships"),
    },
    {
      href: "/support",
      label: "Giving",
      icon: CircleDollarSign,
      active: pathname.startsWith("/support") || pathname.startsWith("/give"),
    },
    {
      href: "/about",
      label: "About",
      icon: Info,
      active: pathname.startsWith("/about"),
    },
  ];

  return (
    <>
      {/* Top 100% Full-Width Header Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#26352f] border-b border-white/10 shadow-md text-white px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left: Church Banner / Logo & Church Name */}
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 group shrink-0 min-w-0">
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
            <span className="font-bold text-white text-sm sm:text-base tracking-tight leading-tight truncate">
              Seventh-day Adventist Church
            </span>
            <span className="text-white/75 text-[11px] sm:text-xs leading-tight truncate">
              Loma Linda
            </span>
          </div>
        </Link>

        {/* Center: Desktop Navigation Menu */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-1.5" aria-label="Main navigation">
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
        <div ref={controlsRef} className="flex items-center gap-2 sm:gap-3 relative shrink-0">

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
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-[#b36b3c] ring-2 ring-[#26352f]" />
              )}
            </button>

            {/* Notification Popover Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-[#dfdbd1] shadow-2xl p-4 z-50 text-slate-900 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#26352f]">Notifications</span>
                    {notifications.length > 0 && (
                      <span className="text-[10px] bg-[#26352f]/10 text-[#26352f] font-bold px-2 py-0.5 rounded-full">
                        {notifications.length}
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
                  {notifications.length > 0 ? (
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

                <div className="pt-2 border-t border-slate-100">
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
                          <span>Give / Tithes &amp; Offerings</span>
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
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#26352f]/95 backdrop-blur-md border-t border-white/15 px-1.5 py-1.5 pb-safe flex justify-around items-center shadow-lg text-white"
        aria-label="Mobile Bottom Navigation"
      >
        {mobileBottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.active;
          return (
            <Link
              key={item.href}
              href={item.href}
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
