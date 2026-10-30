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
import { GiveMethodModal } from "@/components/give-method-modal";
import { GiveNowModal } from "@/components/give-now-modal";
import { PledgeModal, type PledgeTarget } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { eventLabel } from "@/lib/announcement-dates";
import { dayFirst } from "@/lib/dates";

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
  is_popup?: boolean;
  expires_at?: string | null;
  created_at: string;
  fund_drive?: FundDrive | null;
  /** The giving buttons this post carries; empty = the default trio. */
  giving_actions?: string[];
};

/** The giving buttons an announcement's card actually shows, resolved from
 *  the officer's pick. An old post that predates the choice reads the list
 *  every card used to carry. Give now opens the money-or-goods choice — it
 *  already offers the in-kind form — so Support only gains its own button
 *  where Give now was left off; otherwise the two would be two doors to the
 *  same goods form on one card. */
function chosenActions(item: FeedItem): string[] {
  const chosen = item.giving_actions?.length ? item.giving_actions : ["give_now", "pledge", "comment"];
  const order = ["give_now", "pledge", "in_kind", "comment"];
  return chosen
    .filter((code) => code !== "in_kind" || !chosen.includes("give_now"))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** The drive's own giving link, opened straight into the giving modal. */
function driveGiveHref(drive: FundDrive) {
  return `/give?purpose=${encodeURIComponent(drive.title || drive.name)}`;
}

export function AnnouncementsFeed({
  embedded = false,
  /** The office manages the board: each card carries its own Edit and
      Delete, the acts the manager's board rows used to hold. The host
      (the eldership desk's Sharing) supplies where Edit opens. */
  canManage = false,
  onEdit,
  onChanged,
}: {
  embedded?: boolean;
  canManage?: boolean;
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
  const [pledgeDone, setPledgeDone] = useState<number[]>([]);
  // A contribution card's Give Now opens the money-or-goods choice here, so
  // the card keeps three buttons (Give Now, Pledge, Comment) instead of the
  // old inline combo of Pledge / In-kind / Give Money.
  const [methodFor, setMethodFor] = useState<FeedItem | null>(null);
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

  /** One card's take-down, the way the manager's board does it: asked
      once, then deleted for everyone. The feed reads without the row the
      moment it is gone, and the host re-reads its own stores too. */
  async function takeDown(item: FeedItem) {
    const Swal = (await import("sweetalert2")).default;
    const result = await Swal.fire({
      title: "Delete this announcement?",
      text: `"${item.title}" will be taken down for everyone. This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#b91c1c",
    });
    if (!result.isConfirmed) return;
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_URL}/api/members/announcements/${item.id}/`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete announcement.");
      }
      setItems((current) => current.filter((row) => row.id !== item.id));
      onChanged?.();
      await Swal.fire({
        title: "Announcement Deleted",
        text: `Announcement "${item.title}" was successfully deleted.`,
        icon: "success",
      });
    } catch (error) {
      await Swal.fire({
        title: "Delete Error",
        text: error instanceof Error ? error.message : "Failed to delete announcement.",
        icon: "error",
      });
    }
  }

  // The feed is the one live list. Each announcement carries the window it
  // is displayed for, so there is no From/To to pick and nothing that has
  // finished its run is served.
  const visibleItems = items;
  const loadFeed = useCallback(() => {
    setLoading(true);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: FeedItem[]) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

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
    <div className="max-w-7xl mx-auto space-y-4">
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
            // A support-account post carries its own giving actions —
            // the same Pledge / In-kind / Give Money row a drive gets.
            const supportGives = !isDrive && Boolean(item.support_account_display);
            // The buttons the officer chose for this post, in the
            // card's reading order.
            const feedActions = chosenActions(item);
            const actionGrid =
              feedActions.length >= 4 ? "grid-cols-2 sm:grid-cols-4" :
              feedActions.length === 3 ? "grid-cols-3" :
              feedActions.length === 2 ? "grid-cols-2" : "grid-cols-1";
            // The area a post is addressed to, by name: the first of
            // this account's areas whose audience code the post carries.
            const itemBadge = (item.audience ?? [])
              .map((code) => myDepartments.find((dept) => dept.audience_code === code)?.label)
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
                          <button
                            type="button"
                            onClick={() => void takeDown(item)}
                            className="rounded-lg border border-sand-line bg-white px-2 py-0.5 text-[10px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                  {eventLabel(item) && (
                    <p className="mt-1 text-sm font-semibold text-ember">Event date: {eventLabel(item)}</p>
                  )}
                  <p className="mt-2 text-sm leading-6 text-bark">{item.text}</p>
                  {item.href && (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ember underline underline-offset-2"
                    >
                      {item.announcement_type === "job_vacancy" ? "Apply / View details" : "Open link"}{" "}
                      <ArrowUpRight size={12} className="inline" aria-hidden="true" />
                    </a>
                  )}

                  {/* A card with nothing to give still carries the one
                      Comment button at its foot — expanding the thread inline. */}

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

                {/* The giving actions, one row: only the buttons the
                    officer chose for this post. The money-or-goods
                    choice lives inside Give Now's own modal, so a full
                    row still carries everything; a Support button only
                    stands alone where Give now was left off. */}
                {(supportGives || (isDrive && drive)) && feedActions.length > 0 && (
                  <div className="mt-3 border-t border-sand-line pt-3">
                    <div className={`grid gap-2 ${actionGrid}`}>
                      {feedActions.map((code) => {
                        if (code === "give_now") {
                          return (
                            <button
                              key="give_now"
                              type="button"
                              onClick={() => setMethodFor(item)}
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
                              Support
                            </button>
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

                {!supportGives && !isDrive && (
                  <div className="mt-3 border-t border-sand-line pt-3">
                    {(() => {
                      const isExpanded = Boolean(expandedComments[item.id]);
                      return (
                        <button
                          type="button"
                          onClick={() => toggleComment(item.id)}
                          className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${
                            isExpanded
                              ? "border-ember bg-sand text-ember"
                              : "border-sand-mute bg-white text-bark hover:border-ember hover:text-ember"
                          }`}
                        >
                          {isExpanded ? "Hide comments" : "Comment"}
                        </button>
                      );
                    })()}
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

      {/* The money-or-goods choice behind a contribution card's Give Now.
          Each option runs the same form the old inline button opened — a
          drive's money still leaves for the giving page with its purpose
          named, a support post opens the money modal with its account chosen. */}
      <GiveMethodModal
        open={Boolean(methodFor)}
        onClose={() => setMethodFor(null)}
        title={methodFor?.fund_drive?.title || methodFor?.title || null}
        onGiveMoney={() => {
          const item = methodFor;
          setMethodFor(null);
          if (!item) return;
          if (item.kind === "fund_drive" && item.fund_drive) router.push(driveGiveHref(item.fund_drive));
          else setSupportAccount(item.support_account_display ?? null);
        }}
        onGiveInKind={() => {
          const item = methodFor;
          setMethodFor(null);
          if (item) setInKindFor(item);
        }}
      />
    </>
  );

  if (embedded) {
    // Inside a host card (the eldership desk's Sharing): scroll within the
    // room the host already drew — no shell of its own.
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-hover-scrollbar">
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
