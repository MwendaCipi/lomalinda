"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { eventLabel } from "@/lib/announcement-dates";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { RecordList } from "./record-list";

/**
 * The "Post to" vocabulary: where a post travels, as one flat list — who it
 * reaches first, then the congregation groups it addresses.
 */
const POST_TO_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All users" },
  { value: "members_only", label: "Members only" },
  { value: "public_website", label: "Public website" },
  { value: "adventist_men", label: "Adventist Men" },
  { value: "adventist_women", label: "Adventist Women" },
  { value: "young_adults", label: "Young Adults" },
  { value: "board", label: "Board Members" },
  // Department addressing: a post to one of these reaches the department's
  // roll holders and its members (the backend resolves both).
  { value: "men_ministry", label: "AMM — Adventist Men" },
  { value: "women_ministry", label: "AWM — Adventist Women" },
  { value: "youth_leader", label: "AYM — Youth & Children" },
  { value: "apm_leader", label: "APM — Possibility Ministries" },
  { value: "chaplaincy", label: "Chaplaincy" },
];

const REACH_LABELS: Record<string, string> = {
  public_website: "Public website",
  members_only: "Members only",
  all: "All users",
};

/** The manager's view-model of where a post travels. */
function parsePostTo(visibility?: string, audience?: string[]): { reach: string; ministries: string[] } {
  return {
    reach: REACH_LABELS[visibility ?? ""] ? (visibility as string) : "members_only",
    ministries: Array.isArray(audience) ? audience : [],
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Keep in sync with validate_text in backend/members/serializers.py. */
const ANNOUNCEMENT_TEXT_LIMIT = 500;

type Announcement = {
  id: number;
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
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  announcement_type?: "awareness" | "web_conference" | "promotion" | "opinion";
  response_mode?: "open" | "closed" | "";
  response_options?: string;
  responses?: { id: number; action_type: string; response_text?: string; response_choice?: string; respondent_name?: string; created_at: string }[];
  support_account?: string | null;
  sharing_option?: string;
  action_prompt?: string;
  starts_at?: string | null;
  expires_at?: string | null;
  created_at: string;
  published?: boolean;
};

/** A date-only string from the API, rendered without shifting a day. */
function dayLabel(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}  /** Which reach values are single-choice; the rest are congregation groups. */
  const REACH_VALUES = new Set(["all", "members_only", "public_website"]);

  /** The office's words for where this post sits in its display window. */
function windowLabel(item: Announcement): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  if (item.starts_at && item.starts_at > today) return `Starts ${dayLabel(item.starts_at)}`;
  if (item.expires_at && item.expires_at < today) return `Ended ${dayLabel(item.expires_at)}`;
  if (!item.expires_at) return "Shows until removed";
  return `Shows until ${dayLabel(item.expires_at)}`;
}

/** DRF reports field errors as `{field: [message]}`; surface the first one. */
function firstErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  for (const value of Object.values(record)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return null;
}

function channelsLabel(sharing?: string): string {
  if (!sharing) return "—";
  return sharing
    .split(",")
    .map((part) => {
      const value = part.trim().toLowerCase();
      return value === "site"
        ? "Site"
        : value === "sms"
          ? "SMS"
          : value === "email"
            ? "Email"
            : value === "phone"
              ? "Phone"
              : value === "all"
                ? "Site, Email, SMS, Phone"
                : part.trim();
    })
    .filter(Boolean)
    .join(", ");
}

/** Live tally for a closed-response opinion poll.
 *
 * Every member's pick is stored verbatim as `response_choice`, so the tally
 * groups responses by exactly the options the officer offered. Each option
 * gets a row with a share bar and its count; the leader is highlighted. An
 * option with no picks still appears — its empty bar tells the officer the
 * question was seen and declined, not forgotten.
 */
function PollTally({ item }: { item: Announcement }) {
  const options = (item.response_options || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const picks = (item.responses ?? []).filter((r) => r.response_choice);
  if (item.announcement_type !== "opinion" || item.response_mode !== "closed" || options.length === 0) return null;
  const total = picks.length;
  const counts = new Map<string, number>();
  picks.forEach((r) => counts.set(r.response_choice as string, (counts.get(r.response_choice as string) ?? 0) + 1));
  // The leading option follows the order the officer declared: a tie is
  // broken by whoever was listed first, so the highlight is stable.
  const best = total > 0 ? Math.max(...counts.values()) : 0;
  const leader = total > 0 ? (options.find((option) => (counts.get(option) ?? 0) === best) ?? null) : null;
  return (
    <div className="mt-1 rounded-xl border border-[#eeeae2] bg-[#f7f4ee] p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#617068]">
        {total === 0 ? "No responses yet" : `${total} response${total === 1 ? "" : "s"}`}
      </p>
      <div className="mt-1.5 space-y-1.5">
        {options.map((option) => {
          const count = counts.get(option) ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isLeader = total > 0 && option === leader;
          return (
            <div key={option}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`min-w-0 truncate text-[11px] ${isLeader ? "font-bold text-[#3d5148]" : "text-[#415047]"}`}>{option}</span>
                <span className={`shrink-0 text-[10px] ${isLeader ? "font-bold text-[#3d5148]" : "text-[#617068]"}`}>{count} · {pct}%</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-[#dfdbd1]">
                <div className={`h-full rounded-full ${isLeader ? "bg-[#5f8067]" : "bg-[#b36b3c]/60"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnnouncementManager({
  presetAudience,
  /** Communicate mode: render only the compose modal, open from the start,
      with its own full-screen chrome and close behaviour suppressed — the
      host modal supplies both. */
  composerOnly = false,
  onDone,
}: { presetAudience?: string[]; composerOnly?: boolean; onDone?: () => void } = {}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(composerOnly);
  // The id being edited; null while composing a new announcement.
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    text: "",
    // Church announcements default to the congregation, not the wider web.
    visibility: "members_only",
    // Communicate-from-a-department opens the composer already addressed.
    audience: (presetAudience ?? []) as string[],
    // The kind of post decides which special fields the form shows: a plain
    // notice (default), a meeting link, a supported account, or a question
    // the congregation answers.
    announcement_type: "awareness" as "awareness" | "web_conference" | "promotion" | "opinion",
    action_type: "none",
    support_account: "",
    // Opinion posts only: how members answer, and the fixed options for a
    // closed question (one per line).
    response_mode: "open" as "open" | "closed",
    response_options: "",
    // Site and email are the ordinary pair: the post shows on the site and
    // lands in inboxes. SMS is added for the occasions it is wanted.
    sharing_option: "site,email",
    href: "",
    event_date_from: "",
    event_date_to: "",
  });
  // The treasury accounts a "Request support" post may name, offered as the
  // wording members read on the giving form.
  const [accounts, setAccounts] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSharingDropdown, setShowSharingDropdown] = useState(false);
  const sharingDropdownRef = useRef<HTMLDivElement>(null);
  const [showPostToDropdown, setShowPostToDropdown] = useState(false);
  const postToDropdownRef = useRef<HTMLDivElement>(null);

  /** What the closed "Post to" combo reads, e.g. "Members only + 2 groups". */
  const postToLabel = (() => {
    const reach = REACH_LABELS[form.visibility] ?? "Members only";
    const count = form.audience.length;
    return count === 0 ? reach : `${reach} + ${count} ${count === 1 ? "group" : "groups"}`;
  })();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sharingDropdownRef.current && !sharingDropdownRef.current.contains(e.target as Node)) {
        setShowSharingDropdown(false);
      }
      if (postToDropdownRef.current && !postToDropdownRef.current.contains(e.target as Node)) {
        setShowPostToDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function fetchAnnouncements(options?: { silent?: boolean }) {
    if (!options?.silent) setLoadingList(true);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/?include_expired=true&include_unpublished=true&include_scheduled=true`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => {
        if (!options?.silent) setLoadingList(false);
      });
  }

  useEffect(() => {
    const timer = window.setTimeout(fetchAnnouncements, 0);
    // Live tallies: silent refetch every 30s — no spinner flicker — so poll
    // counts on the cards move as members answer.
    const poll = window.setInterval(() => fetchAnnouncements({ silent: true }), 30000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/treasury/accounts/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);

  async function handleDelete(id: number, title: string) {
    const answer = await showAlert(
      "Delete this announcement?",
      `"${title}" will be taken down for everyone. This cannot be undone.`,
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Delete",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#b91c1c",
      },
    );
    if (!answer.isConfirmed) return;
    try {
      const response = await fetch(`${API_URL}/api/members/announcements/${id}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to delete announcement.");
      }
      showAlert("Announcement Deleted", `Announcement "${title}" was successfully deleted.`, "success");
      fetchAnnouncements();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Failed to delete announcement.";
      showAlert("Delete Error", errorText, "error");
    }
  }

  function handleEdit(item: Announcement) {
    setEditingId(item.id);
    setMessage("");
    setAttachment(null);
    const postTo = parsePostTo(item.visibility, item.audience);
    setForm({
      title: item.title,
      text: item.text,
      visibility: postTo.reach,
      audience: postTo.ministries,
      announcement_type: item.announcement_type ?? "awareness",
      action_type: item.action_type ?? "none",
      support_account: item.support_account ?? "",
      response_mode: item.response_mode === "closed" ? "closed" : "open",
      response_options: item.response_options ?? "",
      sharing_option: item.sharing_option || "site,email",
      href: item.href ?? "",
      event_date_from: item.event_date_from ?? "",
      event_date_to: item.event_date_to ?? "",
    });
    setShowCreateModal(true);
  }

  function resetAndCloseModal() {
    setForm({
      title: "",
      text: "",
      visibility: "members_only",
      audience: (presetAudience ?? []) as string[],
      announcement_type: "awareness",
      action_type: "none",
      support_account: "",
      response_mode: "open",
      response_options: "",
      sharing_option: "site,email",
      href: "",
      event_date_from: "",
      event_date_to: "",
    });
    setEditingId(null);
    setAttachment(null);
    setMessage("");
    if (composerOnly) {
      // Communicate mode: posted (or cancelled) — hand control back to the host.
      onDone?.();
      return;
    }
    setShowCreateModal(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.sharing_option || !form.sharing_option.trim()) {
      const err = "Please select at least one sharing option (On the Site, SMS, Email).";
      setMessage(err);
      showAlert("Missing Sharing Option", err, "error");
      return;
    }
    if (form.text.length > ANNOUNCEMENT_TEXT_LIMIT) {
      const err = `Announcement text must be ${ANNOUNCEMENT_TEXT_LIMIT} characters or fewer (currently ${form.text.length}).`;
      setMessage(err);
      showAlert("Announcement Too Long", err, "error");
      return;
    }
    if (!form.event_date_from) {
      const err = "Set the event date — when it begins. The post leads the feed as the day approaches and comes down after the event ends.";
      setMessage(err);
      showAlert("Event Date Missing", err, "error");
      return;
    }
    // The type's own field is the whole point of the post, so it is checked
    // client-side too; the API enforces the same rule.
    if (form.announcement_type === "web_conference" && !form.href.trim()) {
      const err = "A web conference announcement needs its meeting link.";
      setMessage(err);
      showAlert("Meeting Link Missing", err, "error");
      return;
    }
    if (form.announcement_type === "promotion" && !form.support_account.trim()) {
      const err = "A promotion / contribution announcement needs a treasury account.";
      setMessage(err);
      showAlert("Account Missing", err, "error");
      return;
    }
    // A closed opinion question must offer at least two choices, or members
    // have nothing to pick between.
    if (
      form.announcement_type === "opinion" &&
      form.response_mode === "closed" &&
      form.response_options.split("\n").map((line) => line.trim()).filter(Boolean).length < 2
    ) {
      const err = "A closed opinion question needs at least two response options, one per line.";
      setMessage(err);
      showAlert("Response Options Missing", err, "error");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        // The audience is a list of codes, not one string.
        if (key === "audience") {
          (value as string[]).forEach((code) => payload.append("audience", code));
          return;
        }
        // Optional fields are omitted when blank so the row keeps a real null
        // (an empty string would fail date parsing server-side).
        const optional = key === "href" || key === "event_date_from" || key === "event_date_to";
        if (optional && !value) return;
        // The list-valued audience returned above; everything left is a string.
        payload.append(key, String(value));
      });
      if (attachment) payload.append("attachment", attachment);
      const response = await fetch(
        editingId ? `${API_URL}/api/members/announcements/${editingId}/` : `${API_URL}/api/members/announcements/`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
          body: payload,
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(firstErrorMessage(data) ?? "Unable to save the announcement.");

      const successText = editingId ? "Announcement updated." : "Announcement posted successfully.";
      showAlert(editingId ? "Announcement Updated" : "Announcement Posted", successText, "success");
      resetAndCloseModal();
      fetchAnnouncements();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unable to save the announcement.";
      setMessage(errorText);
      showAlert("Post Error", errorText, "error");
    } finally {
      setSubmitting(false);
    }
  }

  /** The compose form: the fields, the message row, the Cancel/Post buttons. */
  function renderComposerFields() {
    return (
      <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
              {/* The type leads: it decides which special fields the rest of
                  the form shows. */}
              <label className="block text-xs font-semibold text-[#26352f]">
                Announcement type *
                <select
                  value={form.announcement_type}
                  onChange={(e) => {
                    const type = e.target.value as typeof form.announcement_type;
                    // Switching type drops the fields the new type does not
                    // use, so the form never carries hidden stale values.
                    if (type === "awareness") setForm((f) => ({ ...f, announcement_type: type, href: "", support_account: "", response_mode: "open", response_options: "" }));
                    else if (type === "web_conference") setForm((f) => ({ ...f, announcement_type: type, support_account: "", response_mode: "open", response_options: "" }));
                    else if (type === "opinion") setForm((f) => ({ ...f, announcement_type: type, href: "", support_account: "" }));
                    else setForm((f) => ({ ...f, announcement_type: type, href: "", response_mode: "open", response_options: "" }));
                  }}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                >
                  <option value="awareness">Awareness</option>
                  <option value="web_conference">Web conference</option>
                  <option value="promotion">Promotion / Contribution</option>
                  <option value="opinion">Opinion poll</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-[#26352f]">
                Title *
                <input
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Announcement title"
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </label>

              {/* Post to: one flat list — who the post reaches, then the
                  congregation groups it addresses. */}
              <div className="block text-xs font-semibold text-[#26352f]">
                <span>Post to *</span>
                <div className="relative mt-1" ref={postToDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowPostToDropdown((prev) => !prev)}
                    aria-expanded={showPostToDropdown}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-left text-xs outline-none transition hover:border-[#b36b3c] focus:border-[#b36b3c]"
                  >
                    <span className="min-w-0 truncate text-[#26352f]">{postToLabel}</span>
                    <svg className="h-4 w-4 shrink-0 text-[#617068]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showPostToDropdown && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#dfdbd1] bg-white p-2 shadow-lg">
                      {POST_TO_OPTIONS.map((option) => {
                        const isReach = REACH_VALUES.has(option.value);
                        const selected = isReach
                          ? form.visibility === option.value
                          : form.audience.includes(option.value);
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              if (isReach) {
                                setForm({ ...form, visibility: option.value });
                              } else {
                                setForm({
                                  ...form,
                                  audience: selected
                                    ? form.audience.filter((code) => code !== option.value)
                                    : [...form.audience, option.value],
                                });
                              }
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-[#26352f] transition hover:bg-[#f7f4ee]"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-[#b36b3c] bg-[#b36b3c]" : "border-[#c9c5bb] bg-white"}`}>
                              {selected && (
                                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              )}
                            </span>
                            <span className="min-w-0 truncate">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* The link belongs to the web-conference type only; the account
                  picker belongs to the promotion type only. Awareness shows
                  neither — a plain notice is a plain notice. */}
              {form.announcement_type === "web_conference" && (
                <label className="block text-xs font-semibold text-[#26352f] md:col-span-2">
                  Meeting link *
                  <input
                    type="url"
                    required
                    value={form.href}
                    onChange={(e) => setForm({ ...form, href: e.target.value })}
                    placeholder="https://… — Zoom, Meet or Teams link"
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </label>
              )}

              <label className="block text-xs font-semibold text-[#26352f]">
                Share Announcement Via *<span className="font-normal text-[#617068]"> (select one or more)</span>
                <div className="mt-1 relative" ref={sharingDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowSharingDropdown((prev) => !prev)}
                    className="w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-left outline-none focus:border-[#b36b3c] flex items-center justify-between"
                  >
                    <span className={form.sharing_option ? "text-[#26352f]" : "text-[#9ca3af]"}>
                      {(() => {
                        const channels = form.sharing_option.split(",").map((s) => s.trim()).filter(Boolean);
                        if (channels.length === 0) return "Select channels";
                        return channels.map((c) => c === "site" ? "Site" : c === "sms" ? "SMS" : "Email").join(", ");
                      })()}
                    </span>
                    <svg className="h-4 w-4 text-[#617068] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {showSharingDropdown && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white shadow-lg p-2 space-y-1">
                      {["site", "sms", "email", "phone"].map((channel) => {
                        const selected = form.sharing_option.split(",").map((s) => s.trim()).includes(channel);
                        return (
                          <button
                            key={channel}
                            type="button"
                            onClick={() => {
                              const current = form.sharing_option.split(",").map((s) => s.trim()).filter(Boolean);
                              const next = selected ? current.filter((c) => c !== channel) : [...current, channel];
                              setForm({ ...form, sharing_option: next.join(",") });
                            }}
                            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs hover:bg-[#f7f4ee] transition"
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? "bg-[#b36b3c] border-[#b36b3c]" : "border-[#c9c5bb] bg-white"}`}>
                              {selected && (
                                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              )}
                            </span>
                            <span className="text-[#26352f]">
                              {channel === "site"
                                ? "On the Site"
                                : channel === "sms"
                                  ? "Through SMS"
                                  : channel === "email"
                                    ? "Through Email"
                                    : "As Phone Notification"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </label>

              {/* An opinion poll asks the congregation a question and hears
                  it back; the other types are statements. The question text
                  leads, then the answer shape it collects. */}
              {form.announcement_type === "opinion" && (
                <>
                  <label className="block text-xs font-semibold text-[#26352f] md:col-span-2">
                    Opinion question *
                    <textarea
                      required
                      rows={3}
                      maxLength={ANNOUNCEMENT_TEXT_LIMIT}
                      value={form.text}
                      onChange={(e) => setForm({ ...form, text: e.target.value })}
                      placeholder="Ask the question members will answer, e.g. Will you join the choir's visit to Nkubu?"
                      className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                    />
                    <span
                      className={`mt-1 block text-right text-[10px] font-semibold ${
                        form.text.length > ANNOUNCEMENT_TEXT_LIMIT ? "text-red-600" : "text-[#617068]"
                      }`}
                    >
                      {form.text.length}/{ANNOUNCEMENT_TEXT_LIMIT}
                    </span>
                  </label>
                  <label className="block text-xs font-semibold text-[#26352f]">
                    Response type *
                    <select
                      value={form.response_mode}
                      onChange={(e) => setForm({ ...form, response_mode: e.target.value as "open" | "closed" })}
                      className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                    >
                      <option value="open">Open — members write their answer</option>
                      <option value="closed">Closed — members pick from options</option>
                    </select>
                  </label>
                  {form.response_mode === "closed" && (
                    <label className="block text-xs font-semibold text-[#26352f]">
                      Options *<span className="font-normal text-[#617068]"> (one per line)</span>
                      <textarea
                        required
                        rows={4}
                        value={form.response_options}
                        onChange={(e) => setForm({ ...form, response_options: e.target.value })}
                        placeholder={"Yes, I will attend\nNo, I cannot make it\nMaybe — I will confirm later"}
                        className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                      />
                    </label>
                  )}
                </>
              )}

              {form.announcement_type === "promotion" && (
                <label className="block text-xs font-semibold text-[#26352f]">
                  Support account *
                  <select
                    value={form.support_account}
                    onChange={(e) => setForm({ ...form, support_account: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                  >
                    <option value="">-- Select account --</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.description || account.name}>
                        {account.description || account.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className="md:col-span-2 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-[#26352f]">
                  Event start *
                  <input
                    type="date"
                    required
                    value={form.event_date_from}
                    onChange={(e) => {
                      // Picking the start also sets the end to it — most
                      // events are one day, and the officer widens the end
                      // only when the event truly spans days. It also keeps
                      // end >= start no matter how the start moves.
                      setForm({ ...form, event_date_from: e.target.value, event_date_to: e.target.value });
                    }}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-xs font-semibold text-[#26352f]">
                  Event end
                  <input
                    type="date"
                    min={form.event_date_from || undefined}
                    value={form.event_date_to}
                    onChange={(e) => setForm({ ...form, event_date_to: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold text-[#26352f]">
                Attachment (optional)
                <input
                  type="file"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2 text-xs text-[#26352f] outline-none file:mr-3 file:rounded-full file:border-0 file:bg-[#f7f4ee] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#26352f] focus:border-[#b36b3c]"
                />
              </label>

              {/* Other types keep the ordinary body field; an opinion poll's
                  body is its question, collected in the poll block above. */}
              {form.announcement_type !== "opinion" && (
                <label className="block text-xs font-semibold text-[#26352f] md:col-span-2">
                  Announcement Text *
                  <textarea
                    required
                    rows={4}
                    maxLength={ANNOUNCEMENT_TEXT_LIMIT}
                    value={form.text}
                    onChange={(e) => setForm({ ...form, text: e.target.value })}
                    placeholder="Write full announcement content..."
                    className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                  />
                  <span
                    className={`mt-1 block text-right text-[10px] font-semibold ${
                      form.text.length > ANNOUNCEMENT_TEXT_LIMIT ? "text-red-600" : "text-[#617068]"
                    }`}
                  >
                    {form.text.length}/{ANNOUNCEMENT_TEXT_LIMIT}
                  </span>
                </label>
              )}

              {message && (
                <div className="md:col-span-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700">
                  {message}
                </div>
              )}

              <div className="md:col-span-2 flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={resetAndCloseModal}
                  className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] transition hover:border-[#b36b3c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-[#5f8067] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
                >
                  {submitting ? "Saving..." : editingId ? "Save Changes" : "Post Announcement"}
                </button>
              </div>
            </form>
    );
  }

  /** The compose dialog: overlay + card in manager mode; called via renderComposerForm(true) when embedded. */
  function renderComposerForm(inline = false) {
    const card = (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-announcement-title"
        className={inline ? "w-full" : "max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1] sm:p-8"}
      >
        <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
          <h2 id="create-announcement-title" className="text-xl font-bold text-[#26352f]">
            {editingId ? "Edit Announcement" : "Post Announcement"}
          </h2>
          <button
            type="button"
            disabled={submitting}
            onClick={resetAndCloseModal}
            className="rounded-full p-2 text-xl leading-none text-[#617068] transition hover:bg-[#f7f4ee] hover:text-[#26352f]"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        <div className={inline ? "mt-6" : ""}>
          {renderComposerFields()}
        </div>
      </div>
    );
    if (inline) return card;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && !submitting) resetAndCloseModal();
        }}
      >
        {card}
      </div>
    );
  }

  function renderComposerOverlay() {
    return renderComposerForm(false);
  }

  if (composerOnly) {
    // Communicate mode: the compose fields alone — the host modal supplies
    // the frame, the heading, and the close button.
    return renderComposerFields();
  }

  return (
    <section className="announcements-manager-page flex h-full min-h-0 w-full flex-col gap-6 border-b border-[#dfdbd1] bg-white p-6 sm:p-8 lg:p-10">
      {/* Top Header */}
      <div className="shrink-0 border-b border-[#dfdbd1] pb-6">
        <div className="flex items-center gap-1">
          <BackToOverviewArrow />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#26352f] sm:text-3xl">
              Announcements Management
            </h1>
            <p className="mt-1 text-sm text-[#617068]">
              Manage published church bulletins, announcements, and member notifications.
            </p>
          </div>
        </div>
      </div>

      {/* Announcements — ledger-style table container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#dfdbd1] bg-white">
        {/* The announcement board is cards at every width — a bulletin reads as
            a bulletin, not as a ledger row. */}
        <RecordList
          rows={announcements}
          loading={loadingList}
          rowKey={(item) => item.id}
          cardsOnly
          loadingLabel="Loading announcements..."
          cardsClassName="custom-table-scrollbar grid min-h-0 flex-1 content-start gap-3 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2 xl:grid-cols-3"
          cardsStateClassName="col-span-full py-12 text-center text-sm text-[#617068]"
          cardsEmpty={
            <>
              <span className="text-4xl">📢</span>
              <p className="mt-3 text-sm font-semibold text-[#26352f]">No announcements available.</p>
              <p className="mt-1 text-xs text-[#617068]">Tap &quot;Add Announcement&quot; below to post your first announcement.</p>
            </>
          }
          renderCard={(item) => (
            <article
              key={item.id}
              className="flex flex-col gap-2.5 rounded-2xl border border-[#dfdbd1] bg-white p-4 text-xs shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-bold text-[#26352f]">{item.title}</h4>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(item)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-[#f7f4ee] hover:text-[#b36b3c]"
                    title="Edit Announcement"
                    aria-label="Edit Announcement"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.title)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Delete Announcement"
                    aria-label="Delete Announcement"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-[#415047]">{item.text}</p>
              <AnnouncementAttachment
                attachment={item.attachment}
                name={item.attachment_name}
                size={item.attachment_size}
                compact
                className="mt-1"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-[#eef2ed] px-2 py-0.5 text-[10px] font-bold text-[#3d5148] capitalize">
                  {item.visibility}
                </span>
                <span className="rounded-full bg-[#b36b3c]/10 px-2 py-0.5 text-[10px] font-bold text-[#b36b3c]">
                  Via {channelsLabel(item.sharing_option)}
                </span>
                {item.announcement_type && item.announcement_type !== "awareness" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    {item.announcement_type === "web_conference" ? "Web conference" : item.announcement_type === "opinion" ? "Opinion poll" : "Promotion / Contribution"}
                  </span>
                )}
                {item.action_type && item.action_type !== "none" && item.action_type !== "respond" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 capitalize">
                    {item.action_type.replaceAll("_", " ")}
                  </span>
                )}
                {item.support_account && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    Support: {item.support_account}
                  </span>
                )}
              </div>
              {eventLabel(item) && (
                <p className="text-[10px] font-semibold text-[#b36b3c]">Event: {eventLabel(item)}</p>
              )}
              <PollTally item={item} />
              {item.href && (
                <p className="text-[10px]">
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#b36b3c] underline underline-offset-2">
                    Open link ↗
                  </a>
                </p>
              )}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[#eeeae2] pt-2 text-[10px] text-[#617068]">
                <span>Posted {dayLabel(item.created_at.slice(0, 10))}</span>
                <span className="font-semibold text-[#3d5148]">{windowLabel(item)}</span>
              </div>
            </article>
          )}
          />

        {/* Sticky Footer */}
        <div className="shrink-0 border-t-2 border-[#c9c5bb] bg-[#f7f4ee] font-bold text-[#26352f]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-xs text-[#617068] sm:text-sm">
              Showing <strong className="text-[#26352f]">{announcements.length}</strong> announcement{announcements.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setShowCreateModal(true);
              }}
              className="h-9 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#b36b3c] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#96552e] sm:px-3.5"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Announcement</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add Announcement Modal */}
      {showCreateModal && renderComposerOverlay()}
    </section>
  );
}
