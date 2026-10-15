"use client";

/**
 * The Emails desk — the church's own mailbox at info@, read and answered from
 * inside the office console.
 *
 * It is deliberately shaped like the mail client an officer already knows: a
 * folder strip, a list, a reading pane, a reply box. Three things are worth
 * knowing about how it behaves:
 *
 * - **Read is mine.** Marking a thread read changes this officer's unread
 *   count only; the desk's starred and archived flags are shared by everyone
 *   who uses it. The API returns both, so the list is always honest about
 *   whose state it is showing.
 * - **Bodies are plain text.** A letter arrives as whatever the sender wrote;
 *   the server derives readable text from an HTML-only letter before storing
 *   it, so this pane never injects a stranger's markup into the console.
 * - **Sync says why.** Polling reports what it found *or* the reason it could
 *   not reach the mailbox — an unconfigured or disabled IMAP account reads as
 *   a sentence an officer can act on, not as a silent empty inbox.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Mail,
  MailOpen,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
  Search,
  Send,
  Star,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Folder = "inbox" | "starred" | "archived" | "all";

type Attachment = {
  id: number;
  filename: string;
  content_type: string;
  size: number;
  url: string;
};

type Thread = {
  id: number;
  subject: string;
  correspondent_name: string;
  correspondent_email: string;
  last_message_at: string;
  preview: string;
  message_count: number;
  starred: boolean;
  archived: boolean;
  unread_count: number;
  has_attachments: boolean;
};

type Letter = {
  id: number;
  direction: "in" | "out";
  direction_label: string;
  from_name: string;
  from_email: string;
  to_header: string;
  subject: string;
  body_text: string;
  sent_at: string;
  is_read: boolean;
  attachments: Attachment[];
};

type ThreadDetail = Thread & { messages: Letter[] };

type Transport = {
  send_from: string;
  send_host: string;
  imap_host: string;
  imap_mailbox: string;
  configured: boolean;
};

const FOLDERS: { key: Folder; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "starred", label: "Starred" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All mail" },
];

/** Every request the desk makes carries the session token and asks for JSON. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window === "undefined" ? null : localStorage.getItem("access_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.detail || `That could not be done (${response.status}).`);
  }
  return payload as T;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function displayName(thread: Thread): string {
  return thread.correspondent_name || thread.correspondent_email || "Unknown sender";
}

function threadSubject(thread: Thread): string {
  return thread.subject || "(no subject)";
}

export function EmailsDesk() {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [transport, setTransport] = useState<Transport | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);

  const [replyBody, setReplyBody] = useState("");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ to: "", subject: "", body: "" });

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileReading, setMobileReading] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search so typing does not fire a request per keystroke.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const loadThreads = useCallback(
    async (currentFolder: Folder, query: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ folder: currentFolder, limit: "50" });
        if (query.trim()) params.set("q", query.trim());
        const data = await api<{ threads: Thread[]; total: number; unread: number }>(
          `/api/mailbox/threads/?${params.toString()}`,
        );
        setThreads(data.threads);
        setTotal(data.total);
        setUnread(data.unread);
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The mailbox could not be opened.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadSummary = useCallback(async () => {
    try {
      const data = await api<{ unread: number; threads: number; transport: Transport }>(
        "/api/mailbox/summary/",
      );
      setUnread(data.unread);
      setTransport(data.transport);
    } catch (reason) {
      // A summary failure is worth saying, but it must not stop the desk.
      setError(reason instanceof Error ? reason.message : "");
    }
  }, []);

  useEffect(() => {
    void loadThreads(folder, debouncedSearch);
    void loadSummary();
  }, [folder, debouncedSearch, loadThreads, loadSummary]);

  const openThread = useCallback(
    async (id: number) => {
      setSelectedId(id);
      setMobileReading(true);
      setReplyBody("");
      setError("");
      try {
        const data = await api<ThreadDetail>(`/api/mailbox/threads/${id}/`);
        setDetail(data);
        // Opening a letter is reading it — for this officer only.
        if (data.unread_count > 0) {
          await api(`/api/mailbox/threads/${id}/state/`, {
            method: "POST",
            body: JSON.stringify({ read: true }),
          });
          setThreads((current) =>
            current.map((thread) => (thread.id === id ? { ...thread, unread_count: 0 } : thread)),
          );
          setUnread((count) => Math.max(0, count - data.unread_count));
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "That letter could not be opened.");
      }
    },
    [],
  );

  const setThreadState = useCallback(
    async (id: number, state: { read?: boolean; starred?: boolean; archived?: boolean }) => {
      try {
        const updated = await api<Thread>(`/api/mailbox/threads/${id}/state/`, {
          method: "POST",
          body: JSON.stringify(state),
        });
        setThreads((current) =>
          current.map((thread) => (thread.id === id ? { ...thread, ...updated } : thread)),
        );
        setDetail((current) => (current && current.id === id ? { ...current, ...updated } : current));
        if (state.archived !== undefined && folder === "inbox" && state.archived) {
          await loadThreads(folder, debouncedSearch);
          setSelectedId(null);
          setDetail(null);
          setMobileReading(false);
        }
        // The badge comes from the server rather than arithmetic here: read
        // state is per officer, so the only trustworthy count is the one the
        // server recalculates for this one.
        await loadSummary();
        setError("");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "That could not be changed.");
      }
    },
    [folder, debouncedSearch, loadThreads, loadSummary],
  );

  const sendReply = useCallback(async () => {
    if (!detail) return;
    const body = replyBody.trim();
    if (!body) {
      setError("Write a reply first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/mailbox/threads/${detail.id}/reply/`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setReplyBody("");
      setNotice("Reply sent from info@sdalomalinda.or.ke.");
      await openThread(detail.id);
      await loadThreads(folder, debouncedSearch);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The reply could not be sent.");
    } finally {
      setBusy(false);
    }
  }, [detail, replyBody, openThread, loadThreads, folder, debouncedSearch]);

  const sendDraft = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/mailbox/compose/", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      setDraft({ to: "", subject: "", body: "" });
      setComposing(false);
      setNotice("Letter sent from info@sdalomalinda.or.ke.");
      await loadThreads(folder, debouncedSearch);
      await loadSummary();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The letter could not be sent.");
    } finally {
      setBusy(false);
    }
  }, [draft, loadThreads, loadSummary, folder, debouncedSearch]);

  const checkMail = useCallback(async () => {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const summary = await api<{ ok: boolean; stored: number; fetched: number; reason?: string }>(
        "/api/mailbox/sync/",
        { method: "POST" },
      );
      if (summary.ok) {
        setNotice(
          summary.stored > 0
            ? `${summary.stored} new ${summary.stored === 1 ? "letter" : "letters"} arrived.`
            : "No new mail since the last check.",
        );
        await loadThreads(folder, debouncedSearch);
        await loadSummary();
      } else {
        setError(summary.reason || "The mailbox could not be reached.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The mailbox could not be reached.");
    } finally {
      setSyncing(false);
    }
  }, [loadThreads, loadSummary, folder, debouncedSearch]);

  const clearNotice = () => setNotice("");

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(clearNotice, 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Toolbar — folders, search, and the two actions the desk exists for. */}
      <header className="shrink-0 border-b border-sand-line bg-sand px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-1">
            {FOLDERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => {
                  setFolder(entry.key);
                  setSelectedId(null);
                  setDetail(null);
                  setMobileReading(false);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  folder === entry.key
                    ? "bg-bark text-white"
                    : "text-moss hover:bg-sand-tint hover:text-bark"
                }`}
              >
                {entry.label}
                {entry.key === "inbox" && unread > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      folder === entry.key ? "bg-gold text-bark" : "bg-ember text-white"
                    }`}
                  >
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-moss-faint" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search letters"
              aria-label="Search letters"
              className="w-full rounded-lg border border-sand-line bg-white py-1.5 pl-8 pr-3 text-xs text-bark placeholder:text-moss-faint focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember/40"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void checkMail()}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-bark transition-colors hover:bg-sand-tint disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Checking…" : "Check mail"}
            </button>
            <button
              type="button"
              onClick={() => setComposing((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-ember-dark"
            >
              <PenSquare className="h-3.5 w-3.5" />
              New letter
            </button>
          </div>
        </div>

        {transport && !transport.configured && (
          <p className="mt-2 rounded-lg border border-gold-sand bg-sand-mist px-3 py-2 text-xs text-gold-brown">
            The mailbox is not fully configured. Reading needs <strong>IMAP_HOST</strong>,{" "}
            <strong>IMAP_USER</strong> and <strong>IMAP_PASSWORD</strong> set, and IMAP switched on
            in Zoho Mail → Settings → Mail Accounts → IMAP.
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-soft">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-2 rounded-lg border border-sand-line bg-white px-3 py-2 text-xs text-moss-dark">
            {notice}
          </p>
        )}
      </header>

      {/* Compose — a fresh letter from the desk, never a reply. */}
      {composing && (
        <div className="shrink-0 border-b border-sand-line bg-sand-mist px-3 py-3 sm:px-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-moss">New letter</h3>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="text-xs font-semibold text-moss hover:text-bark"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
              placeholder="To — one or more addresses, comma separated"
              aria-label="Recipient"
              className="w-full rounded-lg border border-sand-line bg-white px-3 py-2 text-xs text-bark placeholder:text-moss-faint focus:border-ember focus:outline-none"
            />
            <input
              type="text"
              value={draft.subject}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
              placeholder="Subject"
              aria-label="Subject"
              className="w-full rounded-lg border border-sand-line bg-white px-3 py-2 text-xs text-bark placeholder:text-moss-faint focus:border-ember focus:outline-none"
            />
            <textarea
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              placeholder="Write the letter…"
              aria-label="Letter"
              rows={5}
              className="w-full resize-y rounded-lg border border-sand-line bg-white px-3 py-2 text-xs leading-relaxed text-bark placeholder:text-moss-faint focus:border-ember focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void sendDraft()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-ember-dark disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The list. */}
        <aside
          className={`flex min-h-0 w-full shrink-0 flex-col border-r border-sand-line lg:w-[22rem] ${
            mobileReading ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="flex items-center justify-between border-b border-sand-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-moss">
            <span>{total} {total === 1 ? "letter" : "letters"}</span>
            <span>{unread} unread</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar">
            {loading && threads.length === 0 && (
              <p className="px-4 py-8 text-center text-xs text-moss-faint">Opening the desk…</p>
            )}
            {!loading && threads.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <Mail className="h-7 w-7 text-sand-mute" />
                <p className="text-sm font-semibold text-bark">Nothing here</p>
                <p className="text-xs text-moss">
                  {folder === "archived"
                    ? "No archived letters yet."
                    : folder === "starred"
                      ? "Star a letter to keep it at hand."
                      : "No letters waiting."}
                </p>
              </div>
            )}

            {threads.map((thread) => {
              const active = thread.id === selectedId;
              const hasUnread = thread.unread_count > 0;
              return (
                <div
                  key={thread.id}
                  className={`group relative border-b border-sand-line transition-colors ${
                    active ? "bg-sand-tint" : "hover:bg-sand"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void openThread(thread.id)}
                    className="block w-full px-3 py-2.5 text-left"
                  >
                    <div className="flex items-baseline gap-2">
                      {hasUnread ? (
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ember"
                          aria-label="Unread"
                        />
                      ) : (
                        <span className="mt-1 h-2 w-2 shrink-0" />
                      )}
                      <span
                        className={`min-w-0 flex-1 truncate text-xs ${
                          hasUnread ? "font-bold text-bark" : "font-medium text-moss-dark"
                        }`}
                      >
                        {displayName(thread)}
                      </span>
                      <span className="shrink-0 text-[10px] text-moss-faint">
                        {formatWhen(thread.last_message_at)}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 truncate pl-4 text-xs ${
                        hasUnread ? "font-semibold text-bark" : "text-moss"
                      }`}
                    >
                      {threadSubject(thread)}
                    </p>
                    <p className="mt-0.5 truncate pl-4 text-[11px] text-moss-faint">
                      {thread.preview || "No preview"}
                    </p>
                  </button>

                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {thread.has_attachments && (
                      <Paperclip className="h-3.5 w-3.5 text-moss-faint" aria-label="Has attachments" />
                    )}
                    <button
                      type="button"
                      onClick={() => void setThreadState(thread.id, { starred: !thread.starred })}
                      aria-label={thread.starred ? "Remove star" : "Star this letter"}
                      className="rounded p-1 hover:bg-white"
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          thread.starred ? "fill-gold text-gold-deep" : "text-moss-faint"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* The reading pane. */}
        <section
          className={`min-h-0 min-w-0 flex-1 flex-col ${
            mobileReading ? "flex" : "hidden lg:flex"
          }`}
        >
          {!detail ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <MailOpen className="h-8 w-8 text-sand-mute" />
              <p className="text-sm font-semibold text-bark">Choose a letter</p>
              <p className="text-xs text-moss">
                Letters sent to info@sdalomalinda.or.ke arrive here for the office to answer.
              </p>
            </div>
          ) : (
            <>
              <header className="shrink-0 border-b border-sand-line px-3 py-2.5 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileReading(false);
                      setSelectedId(null);
                      setDetail(null);
                    }}
                    className="rounded-lg p-1.5 text-moss hover:bg-sand-tint hover:text-bark lg:hidden"
                    aria-label="Back to the list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-bold text-bark">
                      {threadSubject(detail)}
                    </h2>
                    <p className="truncate text-[11px] text-moss">
                      {displayName(detail)} · {detail.correspondent_email} · {detail.message_count}{" "}
                      {detail.message_count === 1 ? "letter" : "letters"}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        void setThreadState(detail.id, { starred: !detail.starred })
                      }
                      aria-label={detail.starred ? "Remove star" : "Star this letter"}
                      className="rounded-lg border border-sand-line bg-white p-1.5 hover:bg-sand-tint"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          detail.starred ? "fill-gold text-gold-deep" : "text-moss-faint"
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void setThreadState(detail.id, {
                          read: detail.unread_count > 0,
                        })
                      }
                      aria-label={
                        detail.unread_count > 0 ? "Mark as read" : "Mark as unread"
                      }
                      className="rounded-lg border border-sand-line bg-white p-1.5 hover:bg-sand-tint"
                    >
                      {detail.unread_count > 0 ? (
                        <Mail className="h-4 w-4 text-ember" />
                      ) : (
                        <MailOpen className="h-4 w-4 text-moss-faint" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void setThreadState(detail.id, { archived: !detail.archived })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sand-line bg-white px-2.5 py-1.5 text-xs font-semibold text-bark hover:bg-sand-tint"
                    >
                      {detail.archived ? (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                        </>
                      ) : (
                        <>
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto custom-hover-scrollbar px-3 py-4 sm:px-4">
                {detail.messages.map((letter) => (
                  <article
                    key={letter.id}
                    className={`rounded-xl border p-3.5 ${
                      letter.direction === "out"
                        ? "border-sand-line bg-sand-mist"
                        : "border-sand-line bg-white"
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-bark">
                          {letter.from_name || letter.from_email || "Unknown sender"}
                        </p>
                        <p className="truncate text-[11px] text-moss-faint">
                          {letter.from_email}
                          {letter.direction === "out" && (
                            <span className="ml-1.5 rounded bg-sand-warm px-1.5 py-0.5 text-[10px] font-semibold uppercase text-moss-dark">
                              Sent from info@
                            </span>
                          )}
                        </p>
                      </div>
                      <time
                        className="shrink-0 text-[11px] text-moss-faint"
                        dateTime={letter.sent_at}
                      >
                        {formatWhen(letter.sent_at)}
                      </time>
                    </div>

                    <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-bark">
                      {letter.body_text || "(this letter carried no text)"}
                    </div>

                    {letter.attachments.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2 border-t border-sand-line pt-2.5">
                        {letter.attachments.map((attachment) => (
                          <li key={attachment.id}>
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-sand-line bg-white px-2.5 py-1.5 text-[11px] font-semibold text-bark hover:bg-sand-tint"
                            >
                              <Paperclip className="h-3 w-3" />
                              {attachment.filename}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>

              {/* Reply — written as info@, on the same conversation. */}
              <footer className="shrink-0 border-t border-sand-line bg-sand px-3 py-3 sm:px-4">
                <label
                  htmlFor="mailbox-reply"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-moss"
                >
                  Reply as info@sdalomalinda.or.ke
                </label>
                <textarea
                  id="mailbox-reply"
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  rows={3}
                  placeholder={
                    detail.correspondent_email
                      ? `Reply to ${detail.correspondent_email}…`
                      : "There is no address to reply to on this thread."
                  }
                  disabled={!detail.correspondent_email}
                  className="w-full resize-y rounded-lg border border-sand-line bg-white px-3 py-2 text-xs leading-relaxed text-bark placeholder:text-moss-faint focus:border-ember focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-moss-faint">
                    Replies send through the church&apos;s own mailbox, not the relay.
                  </p>
                  <button
                    type="button"
                    onClick={() => void sendReply()}
                    disabled={busy || !detail.correspondent_email}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ember px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-ember-dark disabled:opacity-50"
                  >
                    <Reply className="h-3.5 w-3.5" />
                    {busy ? "Sending…" : "Reply"}
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
