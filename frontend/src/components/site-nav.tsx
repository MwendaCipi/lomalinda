"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const staffRoles = ["admin", "leader", "clerk", "elder", "youth_leader", "choir_director", "children_ministry", "men_ministry", "women_ministry", "chaplaincy", "finance", "treasurer"];

function navItemClass(active: boolean) {
  return active ? "rounded-full bg-white/15 px-3 py-1.5 text-white" : "text-white/80 transition hover:text-[#f1c89e]";
}

export function SiteNav({ open: controlledOpen, setOpen: controlledSetOpen }: { open?: boolean; setOpen?: (open: boolean) => void } = {}) {
  const pathname = usePathname();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledSetOpen ?? setInternalOpen;
  
  const [userState, setUserState] = useState<{ isLoggedIn: boolean; role: string; username: string }>({
    isLoggedIn: false,
    role: "",
    username: "",
  });
  const [announcementCount, setAnnouncementCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setUserState({
              isLoggedIn: true,
              role: data.role || "member",
              username: data.username || "Member",
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => setAnnouncementCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setAnnouncementCount(0));
  }, []);

  const isStaff = staffRoles.includes(userState.role);

  return (
    <header className="border-b border-white/10 bg-[#26352f] text-white shadow-lg">
      <nav className="mx-auto max-w-6xl px-6 py-4 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="h-10 w-10 shrink-0 overflow-hidden" aria-hidden="true">
              <Image src="/adventist-logo-white.svg" alt="" width={180} height={49} className="h-10 max-w-none w-auto" priority />
            </span>
            <span className="text-sm leading-tight text-white">
              <span className="block">SDA Church Lomalina, Meru</span>
            </span>
          </Link>

          <div className="hidden items-center gap-6 text-sm font-medium md:flex">
            <Link href="/beliefs" className={navItemClass(pathname === "/beliefs")}>
              Beliefs
            </Link>
            <Link href="/about" className={navItemClass(pathname === "/about")}>
              About Us
            </Link>
            <Link href="/share" className={navItemClass(pathname.startsWith("/share") || pathname.startsWith("/spiritual"))}>
              Fellowship
            </Link>
            <Link href="/requests" className={navItemClass(pathname.startsWith("/requests"))}>
              Requests
            </Link>
            <Link href="/ministries" className={navItemClass(pathname.startsWith("/ministries"))}>
              Ministries
            </Link>
            <Link href="/support" className={navItemClass(pathname.startsWith("/support"))}>
              Support
            </Link>
            <Link href="/announcements" className={navItemClass(pathname === "/announcements")}>
              <span className="inline-flex items-center gap-2">Announcements{announcementCount > 0 && <span aria-label={`${announcementCount} announcements`} className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{announcementCount > 99 ? "99+" : announcementCount}</span>}</span>
            </Link>

            {/* Staff Admin Link */}
            {userState.isLoggedIn && isStaff && (
              <Link
                href="/administration"
                className={navItemClass(pathname.startsWith("/administration"))}
              >
                Admin
              </Link>
            )}

            {/* Logged-In User Icons: Notifications & Profile */}
            {userState.isLoggedIn ? (
              <div className="flex items-center gap-3 border-l border-white/20 pl-4">
                {/* Notification Bell Icon */}
                <Link
                  href="/member#notifications"
                  title="Notifications"
                  className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#b36b3c]" />
                </Link>

                {/* User Profile Avatar Icon */}
                <Link
                  href="/member"
                  title={`Signed in as ${userState.username}`}
                  className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-[#b36b3c] hover:bg-white/20"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#b36b3c] text-white text-[11px]">
                    {userState.username.charAt(0).toUpperCase()}
                  </span>
                  <span>{userState.username}</span>
                </Link>
              </div>
            ) : (
              <Link href="/login" className={navItemClass(pathname === "/login")}>
                Member login
              </Link>
            )}
          </div>

          <button
            type="button"
            className="rounded-full border border-white/35 px-4 py-2 text-sm font-medium text-white md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>

        {/* Mobile Navigation List */}
        {open && (
          <div id="mobile-menu" className="mt-4 max-h-[calc(100vh-100px)] space-y-2.5 overflow-y-auto border-t border-white/15 pt-4 pb-6 md:hidden">
            <Link
              href="/beliefs"
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                pathname === "/beliefs" ? "border-[#b36b3c] bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              }`}
            >
              <span>Beliefs</span>
              <span className="text-[#b36b3c] font-semibold">&rarr;</span>
            </Link>

            <Link
              href="/about"
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                pathname === "/about" ? "border-[#b36b3c] bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              }`}
            >
              <span>About Us</span>
              <span className="text-[#b36b3c] font-semibold">&rarr;</span>
            </Link>

            <Link
              href="/share"
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                pathname.startsWith("/share") || pathname.startsWith("/spiritual") ? "border-[#b36b3c] bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              }`}
            >
              <span>Fellowship</span>
              <span className="text-[#b36b3c] font-semibold">&rarr;</span>
            </Link>

            <Link
              href="/requests"
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                pathname.startsWith("/requests") ? "border-[#b36b3c] bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              }`}
            >
              <span>Requests</span>
              <span className="text-[#b36b3c] font-semibold">&rarr;</span>
            </Link>

            <Link
              href="/ministries"
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                pathname.startsWith("/ministries") ? "border-[#b36b3c] bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              }`}
            >
              <span>Ministries</span>
              <span className="text-[#b36b3c] font-semibold">&rarr;</span>
            </Link>

            <Link
              href="/support"
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                pathname.startsWith("/support") ? "border-[#b36b3c] bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              }`}
            >
              <span>Support</span>
              <span className="text-[#b36b3c] font-semibold">&rarr;</span>
            </Link>

            <Link
              href="/announcements"
              onClick={() => setOpen(false)}
              className={`flex w-full items-center justify-between rounded-2xl border p-4 text-sm font-medium transition ${
                pathname === "/announcements" ? "border-[#b36b3c] bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/90 hover:bg-white/10"
              }`}
            >
              <span className="flex items-center gap-2">Announcements{announcementCount > 0 && <span aria-label={`${announcementCount} announcements`} className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{announcementCount > 99 ? "99+" : announcementCount}</span>}</span>
              <span className="text-[#b36b3c] font-semibold">&rarr;</span>
            </Link>

            {/* Mobile Logged In / Logged Out Controls */}
            {userState.isLoggedIn ? (
              <>
                {isStaff && (
                  <Link
                    href="/administration"
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center justify-between rounded-2xl border border-[#b36b3c]/50 bg-[#b36b3c]/15 p-4 text-sm font-semibold text-[#f1c89e] transition hover:bg-[#b36b3c]/25"
                  >
                    <span>Church Admin ({userState.role.replaceAll("_", " ")})</span>
                    <span className="text-[#f1c89e]">&rarr;</span>
                  </Link>
                )}

                <Link
                  href="/member"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-between rounded-2xl border border-white/20 bg-white/10 p-4 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#b36b3c] text-xs">
                      {userState.username.charAt(0).toUpperCase()}
                    </span>
                    <span>My Account ({userState.username})</span>
                  </span>
                  <span className="text-[#f1c89e]">&rarr;</span>
                </Link>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-between rounded-2xl border border-[#b36b3c]/60 bg-[#b36b3c]/20 p-4 text-sm font-semibold text-[#f1c89e] transition hover:bg-[#b36b3c]/30"
              >
                <span>Member Login</span>
                <span className="text-[#f1c89e]">&rarr;</span>
              </Link>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
