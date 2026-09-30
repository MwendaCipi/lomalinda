"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { nextMeeting, gatheringLabel, type WeeklyMeeting } from "@/lib/gathering";
import { PledgeModal, type PledgeTarget } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Announcement = {
  id: number;
  title: string;
  text: string;
  detail?: string;
  href?: string | null;
  announcement_type?: "awareness" | "web_conference" | "promotion" | "opinion";
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  support_account?: string | null;
  support_account_display?: string | null;
  /** The clock the pledge's own date is capped by. */
  event_date_from?: string | null;
  event_date_to?: string | null;
};

/** The join button names the platform the link points at *and* says what
    tapping it does — "Open on Google Meet", "Open on Zoom" — so the button
    reads as an action rather than as a bare product name. Every platform gets
    the same verb; a lone "Zoom" beside "Open on Google Meet" would read as a
    different kind of control. `Join online` stays the fallback when the link
    points somewhere unrecognised. */
function platformLabel(href: string | null | undefined) {
  if (!href) return "Join online";
  const url = href.toLowerCase();
  if (url.includes("meet.google.com")) return "Open on Google Meet";
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "Open on Zoom";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "Open on YouTube";
  if (url.includes("teams.microsoft.com")) return "Open on Teams";
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
  const [meetings, setMeetings] = useState<WeeklyMeeting[] | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [slide, setSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  // Pledging and in-kind giving happen in modals over the rail, so a member
  // never loses their place to give — the same two forms the feed opens.
  const [pledgeTarget, setPledgeTarget] = useState<PledgeTarget | null>(null);
  const [inKindOpen, setInKindOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: Announcement[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]));

    // The church's week is greeting-grade public copy: the same records the
    // website's card draws.
    fetch(`${API_URL}/api/members/weekly-meetings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setMeetings(Array.isArray(data?.meetings) ? data.meetings : []))
      .catch(() => setMeetings([]));
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  const gathering = useMemo(() => nextMeeting(meetings, now), [meetings, now]);

  // Announcements lead; the gathering is the fallback slide — and it is also
  // what shows when the church has published nothing.
  const slideCount = 1 + announcements.length;
  const index = Math.min(slide, slideCount - 1);
  const current = index > 0 ? announcements[index - 1] : undefined;
  const canRotate = slideCount > 1;

  // A modal over the rail holds the slides still — nothing should turn behind
  // a form the member is filling in.
  const modalOpen = Boolean(pledgeTarget) || inKindOpen;

  useEffect(() => {
    if (!canRotate || isPaused || isInteracting || modalOpen) return;
    const timer = window.setInterval(() => setSlide((prev) => (prev + 1) % slideCount), 7000);
    return () => window.clearInterval(timer);
  }, [canRotate, isPaused, isInteracting, modalOpen, slideCount]);

  const isGiving = current?.announcement_type === "promotion";
  const isOpinion = current?.announcement_type === "opinion";
  const isConference = current?.announcement_type === "web_conference" && Boolean(current.href);
  const giveMoneyHref = `/give?purpose=${encodeURIComponent(current?.support_account_display || current?.title || "")}`;

  /** The pledge modal's view of the slide the member is looking at. */
  const pledgeTargetFor = (announcement: Announcement): PledgeTarget => ({
    id: announcement.id,
    title: announcement.title,
    action_type: announcement.action_type,
    support_account_display: announcement.support_account_display,
    event_date_from: announcement.event_date_from,
    event_date_to: announcement.event_date_to,
  });

  return (
    // `h-full`: on a wide screen the card shares a row with the pages beside
    // it, and filling the row keeps the two panels' feet level instead of
    // leaving the short one floating.
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="relative h-full rounded-3xl border border-sand-line bg-white px-6 py-5 shadow-sm sm:px-8"
    >
      {/* The whole card opens the Fellowship feed. The overlay sits under the
          controls, so the arrows and action buttons keep working on top. */}
      <Link
        href="/announcements"
        aria-label="Open announcements"
        className="absolute inset-0 rounded-3xl transition hover:bg-sand-veil/60"
        style={{ zIndex: 0 }}
      />

      <div className="relative" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ember">
            {current ? "Announcement" : "Next gathering"}
            {announcements.length > 1 ? ` · ${index} of ${announcements.length}` : ""}
          </p>
          {slideCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSlide((prev) => (prev - 1 + slideCount) % slideCount)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-sand-line text-sm text-moss transition hover:border-ember hover:text-ember"
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
                    className={`h-1.5 rounded-full transition-all ${dot === index ? "w-4 bg-ember" : "w-1.5 bg-sand-line"}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSlide((prev) => (prev + 1) % slideCount)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-sand-line text-sm text-moss transition hover:border-ember hover:text-ember"
                aria-label="Next"
              >
                &rarr;
              </button>
            </div>
          )}
        </div>

        {/* The rail's height is constant whatever the slide carries: the
            title holds one line, the body always has room for three lines
            and the detail line keeps its slot even when empty — so the
            panels below never jump as the slides turn. The action row sits
            tight under the text so the extra line costs no height. */}
        <div className="mt-2.5">
          <h2 className="line-clamp-1 text-lg font-bold leading-snug text-bark sm:text-xl">
            {current ? current.title : gathering ? gatheringLabel(gathering, now) : "Our week together"}
          </h2>
          <p className="mt-1 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-moss-mid">
            {current
              ? current.text
              : gathering
                ? `${gathering.time} · ${gathering.online ? "Online" : gathering.place || "Church grounds, Loma Linda, Meru"}`
                : "The week's meetings are still being set up."}
          </p>
          <p className="line-clamp-1 min-h-[1.125rem] text-xs leading-[1.125rem] text-moss">
            {current?.detail || ""}
          </p>
        </div>

        {/* The announcement's own actions. Clicking the card opens the full
            announcement in the feed; a giving call carries the giving row
            itself — Pledge, In-kind, Give Money, left to right. */}
        <div className="flex items-center justify-between gap-3">
          {isGiving && (
            <div className="flex-1">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { if (current) setPledgeTarget(pledgeTargetFor(current)); }}
                  className="rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                >
                  Pledge
                </button>
                <button
                  type="button"
                  onClick={() => setInKindOpen(true)}
                  className="rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                >
                  In-kind
                </button>
                <Link
                  href={giveMoneyHref}
                  className="rounded-full bg-sage-strong px-2 py-2 text-center text-xs font-bold text-white transition hover:bg-sage-shade"
                >
                  Give Money
                </Link>
              </div>
            </div>
          )}
          {isOpinion && (
            <Link
              href="/announcements"
              className="rounded-full bg-ember px-5 py-2 text-xs font-bold text-white transition hover:bg-ember-dark"
            >
              Give input
            </Link>
          )}
          {isConference && current?.href && (
            <a
              href={current.href}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto rounded-full bg-ember px-5 py-2 text-xs font-bold text-white transition hover:bg-ember-dark"
            >
              {platformLabel(current.href)}
            </a>
          )}
          {!current && (
            <Link
              href="/calendar"
              className="text-sm font-semibold text-ember transition hover:underline"
            >
              View calendar &rarr;
            </Link>
          )}
        </div>
      </div>

      <PledgeModal
        open={Boolean(pledgeTarget)}
        onClose={() => setPledgeTarget(null)}
        target={pledgeTarget}
      />
      <InKindGiftModal
        open={inKindOpen}
        onClose={() => setInKindOpen(false)}
        defaultPurpose={current?.support_account_display || undefined}
        announcementTitle={current?.title}
      />
    </div>
  );
}
