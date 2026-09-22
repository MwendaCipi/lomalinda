"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Announcement = {
  id: number;
  title: string;
  text: string;
  href?: string;
  attachment?: string | null;
  visibility: string;
  action_type?: "none" | "tithe" | "combined_offering" | "13th_sabbath" | "camp_expenses" | "camp_goal" | "local_church_budget" | "respond";
  sharing_option?: string;
  action_prompt?: string;
  expires_at?: string | null;
  created_at: string;
  published?: boolean;
};

export function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [form, setForm] = useState({
    title: "",
    text: "",
    visibility: "public",
    action_type: "none",
    sharing_option: "site",
    action_prompt: "",
    expires_at: "",
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSharingDropdown, setShowSharingDropdown] = useState(false);
  const sharingDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sharingDropdownRef.current && !sharingDropdownRef.current.contains(e.target as Node)) {
        setShowSharingDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function fetchAnnouncements() {
    setLoadingList(true);
    const token = localStorage.getItem("access_token");
    fetch(`${API_URL}/api/members/announcements/?include_expired=true&include_unpublished=true`, {
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
    if (!confirm(`Are you sure you want to delete the announcement "${title}"?`)) return;
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

  function resetAndCloseModal() {
    setForm({
      title: "",
      text: "",
      visibility: "public",
      action_type: "none",
      sharing_option: "site",
      action_prompt: "",
      expires_at: "",
    });
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
    setSubmitting(true);
    setMessage("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === "expires_at" && !value) return;
        payload.append(key, value);
      });
      payload.append("href", "");
      if (attachment) payload.append("attachment", attachment);
      const response = await fetch(`${API_URL}/api/members/announcements/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: payload,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Unable to post announcement.");

      const successText = "Announcement posted successfully.";
      showAlert("Announcement Posted", successText, "success");
      resetAndCloseModal();
      fetchAnnouncements();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Unable to post announcement.";
      setMessage(errorText);
      showAlert("Post Error", errorText, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col gap-6 border-b border-[#dfdbd1] bg-white p-6 sm:p-8 lg:p-10">
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
        {/* Mobile Cards View scroll within the card on phones */}
        <div className="custom-table-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain md:hidden divide-y divide-[#eeeae2]">
          {loadingList ? (
            <p className="py-12 text-center text-sm text-[#617068]">Loading announcements...</p>
          ) : announcements.length === 0 ? (
            <div className="py-12 text-center">
              <span className="text-4xl">📢</span>
              <p className="mt-3 text-sm font-semibold text-[#26352f]">No announcements available.</p>
              <p className="mt-1 text-xs text-[#617068]">Tap &quot;Add Announcement&quot; below to post your first announcement.</p>
            </div>
          ) : (
            announcements.map((item) => (
              <article key={item.id} className="space-y-2.5 bg-[#faf7f2] p-4 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-[#26352f]">{item.title}</h4>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.title)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Delete Announcement"
                    aria-label="Delete Announcement"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-[#415047]">{item.text}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#617068]">
                    {new Date(item.created_at).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                  <span className="rounded-full bg-[#eef2ed] px-2 py-0.5 text-[10px] font-bold text-[#3d5148] capitalize">
                    {item.visibility}
                  </span>
                  {item.sharing_option && (
                    <span className="rounded-full bg-[#b36b3c]/10 px-2 py-0.5 text-[10px] font-bold text-[#b36b3c]">
                      Via {item.sharing_option.split(",").map((s) => {
                        const v = s.trim().toLowerCase();
                        return v === "site" ? "Site" : v === "sms" ? "SMS" : v === "email" ? "Email" : v === "all" ? "Site, Email, SMS" : s.trim();
                      }).join(", ")}
                    </span>
                  )}
                  {item.action_type && item.action_type !== "none" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 capitalize">
                      {item.action_type.replaceAll("_", " ")}
                    </span>
                  )}
                </div>
                {item.expires_at && (
                  <p className="border-t border-[#eeeae2] pt-2 text-[10px] text-[#617068]">
                    Display until: {new Date(`${item.expires_at}T00:00:00`).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}
                  </p>
                )}
              </article>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden min-h-0 flex-1 overflow-auto custom-table-scrollbar md:block">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068] shadow-sm">
              <tr>
                <th className="w-12 px-4 py-3 text-left">#</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Announcement</th>
                <th className="px-4 py-3">Visibility</th>
                <th className="px-4 py-3">Channels</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Posted</th>
                <th className="px-4 py-3">Display Until</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eeeae2]">
              {loadingList ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[#617068]">Loading announcements...</td>
                </tr>
              ) : announcements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-[#26352f]">No announcements available.</p>
                    <p className="mt-1 text-xs text-[#617068]">Click &quot;Add Announcement&quot; below to post your first announcement.</p>
                  </td>
                </tr>
              ) : (
                announcements.map((item, idx) => (
                  <tr key={item.id} className="align-top hover:bg-[#faf7f2]">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-[#617068]">{idx + 1}</td>
                    <td className="min-w-[160px] px-4 py-3.5 font-bold text-[#26352f]">{item.title}</td>
                    <td className="max-w-[360px] px-4 py-3.5 text-xs leading-relaxed text-[#415047]">{item.text}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-xs font-semibold text-[#3d5148] capitalize">
                        {item.visibility}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[#617068]">
                      {item.sharing_option
                        ? item.sharing_option.split(",").map((s) => {
                            const v = s.trim().toLowerCase();
                            return v === "site" ? "Site" : v === "sms" ? "SMS" : v === "email" ? "Email" : v === "all" ? "Site, Email, SMS" : s.trim();
                          }).join(", ")
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      {item.action_type && item.action_type !== "none" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 capitalize">
                          {item.action_type.replaceAll("_", " ")}
                        </span>
                      ) : (
                        <span className="text-xs text-[#617068]">None</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[#617068]">
                      {new Date(item.created_at).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[#617068]">
                      {item.expires_at
                        ? new Date(`${item.expires_at}T00:00:00`).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item.title)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        title="Delete Announcement"
                        aria-label="Delete Announcement"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
                  Post New Announcement
                </h2>
                <p className="mt-1 text-xs text-[#617068]">
                  Fill in announcement details, select target audience and sharing channels.
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
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Announcement title"
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#26352f]">
                Visibility
                <select
                  value={form.visibility}
                  onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] bg-white px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                >
                  <option value="public">Public</option>
                  <option value="members">Members</option>
                  <option value="all">All</option>
                </select>
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
                Display until (end date)
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
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
                Custom Action Prompt / Instructions (optional)
                <input
                  value={form.action_prompt}
                  onChange={(e) => setForm({ ...form, action_prompt: e.target.value })}
                  placeholder="e.g. 'Enter your contribution amount' or 'Share your feedback'"
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </label>

              <label className="block text-xs font-semibold text-[#26352f] md:col-span-2">
                Announcement Text *
                <textarea
                  required
                  rows={4}
                  value={form.text}
                  onChange={(e) => setForm({ ...form, text: e.target.value })}
                  placeholder="Write full announcement content..."
                  className="mt-1 w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
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
                  {submitting ? "Posting..." : "Post Announcement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
