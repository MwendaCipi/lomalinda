"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Announcement = { title: string; text: string; href: string; visibility: string };

export function AnnouncementBanner({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [items, setItems] = useState<Announcement[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const dismissed = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("announcement-banner-dismissed", onChange);
      return () => window.removeEventListener("announcement-banner-dismissed", onChange);
    },
    () => sessionStorage.getItem("announcement-banner-dismissed") === "true",
    () => false,
  );

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Announcement[]) => { if (data.length) setItems(data); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (paused || dismissed || items.length < 2) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % items.length), 6000);
    return () => window.clearInterval(timer);
  }, [items.length, paused, dismissed]);

  const normalizedPath = (pathname ?? "").toLowerCase().replace(/\/$/, "");
  const isAuthOrMember = normalizedPath === "/login" || normalizedPath.startsWith("/login/") || normalizedPath === "/member" || normalizedPath.startsWith("/member/") || normalizedPath === "/enroll" || normalizedPath.startsWith("/enroll/") || normalizedPath === "/forgot-password" || normalizedPath === "/reset-password";

  if (isAuthOrMember || dismissed || items.length === 0) return null;
  const announcement = items[active] ?? items[0];

  return (
    <section aria-label="Announcements" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className={compact ? "border-t border-white/10 bg-[#31483e] px-6 py-2 text-white lg:px-8" : "border-b border-[#dfdbd1] bg-[#eef2ed] px-6 py-2 text-[#26352f] lg:px-8"}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p className={compact ? "text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f1c89e]" : "text-xs font-semibold uppercase tracking-[0.18em] text-[#b36b3c]"}>Announcement{announcement.visibility === "members" ? " · Members" : ""}</p>
          <p className={compact ? "truncate text-sm text-white/90" : "mt-1 text-sm leading-6 text-[#617068]"}><span className="font-semibold text-inherit">{announcement.title}: </span>{announcement.text}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href={announcement.href || "/announcements"} className={compact ? "text-xs font-semibold text-[#f1c89e] hover:underline" : "hidden text-sm font-semibold text-[#b36b3c] hover:underline sm:inline"}>Learn more &rarr;</Link>
          <button type="button" aria-label="Dismiss announcements" onClick={() => { sessionStorage.setItem("announcement-banner-dismissed", "true"); window.dispatchEvent(new Event("announcement-banner-dismissed")); }} className={compact ? "rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white" : "rounded-full p-1 text-[#617068] hover:bg-black/5 hover:text-[#26352f]"}><span aria-hidden="true" className="text-lg leading-none">×</span></button>
        </div>
      </div>
      <div className="mx-auto mt-1 flex max-w-6xl items-center gap-1" aria-label="Announcement selector">
        {items.map((item, index) => <button key={`${item.title}-${index}`} type="button" aria-label={`Show announcement ${index + 1}`} aria-current={index === active} onClick={() => setActive(index)} className={`h-1.5 rounded-full transition-all ${index === active ? "w-6 bg-[#b36b3c]" : "w-1.5 bg-[#b36b3c]/35"}`} />)}
      </div>
    </section>
  );
}
