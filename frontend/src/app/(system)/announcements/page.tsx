"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FellowshipSidebar } from "@/components/sidebars/fellowship-sidebar";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { GiveNowModal } from "@/components/give-now-modal";
import { PledgeModal, type PledgeTarget } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { eventLabel } from "@/lib/announcement-dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  visibility: string;
  audience?: string[];
  announcement_type?: "awareness" | "web_conference" | "promotion" | "opinion";
  response_mode?: "open" | "closed" | "";
  response_options?: string;
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  support_account?: string | null;
  support_account_display?: string | null;
  is_popup?: boolean;
  expires_at?: string | null;
  created_at: string;
  fund_drive?: FundDrive | null;
};

/** The drive's own giving link, opened straight into the giving modal. */
function driveGiveHref(drive: FundDrive) {
  return `/give?purpose=${encodeURIComponent(drive.title || drive.name)}`;
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [supportAccount, setSupportAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Pledging and in-kind giving happen in modals over the feed, so a member
  // never loses their place to give.
  const [pledgeTarget, setPledgeTarget] = useState<PledgeTarget | null>(null);
  const [inKindFor, setInKindFor] = useState<FeedItem | null>(null);
  const [pledgeDone, setPledgeDone] = useState<number[]>([]);
  // Opinion answering: which card's form is open, what is typed or picked.
  const [opinionId, setOpinionId] = useState<number | null>(null);
  const [opinionText, setOpinionText] = useState("");
  const [opinionChoice, setOpinionChoice] = useState("");
  const [opinionBusy, setOpinionBusy] = useState(false);
  const [opinionDone, setOpinionDone] = useState<number[]>([]);

  // The feed is what is live right now, nearest event first. Each announcement
  // carries the window it is displayed for, so there is no From/To to pick and
  // nothing that has finished its run is served.
  const loadFeed = useCallback(() => {
    setLoading(true);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: FeedItem[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }, []);

  // Drives are announced through the same feed; keep the state name the rest
  // of the page already reads.
  const setAnnouncements = (rows: FeedItem[]) => setItems(rows);

  // One load: nothing on the page narrows the feed any more.
  useEffect(() => {
    loadFeed();
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

  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <FellowshipSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6 container">
            {/* Just the heading: the feed below is what the page is for, and
                nothing is served but what is live now. */}
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Announcements</h1>

            {loading ? <p className="text-sm text-[#617068]">Loading announcements…</p> : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-10 text-center text-[#617068]">No announcements found.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {items.map((item) => {
                  const isDrive = item.kind === "fund_drive" && item.fund_drive;
                  const drive = item.fund_drive;
                  // A support-account post carries its own giving actions —
                  // the same Pledge / In-kind / Give Money row a drive gets.
                  const supportGives = !isDrive && Boolean(item.support_account_display);
                  const cardClasses = "flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm sm:p-7";
                  const content = (
                    <>
                      <div>
                        {/* No eyebrow and no badge row: the card is in the
                            announcements feed, so the title, its event date
                            and the words are the whole story. */}
                        <h2 className="text-xl font-semibold sm:text-2xl">{item.title}</h2>
                        {eventLabel(item) && (
                          <p className="mt-2 text-sm font-semibold text-[#b36b3c]">Event date: {eventLabel(item)}</p>
                        )}
                        <p className="mt-3 text-base leading-7 text-[#26352f]">{item.text}</p>
                        {item.href && (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex text-sm font-semibold text-[#b36b3c] underline underline-offset-2"
                          >
                            Open link ↗
                          </a>
                        )}

                        {/* An Opinion post asks the congregation a question;
                            the answer arrives in the shape the officer chose
                            — free text, or a pick among the posted options. */}
                        {item.announcement_type === "opinion" && (
                          <div className="mt-5 border-t border-[#dfdbd1] pt-4">
                            {opinionDone.includes(item.id) ? (
                              <p className="text-sm font-semibold text-[#3d7146]">Thank you — your response has been recorded.</p>
                            ) : opinionId === item.id ? (
                              <div className="space-y-3">
                                {item.response_mode === "closed" && item.response_options ? (
                                  <div className="space-y-2">
                                    {item.response_options.split("\n").map((line) => line.trim()).filter(Boolean).map((option) => (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => setOpinionChoice(option)}
                                        className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition ${opinionChoice === option ? "border-[#b36b3c] bg-[#fbf6f0] text-[#26352f]" : "border-[#c9c5bb] bg-white text-[#415047] hover:border-[#b36b3c]"}`}
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
                                    className="w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                                  />
                                )}
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    disabled={opinionBusy || (item.response_mode === "closed" ? !opinionChoice : !opinionText.trim())}
                                    onClick={() => submitOpinion(item)}
                                    className="rounded-full bg-[#b36b3c] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#96552e] disabled:opacity-50"
                                  >
                                    {opinionBusy ? "Submitting..." : "Send response"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setOpinionId(null); setOpinionText(""); setOpinionChoice(""); }}
                                    className="text-sm font-semibold text-[#617068] hover:underline"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setOpinionId(item.id); setOpinionChoice(""); setOpinionText(""); }}
                                className="rounded-full bg-[#b36b3c] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#96552e]"
                              >
                                Respond
                              </button>
                            )}
                          </div>
                        )}

                        {isDrive && drive && (
                          <div className="mt-5 rounded-2xl bg-[#f7f4ee] p-4">
                            <div className="flex items-center justify-between text-sm font-semibold text-[#26352f]">
                              <span>KES {Number(drive.total_raised || 0).toLocaleString("en-KE")}</span>
                              <span className="text-[#617068]">
                                of KES {Number(drive.target_amount || 0).toLocaleString("en-KE")} · {Number(drive.percentage_raised || 0).toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#dfdbd1]">
                              <div
                                className="h-full rounded-full bg-[#b36b3c]"
                                style={{ width: `${Math.min(100, Math.max(0, Number(drive.percentage_raised || 0)))}%` }}
                              />
                            </div>
                            {drive.end_date && (
                              <p className="mt-2 text-xs text-[#617068]">
                                Closes {new Date(`${drive.end_date}T00:00:00`).toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {item.attachment && (
                        <div className="mt-6 border-t border-[#dfdbd1] pt-4">
                          <AnnouncementAttachment
                            attachment={item.attachment}
                            name={item.attachment_name}
                            size={item.attachment_size}
                          />
                        </div>
                      )}

                      {/* The giving actions, always one row, left to right:
                          Pledge, In-kind, Give Money. A support-account post
                          opens the giving form with that account already
                          chosen; a drive opens straight into its own giving
                          modal. */}
                      {supportGives && (
                        <div className="mt-6 border-t border-[#dfdbd1] pt-5">
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setPledgeTarget(pledgeTargetFor(item))}
                              className="rounded-full border border-[#c9c5bb] bg-white px-2 py-2.5 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c] hover:text-[#b36b3c] sm:text-sm"
                            >
                              Pledge
                            </button>
                            <button
                              type="button"
                              onClick={() => setInKindFor(item)}
                              className="rounded-full border border-[#c9c5bb] bg-white px-2 py-2.5 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c] hover:text-[#b36b3c] sm:text-sm"
                            >
                              In-kind
                            </button>
                            <button
                              type="button"
                              onClick={() => setSupportAccount(item.support_account_display ?? null)}
                              className="rounded-full bg-[#3d7146] px-2 py-2.5 text-xs font-bold text-white transition hover:bg-[#335e3a] sm:text-sm"
                            >
                              Give Money
                            </button>
                          </div>
                          <span className="mt-2 block text-center text-xs text-[#617068]">
                            towards {item.support_account_display}
                            {item.support_account && item.support_account !== item.support_account_display ? ` (${item.support_account})` : ""}
                          </span>
                        </div>
                      )}

                      {isDrive && drive && (
                        <div className="mt-6 border-t border-[#dfdbd1] pt-5">
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => setPledgeTarget(pledgeTargetFor(item))}
                              className="rounded-full border border-[#c9c5bb] bg-white px-2 py-2.5 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c] hover:text-[#b36b3c] sm:text-sm"
                            >
                              Pledge
                            </button>
                            <button
                              type="button"
                              onClick={() => setInKindFor(item)}
                              className="rounded-full border border-[#c9c5bb] bg-white px-2 py-2.5 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c] hover:text-[#b36b3c] sm:text-sm"
                            >
                              In-kind
                            </button>
                            <Link
                              href={driveGiveHref(drive)}
                              className="rounded-full bg-[#3d7146] px-2 py-2.5 text-center text-xs font-bold text-white transition hover:bg-[#335e3a] sm:text-sm"
                            >
                              Give Money
                            </Link>
                          </div>
                        </div>
                      )}

                      {/* The pledge itself is recorded in the modal the card's
                          Pledge button opens; the pledge lands in the
                          announcement's responses, where the CSV export
                          reaches it. The card keeps the confirmation. */}
                      {pledgeDone.includes(item.id) && (
                        <p className="mt-3 text-sm font-semibold text-[#3d7146]">Thank you — your pledge has been recorded.</p>
                      )}
                    </>
                  );

                  return <article key={item.id} className={cardClasses}>{content}</article>;
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The giving form, opened by a support-account post's Give now, with
          that account already chosen. Closing returns to the feed. */}
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
    </main>
  );
}
