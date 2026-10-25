"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, RotateCcw, Send } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One message a desk has sent, exactly as the API keeps it. */
type DeskMessage = {
  id: number;
  department: string;
  unit: string;
  body: string;
  /** Who it went to, as the desk reads it — e.g. "Church Choir roll". */
  audience: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  by: string;
  created_at: string;
};

/** The view's first read: the log, and everything the composer needs to say
    truthfully about what a send will do before it happens. */
type MessagesIndex = {
  messages: DeskMessage[];
  can_send: boolean;
  gateway: boolean;
  roll_count: number;
  reachable: number;
};

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function loadMessages(departmentCode: string): Promise<MessagesIndex> {
  const response = await fetch(`${API_URL}/api/members/departments/${departmentCode}/messages/`, {
    headers: authHeaders(),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.detail || "The messages could not be loaded.");
  }
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    can_send: Boolean(data.can_send),
    gateway: Boolean(data.gateway),
    roll_count: Number(data.roll_count ?? 0),
    reachable: Number(data.reachable ?? 0),
  };
}

type SendResult = { message: DeskMessage; detail: string; sent: number | null; reachable: number };

async function sendMessage(departmentCode: string, body: string): Promise<SendResult> {
  const response = await fetch(`${API_URL}/api/members/departments/${departmentCode}/messages/`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.body || data?.detail || "That message could not be sent.");
  }
  return data as SendResult;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The composer: one box, the roll it will reach, one Send.
 *
 * The box starts empty every time it is opened — a message the officer did
 * not write must never go out because a previous draft was still sitting in
 * it — and it holds only what is typed here or loaded with "Reuse".
 */
export function MessageCompose({
  departmentCode,
  departmentLabel,
  audience,
  rollCount,
  reachable,
  gateway,
  canSend,
  value,
  onChange,
  onSent,
  autoFocus = false,
}: {
  departmentCode: string;
  departmentLabel: string;
  audience: string;
  rollCount: number;
  reachable: number;
  gateway: boolean;
  canSend: boolean;
  value: string;
  onChange: (body: string) => void;
  onSent: (message: DeskMessage) => void;
  autoFocus?: boolean;
}) {
  const [sending, setSending] = useState(false);

  if (!canSend) {
    return (
      <div className="rounded-2xl border border-sand-line bg-white p-4 sm:p-5">
        <p className="text-xs text-moss">
          Only {departmentLabel}&apos;s leader or a church officer can send a message to this roll.
        </p>
      </div>
    );
  }

  const send = async () => {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const result = await sendMessage(departmentCode, body);
      showAlert("Message sent", result.detail, "success", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
      onChange("");
      onSent(result.message);
    } catch (error) {
      showAlert("Could not send", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-sand-line bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
          <Send className="h-4 w-4 text-ember" aria-hidden="true" /> New message
        </h3>
        <p className="text-[11px] font-semibold text-moss">
          To {audience} · {rollCount} {rollCount === 1 ? "person" : "people"} · {reachable} with a number
        </p>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        autoFocus={autoFocus}
        placeholder={`Write to ${audience}…`}
        className="w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2.5 text-sm text-bark outline-none transition placeholder:text-moss-faint focus:border-ember"
      />
      {!gateway && (
        <p className="mt-2 text-[11px] text-ember-soft">
          The SMS gateway has no key on this server yet — what you write is kept here, but nothing
          leaves until the key is set.
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={!value.trim() || sending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" /> {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/**
 * The Messaging view of a desk: the composer over the log of what has been
 * sent, opening empty — no draft, no history — for a desk that has never
 * written, and the stored messages underneath so a text can be read again or
 * typed again rather than remembered.
 */
export function MessagingPanel({
  departmentCode,
  departmentLabel,
  onChanged,
}: {
  departmentCode: string;
  departmentLabel: string;
  onChanged?: () => void;
}) {
  const [index, setIndex] = useState<MessagesIndex | null>(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const refreshTimer = useRef<number | null>(null);

  const load = useCallback(() => {
    loadMessages(departmentCode)
      .then((next) => {
        setIndex(next);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "The messages could not be loaded."));
  }, [departmentCode]);

  useEffect(() => {
    load();
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [load]);

  const handleSent = useCallback(
    (message: DeskMessage) => {
      setIndex((current) =>
        current
          ? { ...current, messages: [message, ...current.messages.filter((row) => row.id !== message.id)] }
          : current,
      );
      onChanged?.();
      // A send that went to a thread writes its counts back a few seconds
      // later, so the log is read once more to show the real numbers.
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => load(), 5000);
    },
    [load, onChanged],
  );

  if (error && !index) {
    return <p className="rounded-2xl border border-sand-line bg-white p-5 text-xs text-moss">{error}</p>;
  }

  const messages = index?.messages ?? [];
  const audience = `${departmentLabel} roll`;

  return (
    <div className="space-y-4">
      <MessageCompose
        departmentCode={departmentCode}
        departmentLabel={departmentLabel}
        audience={audience}
        rollCount={index?.roll_count ?? 0}
        reachable={index?.reachable ?? 0}
        gateway={index?.gateway ?? false}
        canSend={index?.can_send ?? false}
        value={body}
        onChange={setBody}
        onSent={handleSent}
      />

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-moss">Messages</h3>
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand-line bg-white/70 px-6 py-8 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-moss-faint" aria-hidden="true" />
            <p className="mt-2 text-sm font-bold text-bark">No messages yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-moss">
              Whatever you send from this desk is kept here, so it can be read again — or loaded back
              into the box above for the next Sabbath.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((message) => (
              <li key={message.id} className="rounded-2xl border border-sand-line bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <p className="min-w-0 whitespace-pre-wrap text-sm text-bark">{message.body}</p>
                  <button
                    type="button"
                    onClick={() => setBody(message.body)}
                    title="Load this message into the box above"
                    className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reuse
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-moss">
                  {formatWhen(message.created_at)}
                  {message.by ? ` · ${message.by}` : ""} · to {message.audience} ·{" "}
                  {message.recipient_count} on the roll
                  {message.sent_count > 0 ? ` · ${message.sent_count} sent` : ""}
                  {message.failed_count > 0 ? ` · ${message.failed_count} refused` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-xs text-ember-soft">{error}</p>}
      </div>
    </div>
  );
}

/**
 * The same composer as a modal, for the Message button at the foot of the
 * members roll: the roll on screen is the roll the endpoint addresses, so the
 * box opens empty and the button says how many it reaches.
 */
export function MessageComposeModal({
  departmentCode,
  departmentLabel,
  rollCount,
  reachable,
  onClose,
  onSent,
}: {
  departmentCode: string;
  departmentLabel: string;
  rollCount: number;
  reachable: number;
  onClose: () => void;
  onSent?: (message: DeskMessage) => void;
}) {
  const [body, setBody] = useState("");
  const [index, setIndex] = useState<MessagesIndex | null>(null);

  useEffect(() => {
    loadMessages(departmentCode)
      .then(setIndex)
      .catch(() => setIndex(null));
  }, [departmentCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Message ${departmentLabel}`}
        className="w-full max-w-xl rounded-3xl bg-sand p-4 shadow-2xl ring-1 ring-sand-line sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-moss">Message the roll you are reading</p>
          <button type="button" onClick={onClose} className="text-xs font-bold text-bark hover:text-ember">
            Close
          </button>
        </div>
        <MessageCompose
          departmentCode={departmentCode}
          departmentLabel={departmentLabel}
          audience={`${departmentLabel} roll`}
          rollCount={index?.roll_count ?? rollCount}
          reachable={index?.reachable ?? reachable}
          gateway={index?.gateway ?? false}
          canSend={index?.can_send ?? true}
          value={body}
          onChange={setBody}
          onSent={(message) => onSent?.(message)}
          autoFocus
        />
      </div>
    </div>
  );
}
