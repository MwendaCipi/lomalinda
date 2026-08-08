"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type ChurchSettings = { latitude: string | null; longitude: string | null; midweek_vespers_link: string; midweek_vespers_time: string; friday_vespers_time: string; sabbath_time: string };
type Gathering = { day: number; hour: number; minute: number; endHour: number; endMinute: number; name: string; time: string; online: boolean; active: boolean; date: Date };

function clockRange(value: string | undefined, fallbackStart: [number, number], fallbackEnd: [number, number]) {
  const matches = (value || "").match(/(\d{1,2}):(\d{2})\s*([AP]M)/gi) || [];
  const parse = (text: string | undefined, fallback: [number, number]) => {
    if (!text) return fallback;
    const match = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!match) return fallback;
    let hour = Number(match[1]) % 12; if (match[3].toUpperCase() === "PM") hour += 12;
    return [hour, Number(match[2])] as [number, number];
  };
  return [parse(matches[0], fallbackStart), parse(matches[1], fallbackEnd)] as const;
}

export function NextGatheringCard() {
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { fetch(`${API_URL}/api/members/church-settings/`).then((response) => response.ok ? response.json() : null).then(setSettings).catch(() => setSettings(null)); const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);

  const gathering = useMemo(() => {
    const definitions = [
      { day: 3, name: "Midweek Vespers", time: settings?.midweek_vespers_time || "Wednesday · 8:00 PM – 9:00 PM", range: clockRange(settings?.midweek_vespers_time, [20, 0], [21, 0]), online: true },
      { day: 5, name: "Friday Vespers", time: settings?.friday_vespers_time || "Friday · 5:30 PM – 6:30 PM", range: clockRange(settings?.friday_vespers_time, [17, 30], [18, 30]), online: false },
      { day: 6, name: "Sabbath program", time: settings?.sabbath_time || "Saturday · 8:00 AM – 4:00 PM", range: clockRange(settings?.sabbath_time, [8, 0], [16, 0]), online: false },
    ];
    const candidates: Gathering[] = [];
    for (let week = -1; week <= 1; week += 1) definitions.forEach((definition) => {
      const date = new Date(now); let difference = definition.day - now.getDay() + week * 7; date.setDate(now.getDate() + difference); date.setHours(definition.range[0][0], definition.range[0][1], 0, 0);
      const end = new Date(date); end.setHours(definition.range[1][0], definition.range[1][1], 0, 0); if (end <= date) end.setDate(end.getDate() + 1);
      candidates.push({ day: definition.day, hour: definition.range[0][0], minute: definition.range[0][1], endHour: definition.range[1][0], endMinute: definition.range[1][1], name: definition.name, time: definition.time, online: definition.online, active: now >= date && now < end, date });
    });
    const active = candidates.find((candidate) => candidate.active);
    if (active) return active;
    return candidates.filter((candidate) => candidate.date > now).sort((a, b) => a.date.getTime() - b.date.getTime())[0] || candidates[0];
  }, [now, settings]);

  const mapsUrl = settings?.latitude && settings.longitude ? `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}` : null;
  const actionHref = gathering.online ? settings?.midweek_vespers_link : mapsUrl;
  const label = gathering.active ? (gathering.name === "Sabbath program" ? "Sabbath program is ongoing" : `${gathering.name} is ongoing`) : (gathering.name === "Sabbath program" ? "Sabbath programs begin soon" : `${gathering.name} begins soon`);
  const joinOpen = gathering.online && gathering.active && Boolean(actionHref);

  return <div className="relative min-h-80 overflow-hidden rounded-[2rem] bg-[#d5dfd7] p-10 text-[#26352f] shadow-sm ring-1 ring-[#c9d5ca] sm:min-h-[28rem]"><div className="relative z-10 flex h-full flex-col"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">{gathering.active ? "Now happening" : "Next gathering"}</p><h2 className="mt-4 text-3xl font-semibold">{label}</h2><p className="mt-3 text-lg leading-7 text-[#3d5148]">{gathering.time}</p><p className="mt-3 text-sm text-[#617068]">{gathering.online ? "Online" : "Loma Linda Church grounds"}</p></div><div className="mt-auto border-t border-[#c1d0c4] pt-8"><p className="text-sm text-[#617068]">{gathering.date.toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric" })}</p>{gathering.online ? joinOpen ? <Link href={actionHref!} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">Join meeting &rarr;</Link> : <span className="mt-4 inline-block text-sm font-semibold text-[#8d938e]">Join meeting <span className="font-normal">(opens at start time)</span></span> : mapsUrl ? <Link href={mapsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">View location &rarr;</Link> : <Link href="/calendar" className="mt-4 inline-block text-sm font-semibold text-[#b36b3c] hover:underline">View location &rarr;</Link>}</div></div></div>;
}
