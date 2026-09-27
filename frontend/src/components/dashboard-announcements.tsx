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
  href?: string | null;
  announcement_type?: "awareness" | "web_conference" | "promotion" | "opinion";
};

/** The join button names the platform the link points at, so a member knows
    what tapping it will open — Google Meet, Zoom, YouTube, Teams. */
function platformLabel(href: string | null | undefined) {
  if (!href) return "Join online";
  const url = href.toLowerCase();
  if (url.includes("meet.google.com")) return "Google Meet";
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "Zoom";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("teams.microsoft.com")) return "Teams";
  return "Join online";
}

/**
 * The dashboard's announcement rail: the week's announcements slide by at the
 * top of the page. The whole card opens the full feed in Fellowship, and each
 * announcement carries its own action — Support for a giving call, Give input
 * for an opinion question, the named platform for a web conference. When
 * nothing is published, the next gathering stands in, so the rail never goes
 * empty.
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

  const isGiving = current?.announcement_type === "promotion";
  const isOpinion = current?.announcement_type === "opinion";
  const isConference = current?.announcement_type === "web_conference" && Boolean(current.href);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="relative rounded-3xl border border-[#dfdbd1] bg-white px-6 py-5 shadow-sm sm:px-8"
    >
      {/* The whole card opens the Fellowship feed. The overlay sits under the
          controls, so the arrows and action buttons keep working on top. */}
      <Link
        href="/announcements"
        aria-label="Open announcements"
        className="absolute inset-0 rounded-3xl transition hover:bg-[#faf7f0]/60"
        style={{ zIndex: 0 }}
      />

      <div className="relative" style={{ zIndex: 1 }}>
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

        {/* The rail's height is constant whatever the slide carries: the
            title holds one line, the body always has room for two, and the
            detail line keeps its slot even when empty — so the panels below
            never jump as the slides turn. */}
        <div className="mt-2.5">
          <h2 className="line-clamp-1 text-lg font-bold leading-snug text-[#26352f] sm:text-xl">
            {current ? current.title : gatheringLabel(gathering, now)}
          </h2>
          <p className="mt-1.5 line-clamp-2 min-h-[3rem] text-sm leading-6 text-[#415047]">
            {current ? current.text : `${gathering.time} · ${gathering.online ? "Online" : "Church grounds, Loma Linda, Meru"}`}
          </p>
          <p className="mt-1 line-clamp-1 min-h-[1.125rem] text-xs leading-[1.125rem] text-[#617068]">
            {current?.detail || ""}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/announcements"
            className="text-sm font-semibold text-[#b36b3c] transition hover:underline"
          >
            See more &rarr;
          </Link>

          {/* The announcement's own action: a giving call asks for support,
              an opinion question asks for input, a web conference names its
              platform. The gathering slide keeps its calendar link. */}
          {isGiving && (
            <Link
              href="/announcements"
              className="rounded-full bg-[#3d7146] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#335e3a]"
            >
              Support
            </Link>
          )}
          {isOpinion && (
            <Link
              href="/announcements"
              className="rounded-full bg-[#b36b3c] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#96552e]"
            >
              Give input
            </Link>
          )}
          {isConference && current?.href && (
            <a
              href={current.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#b36b3c] px-5 py-2 text-xs font-bold text-white transition hover:bg-[#96552e]"
            >
              {platformLabel(current.href)}
            </a>
          )}
          {!current && (
            <Link
              href="/calendar"
              className="text-sm font-semibold text-[#b36b3c] transition hover:underline"
            >
              View calendar &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
