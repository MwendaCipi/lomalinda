"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAnnouncementCommentsSocket } from "@/lib/chat-socket";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One line of an announcement's reply thread, as the comments feed serves it. */
type CommentLine = {
  id: number;
  username?: string | null;
  respondent_name?: string | null;
  response_text?: string | null;
  response_choice?: string | null;
  created_at: string;
};

type CommentsFeed = {
  announcement: { id: number; title: string; visibility: string; response_mode: string };
  comments: CommentLine[];
  count: number;
};

/** A comment is a thought, not an essay — the composer stops at 500. */
const COMMENT_MAX = 500;

/** A line worth reading in a comment thread: words, or a picked option.
    Pledges ride the same table but belong in the pledge list, not the talk. */
function isComment(line: CommentLine): boolean {
  return Boolean(line.response_text?.trim() || line.response_choice?.trim());
}

async function loadThread(id: number): Promise<CommentsFeed> {
  const token = window.localStorage.getItem("access_token");
  const url = token
    ? `${API_URL}/api/members/chat/announcements/${id}/comments/member/`
    : `${API_URL}/api/members/chat/announcements/${id}/comments/`;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    throw new Error(
      res.status === 404 ? "Comments are not open on this post." : "Comments could not be loaded."
    );
  }
  return res.json();
}

export type AnnouncementCommentModalProps = {
  open: boolean;
  onClose: () => void;
  /** The post whose thread is open — null while the box is shut. */
  announcement: { id: number; title: string } | null;
};

/**
 * The comment box a feed card's Comment button opens: the thread the church
 * has already written on the post, and a composer capped at 500 characters
 * beneath it. Lines land live — a reply written anywhere on the site grows
 * the thread in place through the announcement's own socket, and this box's
 * own submit refetches so the line appears even if the socket is quiet.
 *
 * This is the same thread the popup announcement reads, behind a door of its
 * own so a card can offer commenting without giving up its space.
 */
export function AnnouncementCommentModal({ open, onClose, announcement }: AnnouncementCommentModalProps) {
  const [feed, setFeed] = useState<CommentsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Which post the open thread belongs to: switching cards (or closing and
  // reopening on another) clears the previous card's lines and draft, so no
  // reply ever lands on the wrong post's thread.
  const [threadFor, setThreadFor] = useState<number | null>(null);

  const threadId = open && announcement ? announcement.id : null;
  if (threadId !== threadFor) {
    // The reset rides the render, so a reopened box never shows the previous
    // card's lines or a stale "Loading" — the fetch below fills it in.
    setThreadFor(threadId);
    setFeed(null);
    setLoading(threadId !== null);
    setError("");
    setDraft("");
    setSending(false);
  }

  // Each opening fetches the thread afresh — the reply a member read on the
  // card last week is not what the thread says today.
  useEffect(() => {
    if (threadId === null) return;
    let cancelled = false;
    loadThread(threadId)
      .then((data) => {
        if (!cancelled) setFeed(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Comments could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // The thread is live while the box is up: a reply pushed from any reader's
  // tab grows the list here, deduped by id so a writer's own echo (this box
  // refetches after submit) never doubles the line.
  useAnnouncementCommentsSocket(threadId, {
    onResponse: (response) => {
      setFeed((prev) => {
        if (!prev) return prev;
        if (prev.comments.some((line) => line.id === response.id)) return prev;
        return {
          ...prev,
          comments: [
            ...prev.comments,
            {
              id: response.id,
              username: response.username,
              respondent_name: response.respondent_name,
              response_text: response.response_text,
              response_choice: response.response_choice,
              created_at: response.created_at,
            },
          ],
          count: prev.count + 1,
        };
      });
    },
  });

  // Escape closes the box, the same as the X and a tap on the backdrop.
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);

  async function submit() {
    if (!announcement) return;
    const text = draft.trim().slice(0, COMMENT_MAX);
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const token = window.localStorage.getItem("access_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/members/announcements/${announcement.id}/action/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action_type: "respond", response_text: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Your comment could not be posted.");
      }
      setDraft("");
      // Refetch so the new line is here even if the socket is quiet; the
      // id check above drops the echo if the socket also carried it in.
      const fresh = await loadThread(announcement.id);
      setFeed(fresh);
    } catch (err) {
      // The draft stays in the box so the words are not lost; the member can retry.
      setError(err instanceof Error ? err.message : "Your comment could not be posted.");
    } finally {
      setSending(false);
    }
  }

  if (!open || !announcement) return null;
  const lines = (feed?.comments ?? []).filter(isComment);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Comments on ${announcement.title}`}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-sand-line bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ember">Comments</p>
            <h2 className="mt-0.5 line-clamp-2 text-base font-bold leading-snug text-bark">
              {announcement.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="shrink-0 rounded-full p-1.5 text-moss transition hover:bg-sand-veil hover:text-ember"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-moss">Loading comments…</p>
          ) : error && !feed ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-moss">No comments yet — be the first to add one.</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li key={line.id} className="rounded-2xl border border-sand-line bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ember">
                      {line.username || line.respondent_name || "Guest"}
                    </span>
                    <time className="text-[11px] text-moss" suppressHydrationWarning>
                      {new Date(line.created_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-moss-mid">
                    {line.response_text?.trim() || line.response_choice}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-sand-line px-5 py-4">
          <label htmlFor="announcement-comment-composer" className="block text-xs font-semibold text-bark">
            Add a comment
          </label>
          <textarea
            id="announcement-comment-composer"
            rows={3}
            value={draft}
            maxLength={COMMENT_MAX}
            onChange={(event) => setDraft(event.target.value.slice(0, COMMENT_MAX))}
            placeholder="Write your comment…"
            className="mt-1.5 w-full resize-none rounded-xl border border-sand-mute bg-white px-3.5 py-2.5 text-sm text-bark outline-none placeholder:text-moss focus:border-ember"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] tabular-nums text-moss" aria-live="polite">
              {draft.length}/{COMMENT_MAX}
            </span>
            <div className="flex min-w-0 items-center gap-3">
              {error && feed && (
                <span className="truncate text-xs text-red-600" role="alert">
                  {error}
                </span>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || sending}
                className="shrink-0 rounded-full bg-ember px-5 py-2 text-sm font-bold text-white transition hover:bg-ember-dark disabled:opacity-50"
              >
                {sending ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnnouncementInlineComments({
  announcementId,
}: {
  announcementId: number;
  title?: string;
}) {
  const [feed, setFeed] = useState<CommentsFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // The thread loads here; `loading` starts true, and the thread is
    // remounted per announcement, so no reset is owed on the way in — and the
    // react compiler forbids a synchronous setState here regardless.
    let cancelled = false;
    loadThread(announcementId)
      .then((data) => {
        if (!cancelled) setFeed(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Comments could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [announcementId]);

  useAnnouncementCommentsSocket(announcementId, {
    onResponse: (response) => {
      setFeed((prev) => {
        if (!prev) return prev;
        if (prev.comments.some((line) => line.id === response.id)) return prev;
        return {
          ...prev,
          comments: [
            ...prev.comments,
            {
              id: response.id,
              username: response.username,
              respondent_name: response.respondent_name,
              response_text: response.response_text,
              response_choice: response.response_choice,
              created_at: response.created_at,
            },
          ],
          count: prev.count + 1,
        };
      });
    },
  });

  async function submit() {
    const text = draft.trim().slice(0, COMMENT_MAX);
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const token = window.localStorage.getItem("access_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/members/announcements/${announcementId}/action/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action_type: "respond", response_text: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Your comment could not be posted.");
      }
      setDraft("");
      const fresh = await loadThread(announcementId);
      setFeed(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your comment could not be posted.");
    } finally {
      setSending(false);
    }
  }

  const lines = (feed?.comments ?? []).filter(isComment);

  return (
    <div className="mt-3 rounded-2xl border border-sand-line bg-sand/30 p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ember">
          Comments ({lines.length})
        </span>
      </div>

      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
        {loading ? (
          <p className="text-xs text-moss py-2">Loading comments…</p>
        ) : error && !feed ? (
          <p className="text-xs text-red-600 py-2">{error}</p>
        ) : lines.length === 0 ? (
          <p className="text-xs text-moss py-2">No comments yet — be the first to add one.</p>
        ) : (
          lines.map((line) => (
            <div key={line.id} className="rounded-xl border border-sand-line bg-white p-2.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-ember">
                  {line.username || line.respondent_name || "Guest"}
                </span>
                <time className="text-[10px] text-moss" suppressHydrationWarning>
                  {new Date(line.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-bark">
                {line.response_text?.trim() || line.response_choice}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="pt-2 border-t border-sand-line/70">
        <textarea
          rows={2}
          value={draft}
          maxLength={COMMENT_MAX}
          onChange={(event) => setDraft(event.target.value.slice(0, COMMENT_MAX))}
          placeholder="Write a comment..."
          className="w-full resize-none rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs text-bark outline-none placeholder:text-moss focus:border-ember"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] tabular-nums text-moss" aria-live="polite">
            {draft.length}/{COMMENT_MAX}
          </span>
          <div className="flex items-center gap-2">
            {error && feed && (
              <span className="text-[11px] text-red-600 truncate max-w-[200px]" role="alert">
                {error}
              </span>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim() || sending}
              className="rounded-full bg-ember px-3.5 py-1 text-xs font-bold text-white transition hover:bg-ember-dark disabled:opacity-50"
            >
              {sending ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

