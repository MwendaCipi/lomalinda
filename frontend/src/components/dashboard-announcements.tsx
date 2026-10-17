"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { nextMeeting, gatheringLabel, gatheringCountdown, platformLabel, type WeeklyMeeting } from "@/lib/gathering";
import { announcementCountdown } from "@/lib/announcement-dates";
import { PledgeModal, type PledgeTarget } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { GiveMethodModal } from "@/components/give-method-modal";
import { AnnouncementCommentModal } from "@/components/announcement-comment-modal";
import { churchWhere, useChurchSettings } from "@/hooks/use-church-settings";
import { isImageAttachment } from "@/components/announcement-attachment";

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
  /** The hour the event begins at, when the post named one. */
  event_time_from?: string | null;
  /** The post's image, when it carries one — the same shape the announcement
      manager and the full-feed modal use, so one helper reads all three. */
  attachment?: string | null;
};

/**
 * The dashboard's announcement rail: the week's announcements slide by at the
 * top of the page. The whole card opens the full feed in Fellowship, and each
 * announcement carries its own action — Support for a giving call, Give input
 * for an opinion question, the named platform for a web conference. The next
 * gathering stands in only when nothing is published: while the church has a
 * notice to make, the week's meeting does not compete with it for the glance,
 * and the rail never goes empty either way.
 */
export function DashboardAnnouncements() {
  const router = useRouter();
  // The church's own record, for the place a gathering is held: the stand-in
  // slide names the church's address rather than one written in code.
  const settings = useChurchSettings();
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
  // A contribution card's Give Now opens the money-or-goods choice here, so
  // the rail keeps one button instead of the old inline combo of Pledge /
  // In-kind / Give Money. A Comment button on every card opens this thread.
  // Pledge, Give Now and Comment ride the same card so the member can take
  // any of the three without leaving the rail.
  const [methodFor, setMethodFor] = useState<Announcement | null>(null);
  const [commentFor, setCommentFor] = useState<Announcement | null>(null);

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

  // Announcements lead; the gathering stands in only when the church has
  // published nothing else.
  const hasAnnouncements = announcements.length > 0;
  const slideCount = hasAnnouncements ? announcements.length : 1;
  const index = Math.min(slide, slideCount - 1);
  const current = hasAnnouncements ? announcements[index] : undefined;

  // The countdown belongs to whichever slide is on show: a post counts down to
  // its own event, the week's gathering to its next meeting. Reading the
  // gathering's clock at an announcement — the only clock this card used to
  // have — is how a notice about the 21st came to say "in 1 day".
  const countdown = current
    ? announcementCountdown(current, now)
    : gathering
      ? gatheringCountdown(gathering, now)
      : null;
  const canRotate = announcements.length > 1;

  // A modal over the rail holds the slides still — nothing should turn behind
  // a form the member is filling in.
  const modalOpen = Boolean(pledgeTarget) || inKindOpen || Boolean(methodFor) || Boolean(commentFor);

  useEffect(() => {
    if (!canRotate || isPaused || isInteracting || modalOpen) return;
    const timer = window.setInterval(() => setSlide((prev) => (prev + 1) % slideCount), 7000);
    return () => window.clearInterval(timer);
  }, [canRotate, isPaused, isInteracting, modalOpen, slideCount]);

  const isGiving = current?.announcement_type === "promotion";
  const isOpinion = current?.announcement_type === "opinion";
  const isConference = current?.announcement_type === "web_conference" && Boolean(current.href);

  /** Show "see more" on an awareness notice when the body is longer than the
      card's three-line window or when the notice carries an image a visitor
      can enlarge. Other slide types already carry their own action. */
  const isAwareness = current?.announcement_type === "awareness";
  const textLong = current && current.text.length > 220;
  const hasImage = current && isImageAttachment(current.attachment);

  /** The pledge modal's view of the slide the member is looking at. */
  const pledgeTargetFor = (announcement: Announcement): PledgeTarget => ({
    id: announcement.id,
    title: announcement.title,
    action_type: announcement.action_type,
    support_account_display: announcement.support_account_display,
    event_date_from: announcement.event_date_from,
    event_date_to: announcement.event_date_to,
  });

  /** The money-or-goods choice's target — a drive leaves for the giving page,
      a support post opens the money modal with its account chosen. */
  const giveMoneyFor = (announcement: Announcement) => {
    router.push(`/give?purpose=${encodeURIComponent(announcement.support_account_display || announcement.title || "")}`);
  };

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
      {/* The whole card opens the Fellowship feed: this overlay link fills the
          card and the content above it is given back to the pointer, so a
          click anywhere — the title, the body, the empty space — lands here.
          Only the controls take their own clicks (they carry
          `pointer-events-auto`). */}
      <Link
        href="/announcements"
        aria-label="Open announcements"
        className="absolute inset-0 rounded-3xl transition hover:bg-sand-veil/60"
        style={{ zIndex: 0 }}
      />

      {/* `pointer-events-none`: the content rides above the overlay for the
          eye but lets the pointer fall through to it, so the card reads as
          one pressable surface. */}
      <div className="pointer-events-none relative" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ember">
            {current ? "Announcement" : "Next gathering"}
            {current && announcements.length > 1 ? ` · ${index + 1} of ${announcements.length}` : ""}
          </p>
          {slideCount > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSlide((prev) => (prev - 1 + slideCount) % slideCount)}
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-sand-line text-sm text-moss transition hover:border-ember hover:text-ember"
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
                    aria-label={hasAnnouncements ? `Announcement ${dot + 1}` : "Next gathering"}
                    className={`pointer-events-auto h-1.5 rounded-full transition-all ${dot === index ? "w-4 bg-ember" : "w-1.5 bg-sand-line"}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSlide((prev) => (prev + 1) % slideCount)}
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-sand-line text-sm text-moss transition hover:border-ember hover:text-ember"
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
                ? `${gathering.time} · ${gathering.online ? "Online" : gathering.place || churchWhere(settings) || "Church grounds"}`
                : "The week's meetings are still being set up."}
          </p>
          <p className="line-clamp-1 min-h-[1.125rem] text-xs leading-[1.125rem] text-moss">
            {current?.detail || ""}
          </p>

        </div>

        {/* The announcement's own actions. Clicking the card opens the full
            announcement in the feed; a giving call carries one Give Now button
            whose modal offers money or goods — the same two forms the old
            three-wide combo opened — plus Pledge and Comment.
            A notice that runs past the card's three lines, or one that carries
            a flyer image, asks the reader to open the full feed: that ask
            shares this row with the Comment button, so the card's foot is one
            line of controls rather than two. */}
        <div className="flex items-center justify-between gap-3">
          {current && isAwareness && (textLong || hasImage) && (
            <Link
              href="/announcements"
              className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-ember/10 px-2.5 py-1 text-[11px] font-semibold text-ember transition hover:bg-ember/20"
            >
              See more
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4-4 4" /></svg>
            </Link>
          )}
          {isGiving && (
            <div className="flex-1">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { if (current) setMethodFor(current); }}
                  className="pointer-events-auto rounded-full bg-sage-strong px-2 py-2 text-xs font-bold text-white transition hover:bg-sage-shade"
                >
                  Give Now
                </button>
                <button
                  type="button"
                  onClick={() => { if (current) setPledgeTarget(pledgeTargetFor(current)); }}
                  className="pointer-events-auto rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                >
                  Pledge
                </button>
                <button
                  type="button"
                  onClick={() => { if (current) setCommentFor(current); }}
                  className="pointer-events-auto rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                >
                  Comment
                </button>
              </div>
            </div>
          )}
          {isOpinion && (
            <button
              type="button"
              onClick={() => { if (current) setCommentFor(current); }}
              className="pointer-events-auto rounded-full bg-ember px-5 py-2 text-xs font-bold text-white transition hover:bg-ember-dark"
            >
              Give input
            </button>
          )}
          {/* A notice with no action of its own still takes a comment: the
              feed's rule — every card carries the Comment button — reaches
              the rail too, so a member reading a plain notice can answer it
              without first opening the full feed. The giving, opinion and
              conference slides already carry their own controls, so this sits
              only on the slides that would otherwise go without. */}
          {current && !isGiving && !isOpinion && !isConference && (
            <button
              type="button"
              onClick={() => { if (current) setCommentFor(current); }}
              className="pointer-events-auto rounded-full border border-sand-mute bg-white px-4 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
            >
              Comment
            </button>
          )}
          {isConference && current?.href && (
            <div className="ml-auto flex items-center gap-3">
              {/* The countdown sits to the left of the join button, so the
                  hour the meeting begins is read before the tap. */}
              {countdown && (
                <span className="text-xs font-semibold text-moss" aria-live="polite">
                  {countdown}
                </span>
              )}
              <a
                href={current.href}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto rounded-full bg-ember px-5 py-2 text-xs font-bold text-white transition hover:bg-ember-dark"
              >
                {platformLabel(current.href)}
              </a>
            </div>
          )}
          {/* The next gathering is online: the same way in the conference
              slide carries — the hour it begins, then the join button. */}
          {!current && gathering?.online && gathering.link && (
            <div className="ml-auto flex items-center gap-3">
              {countdown && (
                <span className="text-xs font-semibold text-moss" aria-live="polite">
                  {countdown}
                </span>
              )}
              <a
                href={gathering.link}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto rounded-full bg-ember px-5 py-2 text-xs font-bold text-white transition hover:bg-ember-dark"
              >
                {platformLabel(gathering.link)}
              </a>
            </div>
          )}
          {!current && (
            <Link
              href="/calendar"
              className="pointer-events-auto text-sm font-semibold text-ember transition hover:underline"
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

      {/* The money-or-goods choice behind a contribution card's Give Now.
          Each option runs the same form the old inline button opened — a
          drive's money still leaves for the giving page with its purpose
          named, a support post opens the money modal in place.
          The box only shows the doors the card actually offers: a photo-only
          announcement has no money door, so it never carries the modal at all. */}
      <GiveMethodModal
        open={Boolean(methodFor) && isGiving}
        onClose={() => setMethodFor(null)}
        title={methodFor?.title || null}
        onGiveMoney={isGiving ? () => {
          const item = methodFor;
          setMethodFor(null);
          if (item) giveMoneyFor(item);
        } : undefined}
        onGiveInKind={isGiving ? () => {
          const item = methodFor;
          setMethodFor(null);
          if (item) setInKindOpen(true);
        } : undefined}
      />

      {/* A comment on any card opens this box: the thread above, a
          500-character composer beneath. */}
      <AnnouncementCommentModal
        open={Boolean(commentFor)}
        onClose={() => setCommentFor(null)}
        announcement={commentFor ? { id: commentFor.id, title: commentFor.title } : null}
      />
    </div>
  );
}
