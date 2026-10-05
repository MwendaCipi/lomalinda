"use client";

import { useEffect, useRef } from "react";

import type { ChatMessage } from "@/lib/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * The address of one room's socket.
 *
 * The socket lives beside the API, not beside the page: when the app is built
 * against a different API origin, that is where `/ws/` is served too. The
 * access token rides the query string because a browser cannot put a header on
 * a WebSocket handshake — the consumer treats it as untrusted until it has
 * decoded the signature and checked the account it names.
 */
export function conversationSocketUrl(conversationId: number, token: string): string {
  const base = API_URL ? new URL(API_URL, window.location.href) : new URL(window.location.href);
  const scheme = base.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${base.host}/ws/chat/${conversationId}/?token=${encodeURIComponent(token)}`;
}

export type ChatSocketHandlers = {
  /** A message landed in the room, whoever wrote it. */
  onMessage?: (message: ChatMessage) => void;
  /** A room this member reads moved; the badge wants a fresh count. */
  onActivity?: (conversationId: number) => void;
  /** The socket came up or went down — the caller may lean on it, or not. */
  onConnectedChange?: (connected: boolean) => void;
};

/** The longest a retry waits before trying again. */
const MAX_RETRY_MS = 30_000;

/**
 * Hold a socket open on one room for as long as the room is on screen.
 *
 * The connection retries itself with a growing pause, because the one time it
 * is most likely to drop is the one time it matters — a server restart, a
 * lift, a phone asleep — and a chat that gives up silently is worse than one
 * that keeps asking. The handlers are read through a ref, so a re-render never
 * costs a reconnect.
 */
export function useConversationSocket(
  conversationId: number | null,
  handlers: ChatSocketHandlers
): void {
  const handlersRef = useRef(handlers);
  // Kept fresh after every render (an effect, not the render body — a ref is
  // not a place to write while rendering), so the socket below always calls
  // the latest handlers without ever having to reconnect for them.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (conversationId === null || typeof window === "undefined") return;
    const token = window.localStorage.getItem("access_token");
    if (!token) return;

    let socket: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempts = 0;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      socket = new WebSocket(conversationSocketUrl(conversationId, token));

      socket.onopen = () => {
        attempts = 0;
        handlersRef.current.onConnectedChange?.(true);
      };

      socket.onmessage = (event) => {
        let payload: { type?: string; message?: ChatMessage; conversation_id?: number };
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (payload.type === "message" && payload.message) {
          handlersRef.current.onMessage?.(payload.message);
        } else if (payload.type === "activity" && typeof payload.conversation_id === "number") {
          handlersRef.current.onActivity?.(payload.conversation_id);
        }
      };

      socket.onerror = () => {
        // A close follows; the retry below is the one that acts on it.
      };

      socket.onclose = () => {
        handlersRef.current.onConnectedChange?.(false);
        if (stopped) return;
        attempts += 1;
        retryTimer = window.setTimeout(open, Math.min(MAX_RETRY_MS, 1000 * 2 ** Math.min(attempts, 5)));
      };
    };

    open();

    return () => {
      stopped = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      // Detach first: a socket already closing must not schedule a retry.
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [conversationId]);
}
