"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type ChurchSettings = { latitude: string | null; longitude: string | null; midweek_vespers_link: string; midweek_vespers_time: string; friday_vespers_time: string; sabbath_time: string };

export function NextGatheringCard() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { fetch(`${API_URL}/api/members/church-settings/`).then((response) => response.ok ? response.json() : null).then(setSettings).catch(() => setSettings(null)); const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);

  const next = useMemo(() => {
    const options = [{ day: 3, hour: 20, minute: 0, name: "Midweek Vespers", time: settings?.midweek_vespers_time || "Wednesday · 8:00 PM – 9:00 PM", online: true }, { day: 5, hour: 17, minute: 30, name: "Friday Vespers", time: settings?.friday_vespers_time || "Friday · 5:30 PM – 6:30 PM", online: false }, { day: 6, hour: 8, minute: 0, name: "Sabbath worship", time: settings?.sabbath_time || "Saturday · 8:00 AM – 4:00 PM", online: false }];
    return options.map((option) => { const date = new Date(now); let difference = option.day - now.getDay(); if (difference <= 0) difference += 7; date.setDate(now.getDate() + difference); date.setHours(option.hour, option.minute, 0, 0); return { ...option, date }; }).sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  }, [now, settings]);

  const mapsUrl = settings?.latitude && settings.longitude ? `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}` : null;
  const joinOpen = next.online && now.getTime() >= next.date.getTime() - 10 * 60 * 1000;
  const actionHref = next.online ? settings?.midweek_vespers_link : mapsUrl;

  return <div className="relative min-h-80 overflow-hidden rounded-[2rem] bg-[#d5dfd7] p-10 text-[#26352f] shadow-sm ring-1 ring-[#c9d5ca] sm:min-h-[28rem]"><div className="relative z-10 flex h-full flex-col"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Next gathering</p><h2 className="mt-4 text-3xl font-semibold">{next.name}</h2><p className="mt-3 text-lg leading-7 text-[#3d5148]">{next.time}</p><p className="mt-3 text-sm text-[#617068]">{next.online ? "Online" : "Loma Linda Church grounds"}</p></div><div className="mt-auto border-t border-[#c1d0c4] pt-8"><p className="text-sm text-[#617068]">{next.date.toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric" })}</p>{next.online ? joinOpen && actionHref ? <Link href={actionHref} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Join meeting &rarr;</Link> : <span className="mt-4 inline-block text-sm font-semibold text-[#8d938e]" title="The meeting link opens 10 minutes before the start time">Join meeting <span className="font-normal">(opens shortly before)</span></span> : mapsUrl ? <Link href={mapsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">View location &rarr;</Link> : <Link href="/calendar" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">View location &rarr;</Link>}</div></div></div>;
}
