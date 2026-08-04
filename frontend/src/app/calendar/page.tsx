"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type SabbathEvent = { date: string; name: string; program_text: string; program_file: string | null };

function getSabbaths(year: number) {
  const first = new Date(year, 0, 1);
  const firstSaturday = new Date(first);
  firstSaturday.setDate(first.getDate() + ((6 - first.getDay() + 7) % 7));
  const dates: Date[] = [];
  for (const date = new Date(firstSaturday); date.getFullYear() === year; date.setDate(date.getDate() + 7)) dates.push(new Date(date));
  return dates;
}

export default function CalendarPage() {
  const year = new Date().getFullYear();
  const [events, setEvents] = useState<SabbathEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const eventMap = useMemo(() => new Map(events.map((event) => [event.date, event])), [events]);

  useEffect(() => {
    fetch(`${API_URL}/api/members/sabbath-events/`).then((response) => response.ok ? response.json() : []).then(setEvents).finally(() => setLoaded(true));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const orderedSabbaths = [...getSabbaths(year)].sort((a, b) => {
    const aUpcoming = a >= today;
    const bUpcoming = b >= today;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? a.getTime() - b.getTime() : b.getTime() - a.getTime();
  });
  const grouped = orderedSabbaths.reduce<Record<string, Date[]>>((months, date) => {
    const month = date.toLocaleDateString("en-KE", { month: "long" });
    months[month] = [...(months[month] ?? []), date];
    return months;
  }, {});

  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16"><div className="mx-auto max-w-6xl"><Link href="/" className="text-sm font-semibold text-[#b36b3c]">← Back to Loma Linda Church</Link><div className="mt-12 max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Church calendar</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Our church calendar for {year}</h1><p className="mt-6 text-lg leading-8 text-[#617068]">Upcoming Sabbaths appear first. See each Sabbath’s name and open the program when one has been uploaded by the church team.</p></div><div className="mt-12 grid gap-8 md:grid-cols-2">{Object.entries(grouped).map(([month, dates]) => <section key={month} className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1]"><h2 className="text-2xl font-semibold">{month} {year}</h2><div className="mt-6 space-y-5">{dates.map((date) => { const key = date.toISOString().slice(0, 10); const event = eventMap.get(key); return <article key={key} className="border-t border-[#dfdbd1] pt-5 first:border-0 first:pt-0"><div className="flex items-baseline justify-between gap-4"><div><p className="text-sm text-[#617068]">{date.toLocaleDateString("en-KE", { weekday: "long", month: "short", day: "numeric" })}</p><h3 className="mt-1 text-lg font-semibold">{event?.name ?? "Sabbath Worship"}</h3></div><span className="text-xs font-semibold uppercase tracking-wider text-[#b36b3c]">Sabbath</span></div>{event && (event.program_text || event.program_file) && <div className="mt-4 rounded-2xl bg-[#eef2ed] p-4 text-sm leading-6 text-[#3d5148]"><p className="font-semibold text-[#26352f]">Program</p>{event.program_text && <p className="mt-1 whitespace-pre-line">{event.program_text}</p>}{event.program_file && <a className="mt-2 inline-block font-semibold text-[#b36b3c]" href={`${API_URL}${event.program_file}`} target="_blank" rel="noreferrer">Open uploaded program →</a>}</div>}</article>; })}</div></section>)}</div>{!loaded && <p className="mt-8 text-sm text-[#617068]">Checking for uploaded Sabbath programs…</p>}</div></main>;
}
