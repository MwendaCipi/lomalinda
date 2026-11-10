"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { nextMeeting, gatheringLabel, gatheringCountdown, platformLabel, type WeeklyMeeting } from "@/lib/gathering";
import { announcementCountdown } from "@/lib/announcement-dates";
import { cardButtons } from "@/lib/announcement-options";
import { PledgeModal, type PledgeTarget } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { AnnouncementCommentModal } from "@/components/announcement-comment-modal";
import { churchWhere, useChurchSettings } from "@/hooks/use-church-settings";
import { isImageAttachment } from "@/components/announcement-attachment";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The buttons the officer ticked for the post — money (Give now) and goods
 *  (Give in kind) as two buttons, each shown only when it was ticked. Comment
 *  is not offered on the card: the thread is reached by opening the full feed,
 *  which the whole card already is. */
function chosenActions(item: Announcement): string[] {
  return cardButtons(item.options).filter((code) => code !== "comment");
}

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
  /** The buttons this post's card carries, as the officer ticked them. */
  options?: string[];
  /** When a scheduled post goes live, and how the notice repeats. */
  publish_at?: string | null;
  repeat?: "none" | "daily" | "weekly" | "monthly";
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
  // An opinion card's Give input opens the comment thread; the other slides
  // reach the thread through the full feed.

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
  const modalOpen = Boolean(pledgeTarget) || inKindOpen || Boolean(commentFor);

  useEffect(() => {
    if (!canRotate || isPaused || isInteracting || modalOpen) return;
    const timer = window.setInterval(() => setSlide((prev) => (prev + 1) % slideCount), 7000);
    return () => window.clearInterval(timer);
  }, [canRotate, isPaused, isInteracting, modalOpen, slideCount]);

  // The card's buttons come from the officer's ticks: a call for money or
  // goods gives its own row, and a meeting, class or form is the card's one
  // way out — the same link the whole card opens, named by its button.
  const buttons = current ? chosenActions(current) : [];
  const linkCode = buttons.find((code) => code === "join_meeting" || code === "enroll" || code === "register");
  const isGiving = buttons.some((code) => code === "give_now" || code === "pledge" || code === "in_kind");
  const isOpinion = current?.announcement_type === "opinion";
  const linkHref = linkCode && current?.href ? current.href : null;


  // Where the body has to stop, and that it stops after a whole word.
  // Clamping the paragraph in CSS cut the fourth line wherever the box
  // ended, so the last word could arrive half-written under the pinned "See
  // more". The text is now measured off-screen against the same width and
  // trimmed back to the last word that still leaves room for the ask, so the
  // card reads a sentence that ends rather than one that was chopped.
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const [bodyFit, setBodyFit] = useState<{ source: string; text: string; clipped: boolean } | null>(null);
  const bodyText = current?.text ?? "";
  const hasImage = Boolean(current && isImageAttachment(current.attachment));

  useEffect(() => {
    const node = bodyRef.current;
    if (!node || !bodyText) {
      setBodyFit(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const paragraph = bodyRef.current;
        if (!paragraph || !paragraph.clientWidth) return;
        const lineHeight = parseFloat(window.getComputedStyle(paragraph).lineHeight) || 24;
        // Four lines, the height the rail reserves for the body.
        const maxHeight = lineHeight * 4 + 1;
        const words = bodyText.split(/\s+/).filter(Boolean);

        // A probe wearing the paragraph's own classes, lifted out of the
        // clamp so it can grow to the full text and be counted.
        const probe = document.createElement("p");
        probe.className = paragraph.className;
        Object.assign(probe.style, {
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          width: `${paragraph.clientWidth}px`,
          height: "auto",
          maxHeight: "none",
          overflow: "visible",
          display: "block",
        });
        probe.style.webkitLineClamp = "unset";
        document.body.appendChild(probe);

        /** Does this many whole words plus the ask fit in the four lines? */
        const fits = (count: number, withAsk: boolean) => {
          probe.textContent = words.slice(0, count).join(" ");
          if (withAsk) {
            const suffix = document.createElement("span");
            suffix.textContent = " … See more";
            suffix.style.fontWeight = "600";
            probe.appendChild(suffix);
          }
          return probe.scrollHeight <= maxHeight;
        };

        let result: { text: string; clipped: boolean };
        // A slide carrying an image asks to read on whatever its length, so
        // the ask itself has to fit before the text counts as whole.
        if (fits(words.length, hasImage)) {
          result = { text: bodyText, clipped: false };
        } else {
          let low = 0;
          let high = words.length;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (fits(middle, true)) low = middle;
            else high = middle - 1;
          }
          result = { text: words.slice(0, low).join(" "), clipped: true };
        }
        probe.remove();
        setBodyFit((previous) =>
          previous && previous.source === bodyText && previous.text === result.text && previous.clipped === result.clipped
            ? previous
            : { source: bodyText, ...result }
        );
      });
    };
    measure();
    // The card is measured again when the slide turns, the width changes or
    // the web font lands late and the lines re-wrap.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bodyText, current?.id, hasImage]);

  // A measurement belongs to the notice it measured: while the next slide is
  // being measured the card shows that slide's own opening words, never the
  // tail of the one before.
  const measured = bodyFit && bodyFit.source === bodyText ? bodyFit : null;
  const bodyShown = bodyText ? measured?.text ?? bodyText : "";
  const bodyClipped = Boolean(bodyText && measured?.clipped);

  /** The ask to open the full feed, on whichever kind of notice the slide is:
      the body was cut after its last whole word, or the card carries an image
      a visitor can enlarge but cannot see in full here. Every type asks on
      those same terms — a giving call can run past four lines too. */
  const showSeeMore = Boolean(current && (bodyClipped || hasImage));

  /** The pledge modal's view of the slide the member is looking at. */
  const pledgeTargetFor = (announcement: Announcement): PledgeTarget => ({
    id: announcement.id,
    title: announcement.title,
    action_type: announcement.action_type,
    support_account_display: announcement.support_account_display,
    event_date_from: announcement.event_date_from,
    event_date_to: announcement.event_date_to,
  });

  /** Give Now means money: the rail leaves for the giving page with the
      post's purpose named, which is where the money form lives. Goods are the
      card's own Give in kind button, never this one. */
  const giveMoneyFor = (announcement: Announcement) => {
    router.push(`/give?purpose=${encodeURIComponent(announcement.support_account_display || announcement.title || "")}`);
  };

  return (
    // `h-full`: on a wide screen the card shares a row with the pages beside
    // it, and filling the row keeps the two panels' feet level instead of
    // leaving the short one floating.
    //
    // The body reads four lines now, so the card's own vertical padding — the
    // air above and below what it holds — gives a line of that back: the card
    // grows by a hair rather than by a whole line, and the panels under it
    // stay where they were.
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsInteracting(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsInteracting(false);
      }}
      className="relative h-full rounded-3xl border border-sand-line bg-white px-6 py-3 shadow-sm sm:px-8"
    >
      {/* The whole card opens the Fellowship feed: this overlay link fills the
          card and the content above it is given back to the pointer, so a
          click anywhere — the title, the body, the empty space — lands here.
          Only the controls take their own clicks (they carry
          `pointer-events-auto`). */}
      <Link
        // The slide the member pressed travels with them: the feed opens with
        // that notice in focus rather than at the top of the list.
        href={current ? `/announcements?id=${current.id}` : "/announcements"}
        aria-label={current ? `Open announcement: ${current.title}` : "Open announcements"}
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
            title holds one line, the body always has room for four lines
            and the detail line keeps its slot even when empty — so the
            panels below never jump as the slides turn. The action row sits
            tight under the text so the extra line costs no height. */}
        <div className="mt-1.5">
          <h2 className="line-clamp-1 text-lg font-bold leading-snug text-bark sm:text-xl">
            {current ? current.title : gathering ? gatheringLabel(gathering, now) : "Our week together"}
          </h2>
          {/* A notice that runs past the four lines is trimmed back to its
              last whole word, and See more follows that word in the same
              sentence — never pinned over half a word. A slide carrying an
              image asks to read on whatever its length, with no ellipsis to
              own the line. */}
          <div className="relative">
            <p ref={bodyRef} className="mt-0.5 min-h-[6rem] overflow-hidden text-sm leading-6 text-moss-mid">
              {current ? bodyShown : gathering
                ? `${gathering.time} · ${gathering.online ? "Online" : gathering.place || churchWhere(settings) || "Church grounds"}`
                : "The week's meetings are still being set up."}
              {/* The ask follows the last whole word, in the sentence it
                  ends, and wraps with it rather than sitting over the text. */}
              {current && showSeeMore && (
                <>
                  {" "}
                  <Link
                    href={`/announcements?id=${current.id}`}
                    className="pointer-events-auto whitespace-nowrap font-semibold text-ember"
                  >
                    <span aria-hidden="true">{bodyClipped ? "… " : ""}</span>See more
                  </Link>
                </>
              )}
            </p>
          </div>
          <p className="line-clamp-1 min-h-[1.125rem] text-xs leading-[1.125rem] text-moss">
            {current?.detail || ""}
          </p>

        </div>

        {/* The announcement's own actions. Clicking the card opens the full
            announcement in the feed; a giving call carries the buttons its
            officer ticked — Give Now for money, Give in kind for goods, Pledge
            for a promise — and nothing it did not ask for. Comment lives in
            the feed: the thread is one tap away through the card itself, and
            the card's foot stays one line of doing rather than talking. */}
        <div className="flex items-center justify-between gap-3">
          {isGiving && (
            <div className="flex-1">
              {/* Only the buttons the officer chose for this post. */}
              <div className={`grid gap-2 ${(() => {
                const count = current ? chosenActions(current).length : 0;
                return count >= 4 ? "grid-cols-2 sm:grid-cols-4" : count === 3 ? "grid-cols-3" : count === 2 ? "grid-cols-2" : "grid-cols-1";
              })()}`}>
                {(current ? chosenActions(current) : []).map((code) => {
                  if (code === "give_now") {
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => { if (current) giveMoneyFor(current); }}
                        className="pointer-events-auto rounded-full bg-sage-strong px-2 py-2 text-xs font-bold text-white transition hover:bg-sage-shade"
                      >
                        Give Now
                      </button>
                    );
                  }
                  if (code === "pledge") {
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => { if (current) setPledgeTarget(pledgeTargetFor(current)); }}
                        className="pointer-events-auto rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                      >
                        Pledge
                      </button>
                    );
                  }
                  if (code === "in_kind") {
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setInKindOpen(true)}
                        className="pointer-events-auto rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                      >
                        Give in kind
                      </button>
                    );
                  }
                  // An officer's saved choice the card no longer carries —
                  // Comment lives in the feed — renders nothing.
                  return null;
                })}
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
          {linkHref && current && (
            /* A conference reads top to bottom: the hour the meeting begins
               and the way in share one row, read before the tap. */
            <div className="ml-auto flex items-center justify-end gap-2.5 sm:gap-3">
              {countdown && (
                <span className="whitespace-nowrap text-xs font-semibold text-moss" aria-live="polite">
                  {countdown}
                </span>
              )}
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto inline-flex items-center justify-center whitespace-nowrap rounded-full bg-ember px-4 py-2 text-xs font-bold text-white transition hover:bg-ember-dark sm:px-5"
              >
                {linkCode === "enroll" ? "Enroll now" : linkCode === "register" ? "Register now" : platformLabel(current.href)}
              </a>
            </div>
          )}
          {/* The next gathering is online: the same way in the conference
              slide carries — the hour it begins, then the join button. */}
          {!current && gathering?.online && gathering.link && (
            <div className="ml-auto flex items-center justify-end gap-2.5 sm:gap-3">
              {countdown && (
                <span className="whitespace-nowrap text-xs font-semibold text-moss" aria-live="polite">
                  {countdown}
                </span>
              )}
              <a
                href={gathering.link}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto inline-flex items-center justify-center whitespace-nowrap rounded-full bg-ember px-4 py-2 text-xs font-bold text-white transition hover:bg-ember-dark sm:px-5"
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

      {/* An opinion card's Give input opens this box: the thread above, a
          500-character composer beneath. */}
      <AnnouncementCommentModal
        open={Boolean(commentFor)}
        onClose={() => setCommentFor(null)}
        announcement={commentFor ? { id: commentFor.id, title: commentFor.title } : null}
      />
    </div>
  );
}
