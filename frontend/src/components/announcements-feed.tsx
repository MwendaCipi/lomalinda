"use client";

/**
 * The announcements feed — the notice board as it reads on the Fellowship
 * page (/announcements), extracted so other places can wear the exact same
 * simple face on one screenful: flat cards, no manager chrome, no nesting.
 *
 * Full page (`embedded={false}`, the default) the feed renders the page's
 * own shell — paddings, scroll, the giving modals over it. Embedded (the
 * eldership desk's Sharing view) it drops the shell and scrolls inside the
 * card its host already drew, with the same cards and the same modals.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { AnnouncementInlineComments } from "@/components/announcement-comment-modal";
import { GiveNowModal } from "@/components/give-now-modal";
import { PledgeModal, type PledgeTarget } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { EventEnrollModal } from "@/components/event-enroll-modal";
import { eventLabel } from "@/lib/announcement-dates";
import { cardButtons } from "@/lib/announcement-options";
import { dayFirst, dayFirstTime } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** A department this signed-in account belongs to — its roll, or the office
    that leads it — as /me reports it, with the audience code its posts carry. */
type MyDepartment = { code: string; label: string; audience_code: string };

type FundDrive = {
  id: number;
  name: string;
  title?: string;
  description?: string;
  target_amount: number | string;
  total_raised: number;
  percentage_raised: number;
  end_date?: string | null;
  donor_count?: number;
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
};

type FeedItem = {
  id: number;
  kind?: "announcement" | "fund_drive";
  title: string;
  text: string;
  href?: string | null;
  event_date_from?: string | null;
  event_date_to?: string | null;
  event_time_from?: string | null;
  event_time_to?: string | null;
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  visibility: string;
  audience?: string[];
  announcement_type?: "awareness" | "web_conference" | "promotion" | "opinion" | "job_vacancy";
  response_mode?: "open" | "closed" | "";
  response_options?: string;
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  support_account?: string | null;
  support_account_display?: string | null;
  /** An Enroll now / Register now post is also a department event. */
  enroll_department?: string | null;
  enroll_fee?: string | number | null;
  enroll_deadline?: string | null;
  enrollment_event?: number | null;
  is_popup?: boolean;
  expires_at?: string | null;
  created_at: string;
  fund_drive?: FundDrive | null;
  /** The buttons this post's card carries, as the officer ticked them. */
  options?: string[];
  /** When a scheduled post goes live, and how the notice repeats. */
  publish_at?: string | null;
  repeat?: "none" | "daily" | "weekly" | "monthly";
  /** False for a post the office has written but not let out yet. */
  published?: boolean;
};

/** The buttons an announcement's card shows — exactly the officer's ticks,
 *  in the strip's reading order. Money and goods are separate asks (Give now
 *  and Give in kind), so a post that wants both carries both buttons and a
 *  post that wants one is not quietly given the other as well. */
function chosenActions(item: FeedItem): string[] {
  return cardButtons(item.options);
}

/** The hour a post is still waiting for, or null once that hour has come. */
function waitingFor(item: FeedItem): Date | null {
  if (!item.publish_at) return null;
  const at = new Date(item.publish_at);
  return !Number.isNaN(at.getTime()) && at.getTime() > Date.now() ? at : null;
}

/** Why the desk sees a post the feed does not, in the desk's own words: it is
    a draft, it is waiting for its hour, or both. */
function deskNotice(item: FeedItem): string | null {
  const draft = item.published === false;
  const waiting = waitingFor(item);
  if (draft && waiting) return `Draft — not published yet; goes live ${dayFirstTime(item.publish_at)}`;
  if (draft) return "Draft — not published yet";
  if (waiting) return `Not in the feed yet — goes live ${dayFirstTime(item.publish_at)}`;
  return null;
}

/** What a link button says on the card: the service it opens, where the
 *  church meets on one it recognises — Google Meet, Zoom, Teams, Webex — and
 *  "Open link" for anything else. A link that will not parse is the plain
 *  case, not an error: nothing is promised by its wording. */
function linkLabel(href: string): string {
  let host = "";
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return "Open link";
  }
  if (host === "meet.google.com") return "Open Google Meet";
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Open Zoom";
  if (host === "teams.microsoft.com" || host === "teams.live.com") return "Open Microsoft Teams";
  if (host === "webex.com" || host.endsWith(".webex.com")) return "Open Webex";
  if (host === "meet.jit.si") return "Open Jitsi Meet";
  return "Open link";
}

/** The drive's own giving link, opened straight into the giving modal. */
function driveGiveHref(drive: FundDrive) {
  return `/give?purpose=${encodeURIComponent(drive.title || drive.name)}`;
}

export function AnnouncementsFeed({
  embedded = false,
  /** The office manages the board: each card carries its own Edit — Delete
      and Hide live in the composer's own bottom buttons instead, so the
      card stays a reading surface. The host (the eldership desk's
      Sharing) supplies where Edit opens. */
  canManage = false,
  /** The desk reads what is still waiting too: a post scheduled for a later
      hour is listed here, wearing the hour it goes live, so the office can
      open it and change the schedule. The fellowship feed — the board
      members read — never asks for it, so nothing scheduled is shown there
      before its hour. */
  includeScheduled = false,
  /** The desk also reads the drafts it has not let out yet — a post written
      and set aside, listed so the office can finish it or publish it. The
      API serves drafts to the office that keeps the board; other surfaces
      ask without this and never see one. */
  includeUnpublished = false,
  onEdit,
  onChanged,
}: {
  embedded?: boolean;
  canManage?: boolean;
  includeScheduled?: boolean;
  includeUnpublished?: boolean;
  onEdit?: (item: FeedItem) => void;
  onChanged?: () => void;
} = {}) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [supportAccount, setSupportAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Pledging and in-kind giving happen in modals over the feed, so a member
  // never loses their place to give.
  const [pledgeTarget, setPledgeTarget] = useState<PledgeTarget | null>(null);
  const [inKindFor, setInKindFor] = useState<FeedItem | null>(null);
  // The post whose Enroll now / Register now button opened its register.
  const [enrollFor, setEnrollFor] = useState<FeedItem | null>(null);
  const [pledgeDone, setPledgeDone] = useState<number[]>([]);

  // Comments on announcements appear inline beneath the card.
  const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});
  const toggleComment = (id: number) =>
    setExpandedComments((prev) => ({ ...prev, [id]: !prev[id] }));
  // A drive's money gift still leaves for the giving page with its purpose
  // named; the other cards open the money modal in place.
  const router = useRouter();
  // Opinion answering: which card's form is open, what is typed or picked.
  const [opinionId, setOpinionId] = useState<number | null>(null);
  const [opinionText, setOpinionText] = useState("");
  const [opinionChoice, setOpinionChoice] = useState("");
  const [opinionBusy, setOpinionBusy] = useState(false);
  const [opinionDone, setOpinionDone] = useState<number[]>([]);

  // The departments this account belongs to, from /me — the names a post's
  // badge reads when it is addressed to one of them. The old strip of
  // department tabs — one chip per area, a whole congregation's worth for
  // the offices — is gone: a post that belongs to a department or ministry
  // wears that area's name, and the feed itself stays one unfiltered list.
  const [myDepartments, setMyDepartments] = useState<MyDepartment[]>([]);

  // The feed is the one live list. Each announcement carries the window it
  // is displayed for, so there is no From/To to pick and nothing that has
  // finished its run is served.
  const visibleItems = items;
  const loadFeed = useCallback(() => {
    setLoading(true);
    const token = localStorage.getItem("access_token");
    // The desk's view asks for what is still waiting — the drafts and the
    // posts held for their hour; every other surface leaves them out, which
    // is what the API does by default.
    const params = new URLSearchParams();
    if (includeScheduled) params.set("include_scheduled", "true");
    if (includeUnpublished) params.set("include_unpublished", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    fetch(`${API_URL}/api/members/announcements/${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: FeedItem[]) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [includeScheduled, includeUnpublished]);

  // One load: the feed, plus the departments this account belongs to (the
  // names a post's department badge reads).
  useEffect(() => {
    // The load's state writes ride a microtask, which keeps the effect's own
    // synchronous body from cascading the render — the same shape the desks
    // use for their own loads.
    void Promise.resolve().then(loadFeed);
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.my_departments)) setMyDepartments(data.my_departments);
      })
      .catch(() => setMyDepartments([]));
  }, [loadFeed]);

  /** Submit an opinion answer, then confirm inline on the card. */
  async function submitOpinion(item: FeedItem) {
    if (opinionBusy) return;
    const isClosed = item.response_mode === "closed";
    if (isClosed && !opinionChoice) return;
    if (!isClosed && !opinionText.trim()) return;
    setOpinionBusy(true);
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_URL}/api/members/announcements/${item.id}/action/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          action_type: "respond",
          response_text: isClosed ? "" : opinionText.trim(),
          response_choice: isClosed ? opinionChoice : "",
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Unable to submit your response.");
      }
      setOpinionDone((current) => [...current, item.id]);
      setOpinionId(null);
      setOpinionText("");
      setOpinionChoice("");
    } catch {
      // The form stays open so the answer is not lost; the member can retry.
    } finally {
      setOpinionBusy(false);
    }
  }

  /** Give Now means money, and only money: the goods door is the card's own
   *  Give in kind button. A drive's gift leaves for the giving page with its
   *  purpose named; a support post opens the money form in place. */
  const giveMoneyFor = (item: FeedItem) => {
    if (item.kind === "fund_drive" && item.fund_drive) {
      router.push(driveGiveHref(item.fund_drive));
      return;
    }
    setSupportAccount(item.support_account_display ?? item.title ?? null);
  };

  /** One giving card's pledge target — a drive pledges as a response. */
  const pledgeTargetFor = (item: FeedItem): PledgeTarget => ({
    id: item.id,
    title: item.title,
    action_type: item.kind === "fund_drive" ? "respond" : item.action_type || "none",
    support_account_display: item.support_account_display || item.fund_drive?.title || null,
    event_date_from: item.event_date_from,
    event_date_to: item.event_date_to,
  });

  const feed = (
    // Embedded, the host card is the frame, so the feed takes its whole width;
    // standalone it keeps the reading measure.
    <div className={`space-y-4 ${embedded ? "" : "mx-auto max-w-7xl"}`}>
      {/* The cards themselves are compact — there is no comfortable/
                compact toggle here, the feed is a notice board and reads best
                tight. */}

      {loading ? <p className="text-sm text-moss">Loading announcements…</p> : visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand-mute bg-white p-10 text-center text-moss">No announcements found.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleItems.map((item) => {
            const isDrive = item.kind === "fund_drive" && item.fund_drive;
            const drive = item.fund_drive;
            // The buttons the officer chose for this post, in the
            // card's reading order.
            const feedActions = chosenActions(item);
            // One button keeps its own width and sits at the row's right-hand
            // end, the way a lone action reads on a card; two or more share
            // the row as a grid.
            const actionsClass =
              feedActions.length === 1
                ? "flex justify-end"
                : `grid gap-2 ${feedActions.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : feedActions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`;
            // The area a post is addressed to, by name: the first of
            // this account's areas whose audience code the post carries.
            const itemBadge = (item.audience ?? [])
              .map((code) =>
                code === "elders"
                  ? "Elders"
                  : myDepartments.find((dept) => dept.audience_code === code)?.label
              )
              .find(Boolean);
            // A little more room than the ledger cards: the notice
            // reads as a card of its own, never a squashed strip.
            const cardClasses = "flex min-h-28 flex-col justify-between rounded-2xl border border-sand-line bg-white p-5 text-sm shadow-sm md:min-h-40 md:p-6";
            const content = (
              <>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold">{item.title}</h2>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.announcement_type === "job_vacancy" && (
                        <span className="whitespace-nowrap rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          Job Vacancy
                        </span>
                      )}
                      {itemBadge && (
                        <span className="whitespace-nowrap rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss">
                          {itemBadge}
                        </span>
                      )}
                      {canManage && (
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEdit?.(item)}
                            className="rounded-lg border border-sand-line bg-white px-2 py-0.5 text-[10px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                          >
                            Edit
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Why the desk sees a post the feed does not — held for
                      its hour, or not published at all — said on the card,
                      so the office knows what is waiting to go out. */}
                  {deskNotice(item) && (
                    <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                      {deskNotice(item)}
                    </p>
                  )}
                  {eventLabel(item) && (
                    <p className="mt-1 text-sm font-semibold text-ember">Event date: {eventLabel(item)}</p>
                  )}
                  <p className="mt-2 text-sm leading-6 text-bark">{item.text}</p>
                  {/* The card's links are its buttons now — a plain hyperlink
                      under the words said nothing the button does not say
                      better. A vacancy keeps its own line, since applying is
                      the whole point of posting it. */}
                  {item.href && item.announcement_type === "job_vacancy" && (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ember underline underline-offset-2"
                    >
                      Apply / View details{" "}
                      <ArrowUpRight size={12} className="inline" aria-hidden="true" />
                    </a>
                  )}

                  {/* An Opinion post asks the congregation a question;
                      the answer arrives in the shape the officer chose
                      — free text, or a pick among the posted options. */}
                  {item.announcement_type === "opinion" && (
                    <div className="mt-3 border-t border-sand-line pt-3">
                      {opinionDone.includes(item.id) ? (
                        <p className="text-sm font-semibold text-sage-strong">Thank you. Your response has been recorded.</p>
                      ) : opinionId === item.id ? (
                        <div className="space-y-3">
                          {item.response_mode === "closed" && item.response_options ? (
                            <div className="space-y-2">
                              {item.response_options.split("\n").map((line) => line.trim()).filter(Boolean).map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => setOpinionChoice(option)}
                                  className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition ${opinionChoice === option ? "border-ember bg-sand-airy text-bark" : "border-sand-mute bg-white text-moss-mid hover:border-ember"}`}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <textarea
                              rows={3}
                              value={opinionText}
                              onChange={(event) => setOpinionText(event.target.value)}
                              placeholder="Write your response..."
                              className="w-full rounded-xl border border-sand-mute px-3.5 py-2.5 text-sm outline-none focus:border-ember"
                            />
                          )}
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={opinionBusy || (item.response_mode === "closed" ? !opinionChoice : !opinionText.trim())}
                              onClick={() => submitOpinion(item)}
                              className="rounded-full bg-ember px-5 py-2 text-sm font-bold text-white transition hover:bg-ember-dark disabled:opacity-50"
                            >
                              {opinionBusy ? "Submitting..." : "Send response"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setOpinionId(null); setOpinionText(""); setOpinionChoice(""); }}
                              className="text-sm font-semibold text-moss hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setOpinionId(item.id); setOpinionChoice(""); setOpinionText(""); }}
                          className="rounded-full bg-ember px-4 py-1.5 text-xs font-bold text-white transition hover:bg-ember-dark"
                        >
                          Respond
                        </button>
                      )}
                    </div>
                  )}

                  {isDrive && drive && (
                    <div className="mt-3 rounded-2xl bg-sand p-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-bark">
                        <span>KES {Number(drive.total_raised || 0).toLocaleString("en-KE")}</span>
                        <span className="text-moss">
                          of KES {Number(drive.target_amount || 0).toLocaleString("en-KE")} · {Number(drive.percentage_raised || 0).toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand-line">
                        <div
                          className="h-full rounded-full bg-ember"
                          style={{ width: `${Math.min(100, Math.max(0, Number(drive.percentage_raised || 0)))}%` }}
                        />
                      </div>
                      {drive.end_date && (
                        <p className="mt-1.5 text-[11px] text-moss">
                          Closes {dayFirst(drive.end_date)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {item.attachment && (
                  <div className="mt-3 border-t border-sand-line pt-3">
                    <AnnouncementAttachment
                      attachment={item.attachment}
                      name={item.attachment_name}
                      size={item.attachment_size}
                      mediaHeight="md"
                    />
                  </div>
                )}

                {/* The card's buttons, one row at the card's foot: only the
                    ones the officer ticked for this post. Give now asks for
                    money and Give in kind asks for goods, each on its own
                    button, so the officer decides which of the two a post
                    carries. A meeting, class or form is a link — the same tie
                    the card's own link opens. */}
                {feedActions.length > 0 && (
                  <div className="mt-3 border-t border-sand-line pt-3">
                    <div className={actionsClass}>
                      {feedActions.map((code) => {
                        if (code === "give_now") {
                          return (
                            <button
                              key="give_now"
                              type="button"
                              onClick={() => giveMoneyFor(item)}
                              className="rounded-full bg-sage-strong px-2 py-2 text-xs font-bold text-white transition hover:bg-sage-shade"
                            >
                              Give Now
                            </button>
                          );
                        }
                        if (code === "pledge") {
                          return (
                            <button
                              key="pledge"
                              type="button"
                              onClick={() => setPledgeTarget(pledgeTargetFor(item))}
                              className="rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                            >
                              Pledge
                            </button>
                          );
                        }
                        if (code === "in_kind") {
                          return (
                            <button
                              key="in_kind"
                              type="button"
                              onClick={() => setInKindFor(item)}
                              className="rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                            >
                              Give in kind
                            </button>
                          );
                        }
                        if (code === "enroll" || code === "register") {
                          // Enrolling is a seat on the event the post created,
                          // not a link out: the member pays the fee on the card.
                          if (!item.enrollment_event || !item.enroll_department) return null;
                          const closed =
                            Boolean(item.enroll_deadline) &&
                            String(item.enroll_deadline) < new Date().toISOString().slice(0, 10);
                          return (
                            <button
                              key={code}
                              type="button"
                              disabled={closed}
                              onClick={() => setEnrollFor(item)}
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-sand-mute bg-white px-3 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember disabled:opacity-45"
                            >
                              {closed ? "Registration closed" : code === "enroll" ? "Enroll now" : "Register now"}
                            </button>
                          );
                        }
                        if (code === "join_meeting") {
                          if (!item.href) return null;
                          const label = linkLabel(item.href);
                          return (
                            <a
                              key={code}
                              href={item.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-1 rounded-full border border-sand-mute bg-white px-2 py-2 text-xs font-bold text-bark transition hover:border-ember hover:text-ember"
                            >
                              {label}
                            </a>
                          );
                        }
                        const isExpanded = Boolean(expandedComments[item.id]);
                        return (
                          <button
                            key="comment"
                            type="button"
                            onClick={() => toggleComment(item.id)}
                            className={`rounded-full border px-2.5 py-2 text-xs font-bold transition ${
                              isExpanded
                                ? "border-ember bg-sand text-ember"
                                : "border-sand-mute bg-white text-bark hover:border-ember hover:text-ember"
                            }`}
                          >
                            {isExpanded ? "Hide comments" : "Comment"}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* The pledge itself is recorded in the modal the card's
                    Pledge button opens; the pledge lands in the
                    announcement's responses, where the CSV export
                    reaches it. The card keeps the confirmation. */}
                {pledgeDone.includes(item.id) && (
                  <p className="mt-2 text-xs font-semibold text-sage-strong">Thank you. Your pledge has been recorded.</p>
                )}

                {/* Inline comments thread expanded directly beneath the card */}
                {expandedComments[item.id] && (
                  <AnnouncementInlineComments announcementId={item.id} title={item.title} />
                )}
              </>
            );

            return <article key={item.id} className={cardClasses}>{content}</article>;
          })}
        </div>
      )}
    </div>
  );

  // The giving form, opened by a support-account post's Give now, with
  // that account already chosen. Closing returns to the feed.
  const modals = (
    <>
      <GiveNowModal
        open={Boolean(supportAccount)}
        onClose={() => setSupportAccount(null)}
        presetAccount={supportAccount ?? undefined}
      />

      {/* Pledging and in-kind giving open over the feed, so a member gives
          from the card that asked without losing their place in it. */}
      <PledgeModal
        open={Boolean(pledgeTarget)}
        onClose={() => setPledgeTarget(null)}
        target={pledgeTarget}
        onPledged={() => {
          if (pledgeTarget) setPledgeDone((current) => [...current, pledgeTarget.id]);
        }}
      />
      <InKindGiftModal
        open={Boolean(inKindFor)}
        onClose={() => setInKindFor(null)}
        defaultPurpose={inKindFor?.support_account_display || inKindFor?.fund_drive?.title || undefined}
        announcementTitle={inKindFor?.title}
      />
      <EventEnrollModal
        target={
          enrollFor && enrollFor.enrollment_event && enrollFor.enroll_department
            ? {
                event: enrollFor.enrollment_event,
                department: enrollFor.enroll_department,
                title: enrollFor.title,
                fee: enrollFor.enroll_fee ?? 0,
                deadline: enrollFor.enroll_deadline ?? null,
              }
            : null
        }
        onClose={() => setEnrollFor(null)}
      />
    </>
  );

  if (embedded) {
    // Inside the desk's Sharing page (eldership, pastorate): no scroll room
    // of its own — the page itself scrolls, the way the fellowship feed
    // does, so posts flow freely instead of sliding under a hard edge. The
    // host is drawn edge to edge, so the feed keeps a line of air inside
    // it: the posts are cards without a table beneath them, and flush
    // against the host's border they read as clipped rather than rested.
    return (
      <div className="flex flex-col p-1.5 sm:p-2">
        {feed}
        {modals}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white text-bark">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 h-full md:h-full bg-white px-5 pb-5 pt-4 sm:px-8 sm:pb-8 sm:pt-5 lg:px-10 lg:pb-10 lg:pt-6 md:overflow-y-auto custom-hover-scrollbar">
          {feed}
        </div>
      </div>
      {modals}
    </main>
  );
}
