"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { nextGathering, gatheringLabel, type ChurchTimes } from "@/lib/gathering";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Announcement = {
  id: number;
  title: string;
  text: string;
  detail?: string;
};

/**
 * The dashboard's announcement rail: the week's announcements slide by at the
 * top of the page, above the greeting, each offering a "See more" into the
 * full feed in Fellowship. When nothing is published, the next gathering —
 * or the one happening now — stands in its place, so the rail never goes
 * empty. Reading here is passive by design: answering a question or acting on
 * a giving call happens in the feed, where the whole announcement lives.
 */
export function DashboardAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [settings, setSettings] = useState<ChurchTimes | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [slide, setSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Announcement[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]));

    // The gathering windows are greeting-grade public copy: same read the
    // website's card makes.
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setSettings)
      .catch(() => setSettings(null));
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  const gathering = useMemo(() => nextGathering(settings, now), [settings, now]);

  // Announcements lead; the gathering is the fallback slide — and it is also
  // what shows when the church has published nothing.
  const slideCount = 1 + announcements.length;
  const index = Math.min(slide, slideCount - 1);
  const current = index > 0 ? announcements[index - 1] : undefined;
  const canRotate = slideCount > 1;

  useEffect(() => {
    if (!canRotate || isPaused || isInteracting) return;
    const timer = window.setInterval(() => setSlide((prev) => (prev + 1) % slideCount), 7000);
    return () => window.clearInterval(timer);
  }, [canRotate, isPaused, isInteracting, slideCount]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="rounded-3xl border border-[#dfdbd1] bg-white px-6 py-5 shadow-sm sm:px-8"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#b36b3c]">
          {current ? "Announcement" : "Next gathering"}
          {announcements.length > 1 ? ` · ${index} of ${announcements.length}` : ""}
        </p>
        {slideCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSlide((prev) => (prev - 1 + slideCount) % slideCount)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#dfdbd1] text-sm text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
              aria-label="Previous"
            >
              &larr;
            </button>
            <div className="flex items-center gap-1.5 px-0.5">
              {Array.from({ length: slideCount }).map((_, dot) => (
                <button
                  key={dot}
                  type="button"
                  onClick={() => setSlide(dot)}
                  aria-label={dot === 0 ? "Next gathering" : `Announcement ${dot}`}
                  className={`h-1.5 rounded-full transition-all ${dot === index ? "w-4 bg-[#b36b3c]" : "w-1.5 bg-[#dfdbd1]"}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSlide((prev) => (prev + 1) % slideCount)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#dfdbd1] text-sm text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
              aria-label="Next"
            >
              &rarr;
            </button>
          </div>
        )}
      </div>

      <div className="mt-2.5">
        <h2 className="text-lg font-bold leading-snug text-[#26352f] sm:text-xl">
          {current ? current.title : gatheringLabel(gathering, now)}
        </h2>
        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-[#415047]">
          {current ? current.text : `${gathering.time} · ${gathering.online ? "Online" : "Church grounds, Loma Linda, Meru"}`}
        </p>
        {current?.detail && <p className="mt-1 line-clamp-1 text-xs text-[#617068]">{current.detail}</p>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        {current ? (
          <Link
            href="/announcements"
            className="text-sm font-semibold text-[#b36b3c] transition hover:underline"
          >
            See more &rarr;
          </Link>
        ) : (
          <Link
            href="/calendar"
            className="text-sm font-semibold text-[#b36b3c] transition hover:underline"
          >
            View calendar &rarr;
          </Link>
        )}
      </div>
    </div>
  );
}
