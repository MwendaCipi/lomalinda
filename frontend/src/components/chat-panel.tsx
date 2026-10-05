"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, MessageSquarePlus, MessagesSquare, Send } from "lucide-react";

import { useHeaderData } from "@/hooks/use-header-data";
import { showAlert } from "@/lib/alerts";
import {
  fetchContacts,
  fetchConversations,
  fetchMessages,
  initials,
  markConversationRead,
  openConversation,
  pollChatUnread,
  previewOf,
  sendMessage,
  whenLabel,
  type ChatConversation,
  type ChatMessage,
  type ChatPerson,
} from "@/lib/chat";

/** How long the open room waits before asking for anything new. */
const THREAD_POLL_MS = 12_000;

/** The one-line role a room's header reads under its name. */
function roomSubtitle(room: ChatConversation): string {
  if (room.kind === "dm") return "Direct message";
  if (room.kind === "office") return "Message the church office";
  if (room.kind === "channel") {
    return room.department_label ? `${room.department_label} · announcements` : "Announcements";
  }
  return room.department_label ? `${room.department_label} · group` : "Area group";
}

/** The round mark every room and message wears — initials, or the office's seal. */
function Avatar({ room, className = "h-10 w-10 text-xs" }: { room: ChatConversation; className?: string }) {
  if (room.kind === "office") {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-bark text-white ${className}`}>
        <Building2 className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  const name = room.kind === "dm" ? room.other?.name || room.title : room.title;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-sand-card font-bold uppercase text-ember ${className}`}>
      {initials(name)}
    </span>
  );
}

/**
 * Chat — the church talking to itself.
 *
 * Two panes: the rooms on the left, the open room's messages and its compose
 * box on the right. A phone holds one at a time: the list, then the thread
 * behind a back button. Nothing here is a page of its own — a room is state,
 * not a route — so the whole surface reads as one place with two columns.
 *
 * The page is pinned (the shell locks the viewport and this panel scrolls its
 * own lists), which is what lets the compose box at the foot of a thread stay
 * put while the messages above it move.
 *
 * Live delivery is not here yet: the open room refreshes on a short timer, so
 * a reply lands within a few seconds. When the sockets arrive this panel keeps
 * its shape and the timer becomes the fallback.
 */
export function ChatPanel() {
  const { me } = useHeaderData();
  const meName = me?.name || "";

  const [rooms, setRooms] = useState<ChatConversation[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [contacts, setContacts] = useState<ChatPerson[]>([]);
  const [contactSearch, setContactSearch] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const forceScrollRef = useRef(false);
  const lastMessageIdRef = useRef<number | null>(null);

  const active = activeId !== null ? rooms.find((room) => room.id === activeId) ?? null : null;

  const loadRooms = useCallback(async () => {
    try {
      const list = await fetchConversations();
      setRooms(list);
    } catch {
      // Offline or signed out: keep whatever the list already held.
    } finally {
      setRoomsLoaded(true);
    }
  }, []);

  // First read of the member's rooms. The state writes ride a microtask, the
  // shape every panel here uses to keep the effect's own body from cascading.
  useEffect(() => {
    void Promise.resolve().then(loadRooms);
  }, [loadRooms]);

  // The open room's history, then a short poll so a reply arrives on its own.
  useEffect(() => {
    if (activeId === null) return;
    let alive = true;
    lastMessageIdRef.current = null;

    const read = async (initial: boolean) => {
      try {
        const list = await fetchMessages(activeId);
        if (!alive) return;
        setMessages(list);
        const newest = list.length > 0 ? list[list.length - 1].id : null;
        if (newest !== null && newest !== lastMessageIdRef.current) {
          lastMessageIdRef.current = newest;
          // Something arrived while the member was looking at the room: it is
          // read by definition, and the badges should follow.
          if (!initial) {
            void markConversationRead(activeId).then(() => void pollChatUnread());
          }
        }
      } catch {
        if (alive && initial) setMessages([]);
      } finally {
        if (alive && initial) setLoadingMessages(false);
      }
    };

    void Promise.resolve().then(() => {
      if (!alive) return;
      setLoadingMessages(true);
      return read(true);
    });

    const timer = window.setInterval(() => void read(false), THREAD_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [activeId]);

  // Follow the conversation: keep the newest message in view unless the member
  // has scrolled up to read, in which case the poll leaves them where they are.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (!nearBottom && !forceScrollRef.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
    forceScrollRef.current = false;
  }, [messages]);

  // The contacts a direct message may be started with, filtered as they type.
  useEffect(() => {
    if (!showNew) return;
    let alive = true;
    void Promise.resolve().then(async () => {
      const list = await fetchContacts(contactSearch);
      if (alive) setContacts(list);
    });
    return () => {
      alive = false;
    };
  }, [showNew, contactSearch]);

  const openRoom = (room: ChatConversation) => {
    setActiveId(room.id);
    setMessages([]);
    if (room.unread_count > 0) {
      setRooms((prev) => prev.map((entry) => (entry.id === room.id ? { ...entry, unread_count: 0 } : entry)));
    }
    void markConversationRead(room.id).then(() => void pollChatUnread());
  };

  /** Put a freshly opened room at the top of the list and step into it. */
  const enterRoom = (room: ChatConversation) => {
    setRooms((prev) => {
      const without = prev.filter((entry) => entry.id !== room.id);
      return [room, ...without];
    });
    setShowNew(false);
    setContactSearch("");
    setActiveId(room.id);
    setMessages([]);
  };

  const openOffice = async () => {
    try {
      enterRoom(await openConversation({ kind: "office" }));
    } catch (error) {
      showAlert("Could not open the office", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  const openDirect = async (person: ChatPerson) => {
    try {
      enterRoom(await openConversation({ kind: "dm", member_id: person.id }));
    } catch (error) {
      showAlert("Could not open the message", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body || activeId === null || sending) return;
    setSending(true);
    try {
      const message = await sendMessage(activeId, body);
      setDraft("");
      forceScrollRef.current = true;
      setMessages((prev) => [...prev, message]);
      setRooms((prev) =>
        prev.map((entry) =>
          entry.id === activeId ? { ...entry, last_message: message, last_message_at: message.created_at } : entry
        )
      );
      lastMessageIdRef.current = message.id;
    } catch (error) {
      showAlert("Message not sent", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSending(false);
    }
  };

  const totalUnread = rooms.reduce((sum, room) => sum + (room.unread_count || 0), 0);

  // ── The rooms pane ─────────────────────────────────────────────────────
  const roomsPane = (
    <aside
      className={`w-full min-h-0 flex-col border-r border-sand-line bg-white md:flex md:w-80 lg:w-96 ${
        active ? "hidden" : "flex"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-bark">Chat</h2>
          <p className="truncate text-[11px] text-moss">
            {totalUnread > 0 ? `${totalUnread} unread` : "Your rooms and messages"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew((open) => !open)}
          aria-label="Start a conversation"
          title="Start a conversation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ember text-white transition hover:bg-ember-deep"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar">
        {showNew ? (
          <div className="space-y-3 p-3">
            <button
              type="button"
              onClick={openOffice}
              className="flex w-full items-center gap-3 rounded-2xl border border-sand-line bg-sand-linen px-3.5 py-3 text-left transition hover:border-ember"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bark text-white">
                <Building2 className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-bark">Church Office</span>
                <span className="block truncate text-[11px] text-moss">A direct line to the office</span>
              </span>
            </button>

            <input
              type="search"
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Search a member to message"
              className="w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-sm text-bark outline-none focus:border-ember"
            />

            <div className="space-y-1">
              {contacts.length === 0 ? (
                <p className="px-1 py-3 text-xs text-moss">
                  {contactSearch ? "No member matches that name." : "Choose a member to start a message."}
                </p>
              ) : (
                contacts.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => openDirect(person)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-sand"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand-card text-[11px] font-bold uppercase text-ember">
                      {initials(person.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-bark">{person.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : rooms.length === 0 ? (
          <div className="mx-auto max-w-xs px-4 py-12 text-center">
            <MessagesSquare className="mx-auto h-9 w-9 text-moss" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-bark">
              {roomsLoaded ? "No conversations yet" : "Loading your conversations…"}
            </p>
            {roomsLoaded && (
              <p className="mt-1 text-xs text-moss">
                Start one with the office or a member, or wait for your area&apos;s groups to appear.
              </p>
            )}
          </div>
        ) : (
          <ul>
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => openRoom(room)}
                  className={`flex w-full items-center gap-3 border-b border-sand-line/70 px-3.5 py-3 text-left transition ${
                    room.id === activeId ? "bg-sand-linen" : "hover:bg-sand"
                  }`}
                >
                  <Avatar room={room} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-bark">{room.title}</span>
                      {room.last_message && (
                        <span className="shrink-0 text-[10px] text-moss">{whenLabel(room.last_message.created_at)}</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-moss">{previewOf(room, meName)}</span>
                      {room.unread_count > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold leading-none text-white">
                          {room.unread_count > 9 ? "9+" : room.unread_count}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );

  // ── The thread pane ────────────────────────────────────────────────────
  const threadPane = (
    <section className={`min-w-0 min-h-0 flex-1 flex-col bg-sand-linen ${active ? "flex" : "hidden md:flex"}`}>
      {!active ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <MessagesSquare className="mx-auto h-10 w-10 text-moss" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-bark">Choose a conversation</p>
            <p className="mt-1 text-xs text-moss">Your rooms and messages open here.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-sand-line bg-white px-3 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => setActiveId(null)}
              aria-label="All conversations"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sand-line text-bark transition hover:border-ember md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <Avatar room={active} className="h-9 w-9 text-[11px]" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-bark">{active.title}</h2>
              <p className="truncate text-[11px] text-moss">{roomSubtitle(active)}</p>
            </div>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar px-3 py-4 sm:px-5">
            {loadingMessages && messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-moss">Loading this conversation…</p>
            ) : messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-moss">No messages yet — say the first word.</p>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => {
                  const mine = !!message.sender && message.sender.name === meName;
                  const showSender = !mine && active.kind !== "dm" && active.kind !== "office";
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                        {showSender && message.sender && (
                          <span className="mb-0.5 px-1 text-[10px] font-semibold text-moss">
                            {message.sender.name}
                          </span>
                        )}
                        <div
                          className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                            mine ? "bg-ember text-white" : "border border-sand-line bg-white text-bark"
                          } ${message.deleted ? "italic opacity-70" : ""}`}
                        >
                          {message.deleted ? "This message was removed." : message.body}
                        </div>
                        <span className="mt-0.5 px-1 text-[10px] text-moss">
                          {whenLabel(message.created_at)}
                          {message.edited_at ? " · edited" : ""}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-sand-line bg-white px-3 py-2.5 sm:px-4">
            {active.can_post ? (
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                  rows={1}
                  placeholder={`Message ${active.title}`}
                  className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-sand-line bg-sand-linen px-3.5 py-2.5 text-sm text-bark outline-none focus:border-ember"
                />
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={sending || draft.trim().length === 0}
                  aria-label="Send"
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-ember text-white transition hover:bg-ember-deep disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="py-1.5 text-center text-xs text-moss">
                Only this area&apos;s leaders may post here. You can read along.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="flex h-full min-h-0 w-full">
      {roomsPane}
      {threadPane}
    </div>
  );
}
