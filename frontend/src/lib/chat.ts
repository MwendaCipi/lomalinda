"use client";

import { useEffect, useState } from "react";

import { dayFirst, localDate } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const CHURCH_TZ = "Africa/Nairobi";

/** A member as a room names them. */
export type ChatPerson = { id: number; username: string; name: string };

/** One message in a room. */
export type ChatMessage = {
  id: number;
  conversation: number;
  sender: ChatPerson | null;
  sender_id: number | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  /** A photo or document the message carries; a message may be words, a file, or both. */
  attachment?: string | null;
  attachment_name?: string | null;
  attachment_size?: number | null;
};

export type ChatConversationKind = "dm" | "group" | "office";

/** One room, read for the member who asked for it. */
export type ChatConversation = {
  id: number;
  kind: ChatConversationKind;
  title: string;
  department_code: string;
  department_label: string;
  other: ChatPerson | null;
  participants: ChatPerson[];
  last_message: ChatMessage | null;
  unread_count: number;
  can_post: boolean;
  is_moderator: boolean;
  created_at: string;
  last_message_at: string | null;
};

function authHeaders(json = false): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export async function fetchConversations(): Promise<ChatConversation[]> {
  const res = await fetch(`${API_URL}/api/members/chat/conversations/`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load your conversations.");
  const data = await res.json();
  return Array.isArray(data?.conversations) ? data.conversations : [];
}

export async function fetchMessages(conversationId: number, before?: number): Promise<ChatMessage[]> {
  const query = before ? `?before=${before}` : "";
  const res = await fetch(`${API_URL}/api/members/chat/conversations/${conversationId}/messages/${query}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not load this conversation.");
  const data = await res.json();
  return Array.isArray(data?.messages) ? data.messages : [];
}

export async function sendMessage(
  conversationId: number,
  body: string,
  file?: File | null,
): Promise<ChatMessage> {
  // A file rides as multipart — the browser sets the boundary header itself,
  // so the JSON content-type is left off; plain words stay JSON.
  const form = new FormData();
  form.append("body", body);
  if (file) form.append("attachment", file);
  const res = await fetch(`${API_URL}/api/members/chat/conversations/${conversationId}/messages/`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "Your message could not be sent.");
  return data as ChatMessage;
}

export async function markConversationRead(conversationId: number): Promise<void> {
  await fetch(`${API_URL}/api/members/chat/conversations/${conversationId}/read/`, {
    method: "POST",
    headers: authHeaders(),
  }).catch(() => undefined);
}

export async function openConversation(input: {
  kind: ChatConversationKind;
  member_id?: number;
  department?: string;
}): Promise<ChatConversation> {
  const res = await fetch(`${API_URL}/api/members/chat/conversations/`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || "That conversation could not be opened.");
  return data as ChatConversation;
}

export async function fetchContacts(search = ""): Promise<ChatPerson[]> {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  const res = await fetch(`${API_URL}/api/members/chat/contacts/${query}`, { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.contacts) ? data.contacts : [];
}

/** A person's initials, for the round avatar every room shows. */
export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** When a message landed: the clock for today, the date for anything older. */
export function whenLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: CHURCH_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const thatDay = new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TZ }).format(date);
  return thatDay === localDate() ? time : `${dayFirst(value)} · ${time}`;
}

/** The preview line under a room's name in the list. */
export function previewOf(conversation: ChatConversation, meName: string): string {
  const message = conversation.last_message;
  if (!message) return "No messages yet";
  const mine = !!message.sender && message.sender.name === meName;
  const who = message.sender && !mine ? `${message.sender.name.split(" ")[0]}: ` : "";
  const prefix = mine ? "You: " : who;
  if (message.deleted) return `${prefix}Message removed`;
  // A file may speak for itself: a photo-only or document-only message
  // previews as its file, not as an empty line.
  if (!message.body && message.attachment) {
    return `${prefix}📎 ${message.attachment_name || "an attachment"}`;
  }
  return `${prefix}${message.body}`;
}

// ── The unread badge the rail wears ─────────────────────────────────────────
// One number, kept in a module store so the rail and the chat page agree: the
// page reduces a room's count the moment it is read, and the rail's badge
// follows without a second fetch.

let unreadTotal = 0;
let unreadInflight: Promise<void> | null = null;
let unreadTimer: ReturnType<typeof setInterval> | null = null;
const unreadListeners = new Set<() => void>();

function publishUnread(total: number) {
  if (total === unreadTotal) return;
  unreadTotal = total;
  unreadListeners.forEach((listener) => listener());
}

/** Re-read the unread total now (after sending or reading in a room). */
export async function pollChatUnread(): Promise<void> {
  if (unreadInflight) return unreadInflight;
  unreadInflight = (async () => {
    try {
      const rooms = await fetchConversations();
      publishUnread(rooms.reduce((sum, room) => sum + (room.unread_count || 0), 0));
    } catch {
      // Offline or signed out: keep the last count rather than flashing zero.
    } finally {
      unreadInflight = null;
    }
  })();
  return unreadInflight;
}

/** The total unread messages, polled once for every surface watching it. */
export function useChatUnread(): number {
  const [total, setTotal] = useState(() => unreadTotal);

  useEffect(() => {
    const update = () => setTotal(unreadTotal);
    unreadListeners.add(update);
    // One poller for the whole app, however many surfaces watch the badge.
    if (unreadTimer === null) unreadTimer = setInterval(() => void pollChatUnread(), 30_000);
    void Promise.resolve().then(pollChatUnread);
    return () => {
      unreadListeners.delete(update);
      if (unreadListeners.size === 0 && unreadTimer !== null) {
        clearInterval(unreadTimer);
        unreadTimer = null;
      }
    };
  }, []);

  return total;
}
