"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { PledgeModal, type PledgeTarget } from "@/components/pledge-modal";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";
import { useAnnouncementCommentsSocket } from "@/lib/chat-socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type AnnouncementResponseItem = {
  id: number;
  action_type: string;
  username?: string;
  respondent_name?: string;
  response_text?: string;
  response_choice?: string;
  created_at: string;
};

type CommentsFeed = {
  announcement: {
    id: number;
    title: string;
    visibility: string;
    response_mode: string;
  };
  comments: AnnouncementResponseItem[];
  count: number;
};

type Announcement = {
  id: number;
  title: string;
  text: string;
  detail?: string;
  href?: string;
  visibility: string;
  announcement_type?: "awareness" | "web_conference" | "promotion" | "opinion";
  response_mode?: "open" | "closed" | "";
  response_options?: string;
  action_type: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  support_account_display?: string | null;
  /** The giving buttons this post carries; empty = the default trio. */
  giving_actions?: string[];
  event_date_from?: string | null;
  event_date_to?: string | null;
  is_popup: boolean;
  action_prompt?: string;
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
  published: boolean;
  expires_at?: string;
  created_at: string;
  responses?: AnnouncementResponseItem[];
};

export function PopupAnnouncementModal() {
  const pathname = usePathname();
  const router = useRouter();
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [current, setCurrent] = useState<Announcement | null>(null);
  const [comments, setComments] = useState<CommentsFeed | null>(null);
  const [commentsError, setCommentsError] = useState("" as string);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [responseText, setResponseText] = useState("");
  const [responseChoice, setResponseChoice] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pledgeTarget, setPledgeTarget] = useState<PledgeTarget | null>(null);
  const [inKindOpen, setInKindOpen] = useState(false);
  const [isLoggedIn] = useState(() => typeof window !== "undefined" && Boolean(localStorage.getItem("access_token")));

  const currentId = current?.id ?? null;
  // A comment thread belongs to the announcement it was fetched for. When the
  // popup moves to the next post, the old thread is cleared in the same
  // render — before the new fetch lands — so the previous post's replies
  // never sit under the next post's title.
  const [commentsForId, setCommentsForId] = useState<number | null>(null);
  if (currentId !== commentsForId) {
    setCommentsForId(currentId);
    setComments(null);
    setCommentsError("");
  }

  useEffect(() => {
    const token = localStorage.getItem("access_token");

    fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => {
        if (Array.isArray(data)) {
          const pending = data.filter((item) => {
            if (item.is_popup === false) return false;
            const handled = localStorage.getItem(`announcement-handled-${item.id}`);
            return !handled;
          });
          setQueue(pending);
          if (pending.length > 0) {
            setCurrent(pending[0]);
          }
        }
      })
      .catch(() => undefined);
  }, []);

  // Refresh the comment thread when the popup moves on.
  useEffect(() => {
    if (currentId === null) return;
    let cancelled = false;
    let inflight: Promise<void> | null = null;

    async function load() {
      setCommentsLoading(true);
      setCommentsError("");
      try {
        const token = localStorage.getItem("access_token");
        const url = token
          ? `${API_URL}/api/members/chat/announcements/${currentId}/comments/member/`
          : `${API_URL}/api/members/chat/announcements/${currentId}/comments/`;

        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (res.status === 401) {
          if (cancelled) return;
          // The member-only reader wants a session; fall back to the public
          // reader so a signed-out browser does not show a hard error.
          const publicRes = await fetch(`${API_URL}/api/members/chat/announcements/${currentId}/comments/`);
          if (!publicRes.ok) {
            throw new Error(publicRes.status === 404 ? "This post is no longer open for comments." : "Comments could not be loaded.");
          }
          const body: CommentsFeed = await publicRes.json();
          if (!cancelled) {
            setComments(body);
            if (!token) setCommentsError("");
          }
          return;
        }

        if (res.status === 403) {
          // Signed-in but not allowed past the members-only barrier from here.
          // Fall back to the public reader, which is the right shape for a
          // members-only thread the member is not cleared for.
          const publicRes = await fetch(`${API_URL}/api/members/chat/announcements/${currentId}/comments/`);
          if (!publicRes.ok) {
            throw new Error(publicRes.status === 404 ? "This post is no longer open for comments." : "Comments could not be loaded.");
          }
          const body: CommentsFeed = await publicRes.json();
          if (!cancelled) {
            setComments(body);
            setCommentsError('This post is only open to church members.');
          }
          return;
        }

        if (!res.ok) {
          throw new Error(res.status === 404 ? "This post is no longer open for comments." : "Comments could not be loaded.");
        }
        const body: CommentsFeed = await res.json();
        if (!cancelled) setComments(body);
      } catch (err) {
        if (!cancelled) setCommentsError(err instanceof Error ? err.message : "Comments could not be loaded.");
      } finally {
        if (!cancelled) setCommentsLoading(false);
      }
    }

    inflight = load();
    return () => {
      cancelled = true;
      if (inflight) inflight.catch(() => {});
    };
  }, [currentId]);

  // The reply feed is pushed, not polled: the moment a reply lands — from
  // this box, another reader's box, or anywhere else — the server sends it
  // down the socket and the thread grows in place. Deduped by id so the
  // writer's own echo (the server broadcasts to everyone, writer included)
  // does not double the line their submit already showed.
  useAnnouncementCommentsSocket(currentId, {
    onResponse: (response) => {
      setComments((prev) => {
        if (!prev) return prev;
        if (prev.comments.some((comment) => comment.id === response.id)) return prev;
        const pushed: AnnouncementResponseItem = {
          id: response.id,
          action_type: response.action_type,
          username: response.username,
          respondent_name: response.respondent_name,
          response_text: response.response_text,
          response_choice: response.response_choice,
          created_at: response.created_at,
        };
        return { ...prev, comments: [...prev.comments, pushed], count: prev.count + 1 };
      });
    },
  });

  if (pathname === "/" || !current) return null;

  const actionType = current.action_type || "none";
  const isContributionAction = actionType !== "none" && actionType !== "respond";
  // The row the popup carries: only the buttons the officer chose for the
  // post. An old post that predates the choice keeps the familiar trio.
  const popupActions = current && current.giving_actions?.length
    ? current.giving_actions.filter((code) => code !== "comment")
    : ["give_now", "pledge", "in_kind"];
  const popupOrder = ["pledge", "in_kind", "give_now"];
  popupActions.sort((a, b) => popupOrder.indexOf(a) - popupOrder.indexOf(b));
  const isOpinion = current.announcement_type === "opinion";
  const opinionIsClosed = isOpinion && current.response_mode === "closed";
  const opinionOptions = (current.response_options || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const actionLabel = actionType.replaceAll("_", " ");

  function dismissCurrent() {
    if (!current) return;
    localStorage.setItem(`announcement-handled-${current.id}`, "true");
    const remaining = queue.filter((item) => item.id !== current.id);
    setQueue(remaining);
    setCurrent(remaining.length > 0 ? remaining[0] : null);
  }

  /** A giving action leaves the popup for the page that serves it — the
      announcement counts as read, so it does not pop again. */
  function leaveFor(href: string) {
    dismissCurrent();
    router.push(href);
  }

  async function handleActionSubmit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    // A giving announcement asks nothing of the footer: its pledge, in-kind
    // and money actions are their own buttons, so submitting just means the
    // member is done reading it.
    if (isContributionAction) {
      dismissCurrent();
      return;
    }
    setSubmitting(true);
    setStatusMessage("");

    try {
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const payload = {
        action_type: actionType,
        response_text: responseText,
        response_choice: responseChoice,
        respondent_name: name,
        respondent_phone: phone,
      };

      const res = await fetch(`${API_URL}/api/members/announcements/${current.id}/action/`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Unable to submit response.");
      }

      localStorage.setItem(`announcement-handled-${current.id}`, "true");

      setResponseText("");
      setResponseChoice("");
      setPhone("");

      // No refetch here: the socket push carries the new line into the
      // thread wherever the reader's eye already is.

      const remaining = queue.filter((item) => item.id !== current.id);
      setQueue(remaining);
      if (remaining.length > 0) {
        setCurrent(remaining[0]);
      } else {
        setCurrent(null);
      }
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function  submitComment() {
    if (!current || !newComment.trim() || submitting) return;
    setSubmitting(true);
    setStatusMessage("");

    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch(`${API_URL}/api/members/announcements/${current!.id}/action/`, {
      method: "POST",
      headers,        body: JSON.stringify({
        action_type: "respond",
        response_text: newComment.trim(),
        respondent_name: isLoggedIn ? undefined : name,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Comment could not be added.");
        }
        return res;
      })
      .then(() => {
        // No refetch: the socket push carries the new line into the thread,
        // and the dedupe in its handler keeps the writer's own echo from
        // doubling it.
        setNewComment("");
        setStatusMessage("");
      })
      .catch((err) => setStatusMessage(err instanceof Error ? err.message : "Comment could not be added."))
      .finally(() => setSubmitting(false));
  }

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby="announcement-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-center justify-between gap-3 border-b border-sand-line pb-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-3 w-3 rounded-full bg-ember animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-ember">
              Important Announcement
            </span>
          </div>
          {queue.length > 1 && (
            <span className="rounded-full bg-bark/10 px-3 py-1 text-xs font-semibold text-bark">
              1 of {queue.length}
            </span>
          )}
        </div>

        <div className="mt-4">
          <h2 id="announcement-modal-title" className="text-xl font-bold text-bark sm:text-2xl">
            {current.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-moss-mid">
            {current.text}
          </p>
          {current.attachment && (
            <div className="mt-4">
              <AnnouncementAttachment
                attachment={current.attachment}
                name={current.attachment_name}
                size={current.attachment_size}
              />
            </div>
          )}
        </div>

        <form onSubmit={handleActionSubmit} className="mt-6 space-y-4">
          <div className="rounded-2xl border border-ember/30 bg-sand-airy p-4">
            {/* An Opinion post's question speaks for itself — no action header
                or instruction above the answer options. */}
            {!isOpinion && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-ember">
                  {isContributionAction && `User Action: ${actionLabel} Contribution`}
                  {actionType === "respond" && "User Action: Response"}
                  {actionType === "none" && "No Action Required"}
                </p>
                <p className="mt-1 text-xs text-moss">
                  {current.action_prompt ||
                    (isContributionAction
                      ? "Pledge an amount, give in kind, or give money, or dismiss this announcement."
                      : actionType === "respond"
                      ? "You may enter your response, or dismiss this announcement."
                      : "You can dismiss this announcement when you are done reading.")}
                </p>
              </>
            )}

            {isContributionAction && (
              <div className="mt-3">
                {/* The giving actions, one row, left to right: Pledge,
                    In-kind, Give Money. Pledge and In-kind open over this
                    popup; Give Money leaves for the giving page. */}
                {/* Left to right: Pledge, In-kind, Give Money — but only the
                    buttons the officer chose for this post. Pledge and
                    In-kind open over this popup; Give Money leaves for the
                    giving page. */}
                <div className={`grid gap-2 ${popupActions.length === 3 ? "grid-cols-3" : popupActions.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {popupActions.map((code) => {
                    if (code === "pledge") {
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setPledgeTarget({
                            id: current.id,
                            title: current.title,
                            action_type: actionType,
                            support_account_display: current.support_account_display ?? null,
                            event_date_from: current.event_date_from ?? null,
                            event_date_to: current.event_date_to ?? null,
                          })}
                          className="rounded-full border border-sand-mute bg-white px-2 py-2.5 text-center text-xs font-bold text-bark transition hover:border-ember hover:text-ember sm:text-sm"
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
                          className="rounded-full border border-sand-mute bg-white px-2 py-2.5 text-center text-xs font-bold text-bark transition hover:border-ember hover:text-ember sm:text-sm"
                        >
                          In-kind
                        </button>
                      );
                    }
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => leaveFor(`/give?purpose=${encodeURIComponent(current.title)}`)}
                        className="rounded-full bg-sage-strong px-2 py-2.5 text-center text-xs font-bold text-white transition hover:bg-sage-shade sm:text-sm"
                      >
                        Give Money
                      </button>
                    );
                  })}
                </div>
                {statusMessage && (
                  <p className="mt-2 text-xs font-semibold text-sage-strong">{statusMessage}</p>
                )}
              </div>
            )}

            {actionType === "respond" && isOpinion && opinionIsClosed ? (
              <div className="mt-3 space-y-2">
                {opinionOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setResponseChoice(option)}
                    className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition ${responseChoice === option ? "border-ember bg-sand-airy text-bark" : "border-sand-mute bg-white text-moss-mid hover:border-ember"}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : actionType === "respond" && (
              <div className="mt-3 space-y-3">
                {comments && comments.announcement.response_mode === 'closed' ? (
                  <div className="rounded-xl border border-sand-mute bg-sand-airy p-3">
                    <p className="text-xs font-semibold text-moss">The church has closed comments on this question. Add your reply through the response box below, and the office will post it.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-bark">
                        Your Response
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Type your message, response, or commitment..."
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-sm text-bark outline-none focus:border-ember"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isLoggedIn && actionType !== "none" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-bark">
                    Your Name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-sm text-bark outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">
                    Phone (optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="0712345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-sm text-bark outline-none focus:border-ember"
                  />
                </div>
              </div>
            )}

            {comments && comments.announcement && comments.announcement.visibility !== 'members_only' && (
              <div className="mt-4 pt-4 border-t border-sand-line">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ember">
                  Replies · {comments.count}
                </p>

                {commentsLoading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-moss">
                    <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-sand-line" />
                    Loading replies...
                  </div>
                )}

                {commentsError && (
                  <p className="mt-2 text-xs text-red-600">{commentsError}</p>
                )}

                {!commentsLoading && commentsError === '' && comments.comments.length === 0 && (
                  <p className="mt-2 text-xs text-moss">No replies yet — be the first to ask or comment.</p>
                )}

                {!commentsLoading && commentsError === '' && comments.comments.length > 0 && (
                  <ul className="mt-2 space-y-3">
                    {comments.comments.map((comment) => (
                      <li key={comment.id} className="rounded-xl border border-sand-line bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-ember">
                            {comment.username || comment.respondent_name || 'Guest'}
                          </span>
                          <time className="text-[11px] text-moss" suppressHydrationWarning>
                            {new Date(comment.created_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </div>
                        {comment.response_text && (
                          <p className="mt-1 text-sm text-moss-mid leading-relaxed">
                            {comment.response_text}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a reply…"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitComment();
                      }
                    }}
                    className="flex-1 rounded-xl border border-sand-mute bg-white px-3.5 py-2 text-sm text-bark outline-none focus:border-ember placeholder:text-moss"
                  />
                  <button
                    type="button"
                    onClick={submitComment}
                    disabled={!newComment.trim() || submitting}
                    className="shrink-0 rounded-xl border border-ember text-ember font-semibold text-sm transition hover:bg-ember hover:text-white disabled:text-moss-mute disabled:border-sand-mute disabled:hover:bg-white disabled:hover:text-moss disabled:hover:border-sand-mute"
                  >
                    Reply
                  </button>
                </div>

                {statusMessage && (
                  <p className="mt-2 text-xs text-red-600">{statusMessage}</p>
                )}
              </div>
            )}
          </div>

          {statusMessage && (
            <p className="text-xs font-medium text-red-600">{statusMessage}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={dismissCurrent}
              disabled={submitting}
              className="rounded-2xl border border-sand-mute bg-white px-5 py-3.5 text-sm font-semibold text-moss transition hover:border-ember"
            >
              Dismiss
            </button>
            {actionType !== "none" && (
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-2xl bg-ember px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-ember-dark disabled:opacity-50"
              >
                {submitting
                  ? "Submitting..."
                  : isOpinion
                  ? "Submit Response"
                  : isContributionAction
                  ? "Done"
                  : "Submit Response & Continue"}
              </button>
            )}
          </div>
        </form>
      </div>

      <PledgeModal
        open={Boolean(pledgeTarget)}
        onClose={() => setPledgeTarget(null)}
        target={pledgeTarget}
      />
      <InKindGiftModal
        open={inKindOpen}
        onClose={() => setInKindOpen(false)}
        defaultPurpose={current.support_account_display || undefined}
        announcementTitle={current.title}
      />
    </div>
  );
}
