"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { nextMeeting, type WeeklyMeeting } from "@/lib/gathering";
import { NavIdentity } from "./nav-identity";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * The top bar — the app's identity strip.
 *
 * It carries no navigation: the rail owns the map, so this holds only what is
 * about *you* rather than *where* — the bell, the light/dark switch, the
 * accessibility options, install and the account menu. That split is why it
 * can sit inside the content column instead of spanning the window: it starts
 * where the rail ends, so the rail keeps the full height of the page and its
 * brand and first rows are never pushed down by chrome.
 *
 * A phone has no rail to start after, so the bar spans the width — and it
 * carries the church's own mark and name on the left, which is the only place
 * the app can say whose it is at that width. The same bar and the same two
 * words the rail's brand block shows, so nothing is introduced differently on
 * a phone.
 *
 * It wears `bark`, the church's dark chrome — the same colour the phone's tab
 * bar uses, so the two ends of the app read as one frame around the page.
 *
 * Its height is the rail's brand block (`h-16` there), so the bar's own bottom
 * hairline continues the line under the rail's logo instead of sitting a few
 * pixels above it.
 *
 * In the middle of the bar rides the one thing that is about *now*: a Live
 * badge, up only while an online meeting in the church's week is actually
 * running, and the way straight into it. It sits dead centre, so the brand at
 * one end and the member's own controls at the other both keep their places
 * whether or not a meeting is on.
 */
export function AppTopBar() {
  const [meetings, setMeetings] = useState<WeeklyMeeting[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    fetch(`${API_URL}/api/members/weekly-meetings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMeetings(Array.isArray(data?.meetings) ? data.meetings : []))
      .catch(() => setMeetings([]));
    // The badge has to come and go on its own: nobody navigates to make a
    // meeting start, so a clock ticks beside the week.
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const gathering = useMemo(() => nextMeeting(meetings, now), [meetings, now]);
  // Online *and* open right now, with somewhere to go when it is tapped.
  const liveHref = gathering?.active && gathering.online && gathering.link ? gathering.link : null;

  return (
    /* On `lg` the rail says whose app this is, so the brand link is gone and
       the controls keep the right end of the bar with `lg:justify-end` — the
       place they held before the bar carried a mark of its own. */
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-bark px-3 text-white shadow-sm sm:px-5 lg:justify-end">
      {/* The way into a conference that is happening now. Phones keep the
          middle of the bar for the church's own name — the dashboard's rail
          says the same thing there and carries the join button. */}
      {liveHref && (
        <a
          href={liveHref}
          target="_blank"
          rel="noreferrer"
          title={`${gathering?.name} is meeting now — join`}
          aria-label={`${gathering?.name} is meeting now — join the web conference`}
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-ember px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-ember-deep sm:inline-flex"
        >
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          Live
        </a>
      )}
      {/* The way home, where the rail's brand would be. The symbol is white,
          so it sits in the same ghost tile the bar's own controls wear. */}
      <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 lg:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 p-1">
          <Image
            src="/adventist-symbol.svg"
            alt="SDA Church"
            width={32}
            height={32}
            className="h-full w-auto object-contain"
            priority
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm leading-tight tracking-tight text-white">SDA Church</span>
          <span className="block truncate text-[11px] leading-tight text-white/70">Loma Linda</span>
        </span>
      </Link>
      <NavIdentity />
    </header>
  );
}
