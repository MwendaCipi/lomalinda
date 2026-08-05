"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export const announcements = [
  { title: "Sabbath worship", text: "Join us every Saturday for worship, fellowship, and a place to belong.", href: "/calendar?month=all&search=Sabbath" },
  { title: "Midweek Vespers", text: "Pause in the middle of the week for prayer and encouragement online.", href: "/calendar?month=all&search=Midweek%20Vespers" },
  { title: "Serve with us", text: "Explore ministries, outreach, and practical ways to care for our community.", href: "/ministries/evangelism" },
] as const;

export function AnnouncementBanner({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const announcement = announcements[active];

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % announcements.length), 6000);
    return () => window.clearInterval(timer);
  }, [paused]);

  return <section aria-label="Announcements" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className={compact ? "border-t border-white/10 bg-[#31483e] px-6 py-2 text-white lg:px-8" : "relative z-50 -mb-4 border-b border-[#dfdbd1] bg-[#eef2ed] px-6 py-2 text-[#26352f] lg:px-8"}><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="min-w-0"><p className={compact ? "text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f1c89e]" : "text-xs font-semibold uppercase tracking-[0.18em] text-[#b36b3c]"}>Announcement</p><p className={compact ? "truncate text-sm text-white/90" : "mt-1 text-sm leading-6 text-[#617068]"}><span className="font-semibold text-inherit">{announcement.title}: </span>{announcement.text}</p></div><Link href={announcement.href} className={compact ? "shrink-0 text-xs font-semibold text-[#f1c89e] hover:underline" : "hidden shrink-0 text-sm font-semibold text-[#b36b3c] hover:underline sm:inline"}>Learn more &rarr;</Link></div><div className="mx-auto mt-1 flex max-w-6xl items-center gap-1" aria-label="Announcement selector">{announcements.map((item, index) => <button key={item.title} type="button" aria-label={`Show announcement ${index + 1}`} aria-current={index === active} onClick={() => setActive(index)} className={`h-1.5 rounded-full transition-all ${index === active ? "w-6 bg-[#b36b3c]" : "w-1.5 bg-[#b36b3c]/35"}`} />)}</div></section>;
}
