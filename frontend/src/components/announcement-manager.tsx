"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { eventLabel } from "@/lib/announcement-dates";
import { AnnouncementAttachment } from "@/components/announcement-attachment";
import { RecordList } from "./record-list";

/**
 * The "Post to" vocabulary: the church's ministries plus the two reach
 * channels. Ministry codes are the office role codes themselves — one source
 * of truth with the roles register — so no second department list can drift.
 */
const POST_TO_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: "public_website", label: "Public website", group: "Reach" },
  { value: "members_only", label: "Members only", group: "Reach" },
  { value: "pm_leader", label: "PM Leader (Personal Ministries)", group: "Ministries" },
  { value: "apm_leader", label: "APM Leader (Possibility Ministries)", group: "Ministries" },
  { value: "men_ministry", label: "AMM Leader (Adventist Men)", group: "Ministries" },
  { value: "women_ministry", label: "AWM Leader (Adventist Women)", group: "Ministries" },
  { value: "youth_leader", label: "Youth Leader (Adventist Youth)", group: "Ministries" },
  { value: "ambassadors_leader", label: "Ambassadors Leader", group: "Ministries" },
  { value: "pathfinders_leader", label: "Pathfinders Leader", group: "Ministries" },
  { value: "adventurers_leader", label: "Adventurers Leader", group: "Ministries" },
  { value: "children_ministry", label: "Children Leader", group: "Ministries" },
  { value: "health_leader", label: "Health Leader", group: "Ministries" },
  { value: "education_leader", label: "Education Leader", group: "Ministries" },
  { value: "family_life", label: "Family Life Leader", group: "Ministries" },
  { value: "chaplaincy", label: "Chaplaincy Leader", group: "Ministries" },
  { value: "publishing_head", label: "Publishing Head", group: "Ministries" },
  { value: "welfare_leader", label: "Welfare Leader", group: "Ministries" },
  { value: "interest_coordinator", label: "Interest Coordinator", group: "Ministries" },
  { value: "development", label: "Development", group: "Ministries" },
  { value: "choir_director", label: "Choir Director", group: "Ministries" },
  { value: "head_deacon", label: "Head Deacon", group: "Ministries" },
  { value: "head_deaconess", label: "Head Deaconess", group: "Ministries" },
  { value: "treasurer", label: "Treasurer", group: "Ministries" },
  { value: "clerk", label: "Church Clerk", group: "Ministries" },
];

const REACH_LABELS: Record<string, string> = {
  public_website: "Public website",
  members_only: "Members only",
  all: "Everyone",
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
}

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
      return value === "site" ? "Site" : value === "sms" ? "SMS" : value === "email" ? "Email" : value === "all" ? "Site, Email, SMS" : part.trim();
    })
    .filter(Boolean)
    .join(", ");
}

export function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // The id being edited; null while composing a new announcement.
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    text: "",
    // Church announcements default to the congregation, not the wider web.
    visibility: "members_only",
    audience: [] as string[],
    action_type: "none",
    // Site and email are the ordinary pair: the post shows on the site and
    // lands in inboxes. SMS is added for the occasions it is wanted.
    sharing_option: "site,email",
    href: "",
    event_date_from: "",
    event_date_to: "",
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSharingDropdown, setShowSharingDropdown] = useState(false);
  const sharingDropdownRef = useRef<HTMLDivElement>(null);
  const [showPostToDropdown, setShowPostToDropdown] = useState(false);
  const postToDropdownRef = useRef<HTMLDivElement>(null);

  /** What the closed "Post to" combo reads, e.g. "Members only + 3 ministries". */
  const postToLabel = (() => {
    const reach = REACH_LABELS[form.visibility] ?? "Members only";
    const count = form.audience.length;
    return count === 0 ? reach : `${reach} + ${count} ${count === 1 ? "ministry" : "ministries"}`;
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

  function fetchAnnouncements() {
    setLoadingList(true);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/?include_expired=true&include_unpublished=true&include_scheduled=true`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Announcement[]) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoadingList(false));
  }

  useEffect(() => {
    const timer = window.setTimeout(fetchAnnouncements, 0);
    return () => window.clearTimeout(timer);
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
      action_type: item.action_type ?? "none",
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
      audience: [],
      action_type: "none",
      sharing_option: "site,email",
      href: "",
      event_date_from: "",
      event_date_to: "",
    });
    setEditingId(null);
    setAttachment(null);
    setMessage("");
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

  return (
    <section className="announcements-manager-page flex h-full min-h-0 w-full flex-col gap-6 border-b border-[#dfdbd1] bg-white p-6 sm:p-8 lg:p-10">
      {/* Top Header */}
      <div className="shrink-0 border-b border-[#dfdbd1] pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#26352f] sm:text-3xl">
            Announcements Management
          </h1>
          <p className="mt-1 text-sm text-[#617068]">
            Manage published church bulletins, announcements, and member notifications.
          </p>
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
                {item.action_type && item.action_type !== "none" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 capitalize">
                    {item.action_type.replaceAll("_", " ")}
                  </span>
                )}
              </div>
              {eventLabel(item) && (
                <p className="text-[10px] font-semibold text-[#b36b3c]">Event: {eventLabel(item)}</p>
              )}
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

      {/* Add Announcement Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) resetAndCloseModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-announcement-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1] sm:p-8"
          >
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
              <div>
                <h2 id="create-announcement-title" className="text-xl font-bold text-[#26352f]">
                  {editingId ? "Edit Announcement" : "Post New Announcement"}
                </h2>
                <p className="mt-1 text-xs text-[#617068]">
                  {editingId
                    ? "Change the wording, audience, channels or how long it shows for."
                    : "Fill in announcement details, select target audience and sharing channels."}
                </p>
              </div>
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

            <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
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

              {/* Post to: the reach channels and the ministries this post
                  addresses, one combo with checkboxes. */}
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
                      {["Reach", "Ministries"].map((group) => (
                        <div key={group}>
                          <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[#b36b3c]">{group}</p>
                          {POST_TO_OPTIONS.filter((option) => option.group === group).map((option) => {
                            const selected = option.group === "Reach"
                              ? form.visibility === option.value
                              : form.audience.includes(option.value);
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                  if (option.group === "Reach") {
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
                      ))}
                      <div className="border-t border-[#dfdbd1] px-2 pb-1 pt-2">
                        <p className="text-[10px] leading-snug text-[#617068]">
                          Pick the reach, then any ministries to address. Empty ministry list means the whole congregation.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <label className="block text-xs font-semibold text-[#26352f] md:col-span-2">
                Link (optional)
                <input
                  type="url"
                  value={form.href}
                  onChange={(e) => setForm({ ...form, href: e.target.value })}
                  placeholder="https://… — meeting or registration link"
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </label>

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
                      {["site", "sms", "email"].map((channel) => {
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
                              {channel === "site" ? "On the Site" : channel === "sms" ? "Through SMS" : "Through Email"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </label>

              <label className="block text-xs font-semibold text-[#26352f]">
                User Action
                <select
                  value={form.action_type}
                  onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                >
                  <option value="none">None (dismiss only)</option>
                  <option value="tithe">Tithe contribution</option>
                  <option value="combined_offering">Combined Offering contribution</option>
                  <option value="13th_sabbath">13th Sabbath contribution</option>
                  <option value="camp_expenses">Camp Expenses contribution</option>
                  <option value="camp_goal">Camp Goal contribution</option>
                  <option value="local_church_budget">Local Church Budget contribution</option>
                  <option value="respond">Response</option>
                </select>
              </label>

              <label className="block text-xs font-semibold text-[#26352f]">
                Event date — from *
                <input
                  type="date"
                  required
                  value={form.event_date_from}
                  onChange={(e) => setForm({ ...form, event_date_from: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
                <span className="mt-1 block text-[10px] font-normal text-[#617068]">
                  The event's start decides the post's place in the feed — the
                  sooner it begins, the higher it sits. It comes down on its own
                  after the event ends.
                </span>
              </label>

              <label className="block text-xs font-semibold text-[#26352f]">
                Event date — to
                <input
                  type="date"
                  min={form.event_date_from || undefined}
                  value={form.event_date_to}
                  onChange={(e) => setForm({ ...form, event_date_to: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#26352f]">
                Attachment (optional)
                <input
                  type="file"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2 text-xs text-[#26352f] outline-none file:mr-3 file:rounded-full file:border-0 file:bg-[#f7f4ee] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#26352f] focus:border-[#b36b3c]"
                />
              </label>

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
          </div>
        </div>
      )}
    </section>
  );
}
