"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";
import { AdminSidebar } from "@/components/sidebars/admin-sidebar";
import { RecordList } from "./record-list";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Campaign {
  id: number;
  name: string;
  title: string;
  account_name?: string;
  description?: string;
  target_amount: number;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  is_temporary?: boolean;
  generate_card: boolean;
  target_groups?: string[];
  custom_card_image?: string | null;
  member_message?: string;
  schedule_message?: boolean;
  scheduled_at?: string | null;
  message_frequency?: string;
  message_sent?: boolean;
  last_message_sent_at?: string | null;
  total_raised: number;
  percentage_raised: number;
  donor_count: number;
  assigned_cards_count?: number;
  group_breakdown?: Record<string, number>;
}

interface ChurchUser {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  role?: string;
}

export const AVAILABLE_GROUPS = [
  { key: "all_members", label: "All Members (Entire Congregation)", icon: "👥" },
  { key: "choir", label: "Choir Ministry", icon: "🎵" },
  { key: "youth", label: "Youth Ministries", icon: "⚡" },
  { key: "children", label: "Children Ministry", icon: "👶" },
  { key: "men", label: "Adventist Men Ministries", icon: "👨" },
  { key: "women", label: "Adventist Women Ministries", icon: "👩" },
  { key: "leaders", label: "Church Leaders & Elders", icon: "👔" },
];

type CampaignMode = "admin" | "member";

export function CampaignManagement({
  mode = "member",
  openCreate = false,
}: {
  mode?: CampaignMode;
  /** Open the creation form as soon as the officer is allowed to see it. */
  openCreate?: boolean;
}) {
  const isAdminMode = mode === "admin";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfficial, setIsOfficial] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [broadcastingId, setBroadcastingId] = useState<number | null>(null);

  // New Campaign Form state
  const todayStr = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    name: "",
    title: "",
    account_name: "",
    is_temporary: true,
    target_amount: "",
    start_date: todayStr,
    end_date: "",
    member_message: "",
    schedule_message: false,
    scheduled_at: "",
    message_frequency: "once",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  // A flyer or poster that travels with the drive's announcement and emails.
  const [driveAttachment, setDriveAttachment] = useState<File | null>(null);

  // Card Issuance Modal State
  const [issuingCampaign, setIssuingCampaign] = useState<Campaign | null>(null);
  const [allUsers, setAllUsers] = useState<ChurchUser[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [comboboxSearch, setComboboxSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [issuingCards, setIssuingCards] = useState(false);

  // Actions menu dropdown state
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  // Only once, so closing the form after arriving from "Add Fund Drive" keeps it closed.
  const openedCreateForm = useRef(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsOfficial(false);
      setCanEdit(false);
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/api/members/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        const userRoles: string[] = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : [(user?.role || "").toLowerCase().trim()];
        const officialRoles = [
          "admin",
          "clerk",
          "elder",
          "youth_leader",
          "choir_director",
          "children_ministry",
          "men_ministry",
          "women_ministry",
          "chaplaincy",
          "finance",
          "treasurer",
        ];

        const allowedView = user && (userRoles.some((r) => officialRoles.includes(r)) || user.is_staff || user.is_superuser);
        const allowedEdit = user && (userRoles.some((r) => ["treasurer", "finance", "admin"].includes(r)) || user.is_staff || user.is_superuser);

        setIsOfficial(allowedView);
        setCanEdit(allowedEdit && isAdminMode);
        if (allowedView) {
          fetchCampaigns(token);
          if (isAdminMode) {
            fetchUsers(token);
          }
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setIsOfficial(false);
        setCanEdit(false);
        setLoading(false);
      });
  }, [isAdminMode]);

  useEffect(() => {
    if (openCreate && canEdit && !openedCreateForm.current) {
      openedCreateForm.current = true;
      setShowCreateModal(true);
    }
  }, [openCreate, canEdit]);

  function fetchCampaigns(token: string) {
    fetch(`${API_URL}/api/members/campaigns/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCampaigns(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function fetchUsers(token: string) {
    fetch(`${API_URL}/api/members/users/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllUsers(Array.isArray(data) ? data : []))
      .catch(() => setAllUsers([]));
  }

  function resetAndCloseModal() {
    setForm({
      name: "",
      title: "",
      account_name: "",
      is_temporary: true,
      target_amount: "",
      start_date: todayStr,
      end_date: "",
      member_message: "",
      schedule_message: false,
      scheduled_at: "",
      message_frequency: "once",
    });
    setDriveAttachment(null);
    setShowCreateModal(false);
  }

  async function handleCreateCampaign(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const numericTarget = parseFloat(form.target_amount);
    if (!form.name.trim()) {
      showAlert("Missing Campaign Name", "Please enter a campaign name.", "error");
      return;
    }
    if (isNaN(numericTarget) || numericTarget <= 0) {
      showAlert("Invalid Goal", "Please enter a positive fundraising target goal amount.", "error");
      return;
    }
    if (!form.start_date) {
      showAlert("Missing Date", "Please select a beginning date.", "error");
      return;
    }
    if (form.schedule_message && !form.scheduled_at) {
      showAlert("Scheduled Date Required", "Please enter the date and time to broadcast this message.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      // Multipart when a flyer rides along, JSON otherwise — the endpoint
      // accepts both, and the attachment travels with the drive from birth.
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        title: form.title.trim() || form.name.trim(),
        account_name: form.account_name.trim() || form.name.trim(),
        is_temporary: form.is_temporary,
        target_amount: numericTarget,
        start_date: form.start_date || todayStr,
        end_date: form.end_date || null,
        generate_card: false,
        member_message: form.member_message.trim(),
        schedule_message: form.schedule_message,
        scheduled_at: form.schedule_message && form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
        message_frequency: form.message_frequency,
      };
      let body: BodyInit;
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (driveAttachment) {
        const multipart = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) multipart.append(key, String(value));
        });
        multipart.append("attachment", driveAttachment);
        body = multipart;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(payload);
      }

      const res = await fetch(`${API_URL}/api/members/campaigns/`, {
        method: "POST",
        headers,
        body,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to create campaign.");

      showAlert(
        "Fund Drive Created",
        `Fund drive "${data.name}" (Account: ${data.account_name || data.name}) was created successfully.`,
        "success"
      );
      resetAndCloseModal();
      fetchCampaigns(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error creating campaign";
      showAlert("Creation Failed", msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOpenIssueCards(campaign: Campaign) {
    setIssuingCampaign(campaign);
    setSelectedGroups([]);
    setSelectedMemberIds([]);
    setComboboxSearch("");
    setIsDropdownOpen(false);

    const token = localStorage.getItem("access_token");
    if (token && allUsers.length === 0) {
      fetchUsers(token);
    }
  }

  async function handleIssueCardsSubmit(e: FormEvent) {
    e.preventDefault();
    if (!issuingCampaign) return;
    if (selectedGroups.length === 0 && selectedMemberIds.length === 0) {
      showAlert("No Recipients Selected", "Please select at least one group or individual member to issue invites.", "error");
      return;
    }

    setIssuingCards(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/${issuingCampaign.id}/issue-cards/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_groups: selectedGroups,
          member_ids: selectedMemberIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to issue invites.");

      showAlert("Invites Issued", data.detail || `Issued invites successfully for ${issuingCampaign.name}.`, "success");
      setIssuingCampaign(null);
      if (token) fetchCampaigns(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error issuing invites.";
      showAlert("Issuance Failed", msg, "error");
    } finally {
      setIssuingCards(false);
    }
  }

  async function handleToggleCampaignActive(id: number, currentActive: boolean) {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/${id}/`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        showAlert("Campaign Updated", `Fund drive marked as ${!currentActive ? "Active" : "Ended"}.`, "success");
        fetchCampaigns(token);
      }
    } catch {
      showAlert("Error", "Could not update campaign status.", "error");
    }
  }

  async function handleBroadcastMessage(id: number, name: string) {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    if (!confirm(`Are you sure you want to send a broadcast message to members for "${name}"?`)) return;

    setBroadcastingId(id);
    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/${id}/broadcast/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        showAlert("Message Sent", data.detail || "Broadcast sent successfully.", "success");
        fetchCampaigns(token);
      } else {
        throw new Error(data.detail || "Failed to send broadcast.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error sending broadcast.";
      showAlert("Broadcast Error", msg, "error");
    } finally {
      setBroadcastingId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
        <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
          {isAdminMode ? <AdminSidebar /> : <SupportSidebar />}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            <p className="text-sm font-semibold text-[#617068]">Loading Fund Drives...</p>
          </div>
        </div>
      </main>
    );
  }

  if (isOfficial === false) {
    return (
      <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
        <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
          {isAdminMode ? <AdminSidebar /> : <SupportSidebar />}
          <div className="flex-1 min-w-0 p-8 text-center">
            <h1 className="text-2xl font-bold text-[#26352f]">Access Restricted</h1>
            <p className="mt-2 text-sm text-[#617068]">
              {isAdminMode
                ? "Managing fund drives is restricted to authorized church officials and finance managers."
                : "Please log in to view the church's active fund drives."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        {isAdminMode ? <AdminSidebar /> : <SupportSidebar />}

        <div className="flex-1 min-w-0 w-full h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 border-b border-[#dfdbd1] space-y-8 overflow-y-auto overscroll-contain custom-hover-scrollbar">
          {/* Phones carry no admin sidebar, so this page gives its own way back. */}
          {isAdminMode && (
            <Link
              href="/administration"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#b36b3c] transition hover:text-[#26352f] lg:hidden"
            >
              &larr; Back to administration
            </Link>
          )}

          {/* Top Banner / Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#dfdbd1] pb-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Fund Drives {isAdminMode && "& Goal Management"}
              </h1>
              <p className="mt-2 text-sm text-[#617068]">
                {isAdminMode
                  ? "Create standing or temporary fund drives with custom account names, target goals, and automated broadcasts."
                  : "Follow the church's active fund drives, see progress toward each goal, and support a cause."}
              </p>
            </div>

            {isAdminMode && canEdit && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center justify-center rounded-full bg-[#5f8067] px-6 py-3 text-xs font-bold text-white transition hover:bg-[#4d6d55] shrink-0 shadow-sm"
              >
                + Create New Fund Drive
              </button>
            )}
          </div>

          {/* New Fund Drive Modal */}
          {isAdminMode && showCreateModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget && !isSubmitting) resetAndCloseModal();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-campaign-title"
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1] sm:p-8"
              >
                <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
                  <div>
                    <h2 id="create-campaign-title" className="text-xl font-bold text-[#26352f]">
                      New Fund Drive
                    </h2>
                    <p className="mt-1 text-xs text-[#617068]">
                      Set fund drive details, account reference, target goal, and member broadcast options.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={resetAndCloseModal}
                    className="rounded-full p-2 text-xl leading-none text-[#617068] transition hover:bg-[#f7f4ee] hover:text-[#26352f]"
                    aria-label="Close modal"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateCampaign} className="mt-6 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-xs font-semibold text-[#26352f]">
                      Fund Drive Name *
                      <input
                        required
                        type="text"
                        placeholder="e.g. 2026 Church Building Expansion"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-[#26352f]">
                      Account Reference / Title
                      <input
                        type="text"
                        placeholder="e.g. BUILDING FUND (Default: Drive Name)"
                        value={form.account_name}
                        onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block text-xs font-semibold text-[#26352f]">
                      Target Goal (KES) *
                      <input
                        required
                        type="number"
                        min="1"
                        step="any"
                        placeholder="e.g. 500000"
                        value={form.target_amount}
                        onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs font-bold text-[#5f8067] outline-none focus:border-[#b36b3c] focus:bg-white"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-[#26352f]">
                      Start Date *
                      <input
                        required
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                      />
                    </label>

                    <label className="block text-xs font-semibold text-[#26352f]">
                      End Date <span className="font-normal text-[#617068]">(Optional)</span>
                      <input
                        type="date"
                        value={form.end_date}
                        onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3.5 py-2.5 text-xs text-[#26352f] outline-none focus:border-[#b36b3c] focus:bg-white"
                      />
                    </label>
                  </div>

                  {/* Attachment (flyer / poster) */}
                  <label className="block text-xs font-semibold text-[#26352f]">
                    Attachment <span className="font-normal text-[#617068]">(Optional — shown with the drive's announcement and attached to its emails)</span>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => setDriveAttachment(e.target.files?.[0] ?? null)}
                      className="mt-1 block w-full cursor-pointer rounded-xl border border-[#dfdbd1] bg-[#fcfbf9] px-3 py-2 text-xs text-[#26352f] file:mr-3 file:rounded-lg file:border-0 file:bg-[#26352f] file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-white"
                    />
                  </label>

                  {/* Broadcast Message Options */}
                  <div className="rounded-2xl bg-[#faf9f5] p-4 ring-1 ring-[#dfdbd1] space-y-3">
                    <label className="block text-xs font-bold text-[#26352f]">
                      Member Announcement Broadcast <span className="font-normal text-[#617068]">(Optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Write an encouragement message to broadcast to members regarding this drive..."
                      value={form.member_message}
                      onChange={(e) => setForm({ ...form, member_message: e.target.value })}
                      className="w-full rounded-xl border border-[#dfdbd1] bg-white px-3.5 py-2 text-xs text-[#26352f] outline-none focus:border-[#b36b3c]"
                    />

                    {form.member_message && (
                      <div className="space-y-3 pt-2 border-t border-[#dfdbd1]/60">
                        <label className="flex items-center gap-2.5 text-xs font-medium text-[#26352f] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.schedule_message}
                            onChange={(e) => setForm({ ...form, schedule_message: e.target.checked })}
                            className="h-4 w-4 rounded accent-[#5f8067]"
                          />
                          <span>Schedule broadcast message for later</span>
                        </label>

                        {form.schedule_message && (
                          <div className="grid gap-3 sm:grid-cols-2 pt-1">
                            <label className="block text-xs font-semibold text-[#26352f]">
                              Broadcast Date &amp; Time
                              <input
                                type="datetime-local"
                                value={form.scheduled_at}
                                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs outline-none focus:border-[#b36b3c]"
                              />
                            </label>

                            <label className="block text-xs font-semibold text-[#26352f]">
                              Broadcast Frequency
                              <select
                                value={form.message_frequency}
                                onChange={(e) => setForm({ ...form, message_frequency: e.target.value })}
                                className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-white px-3 py-2 text-xs outline-none focus:border-[#b36b3c]"
                              >
                                <option value="once">One-time broadcast</option>
                                <option value="weekly">Weekly (Every Sabbath reminder)</option>
                                <option value="daily">Daily reminder</option>
                                <option value="biweekly">Bi-weekly reminder</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={resetAndCloseModal}
                      className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] transition hover:border-[#b36b3c]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-full bg-[#5f8067] px-6 py-2.5 text-xs font-bold text-white transition hover:bg-[#4d6d55] disabled:opacity-60 shadow-sm"
                    >
                      {isSubmitting ? "Creating Drive..." : "Create Drive"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Issue Invites Popover Modal */}
          {isAdminMode && issuingCampaign && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={(e) => {
                if (e.target === e.currentTarget && !issuingCards) setIssuingCampaign(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="max-h-[90vh] w-full max-w-xl overflow-visible rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1] sm:p-8"
              >
                <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#b36b3c]">
                      Issue Personal Invites
                    </span>
                    <h2 className="text-xl font-bold text-[#26352f]">
                      {issuingCampaign.title || issuingCampaign.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    disabled={issuingCards}
                    onClick={() => setIssuingCampaign(null)}
                    className="rounded-full p-2 text-xl leading-none text-[#617068] transition hover:bg-[#f7f4ee] hover:text-[#26352f]"
                    aria-label="Close modal"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleIssueCardsSubmit} className="mt-6 space-y-6">
                  {/* Combobox Recipient Selector */}
                  <div className="relative space-y-2">
                    <label className="block text-xs font-bold text-[#26352f]">
                      Select Invite Recipients (Groups &amp; Members) *
                    </label>
                    <p className="text-[11px] text-[#617068]">
                      Groups come first (beginning with &quot;All Members&quot;). You can also select individual church members.
                    </p>

                    {/* Combobox Input Container with selected text boxes/chips */}
                    <div
                      className="min-h-[48px] w-full rounded-2xl border border-[#c9c5bb] bg-[#faf9f5] p-2 flex flex-wrap items-center gap-1.5 focus-within:border-[#b36b3c] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#b36b3c]/20 transition cursor-text"
                      onClick={() => setIsDropdownOpen(true)}
                    >
                      {/* Group Chips */}
                      {selectedGroups.map((gKey) => {
                        const grpObj = AVAILABLE_GROUPS.find((g) => g.key === gKey);
                        return (
                          <span
                            key={gKey}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#26352f] text-white px-2.5 py-1 text-xs font-semibold shadow-xs"
                          >
                            <span>{grpObj?.icon || "👥"}</span>
                            <span>{grpObj?.label || gKey}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedGroups(selectedGroups.filter((k) => k !== gKey));
                              }}
                              className="hover:text-rose-300 font-bold ml-1"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}

                      {/* Member Chips */}
                      {selectedMemberIds.map((mId) => {
                        const mUser = allUsers.find((u) => u.id === mId);
                        const nameStr = [mUser?.first_name, mUser?.last_name].filter(Boolean).join(" ") || mUser?.name || mUser?.username || `Member #${mId}`;
                        return (
                          <span
                            key={mId}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5f8067] text-white px-2.5 py-1 text-xs font-semibold shadow-xs"
                          >
                            <span>👤</span>
                            <span>{nameStr}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMemberIds(selectedMemberIds.filter((id) => id !== mId));
                              }}
                              className="hover:text-rose-300 font-bold ml-1"
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}

                      {/* Inline Combobox Search Input */}
                      <input
                        type="text"
                        value={comboboxSearch}
                        onChange={(e) => {
                          setComboboxSearch(e.target.value);
                          setIsDropdownOpen(true);
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        placeholder={selectedGroups.length === 0 && selectedMemberIds.length === 0 ? "Click or type to search groups & members..." : "Add recipients..."}
                        className="flex-1 min-w-[140px] bg-transparent text-xs text-[#26352f] outline-none p-1 placeholder:text-[#8b9790]"
                      />
                    </div>

                    {/* Combobox Dropdown Popover List */}
                    {isDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto rounded-2xl bg-white border border-[#dfdbd1] shadow-2xl p-2 z-50 divide-y divide-[#dfdbd1]/60">
                        {/* GROUPS SECTION (FIRST, BEGINNING WITH ALL) */}
                        <div className="pb-2">
                          <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#b36b3c]">
                            Church Groups (Beginning with All)
                          </p>
                          {AVAILABLE_GROUPS.filter((g) =>
                            g.label.toLowerCase().includes(comboboxSearch.toLowerCase())
                          ).map((g) => {
                            const isSelected = selectedGroups.includes(g.key);
                            return (
                              <button
                                key={g.key}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedGroups(selectedGroups.filter((k) => k !== g.key));
                                  } else {
                                    setSelectedGroups([...selectedGroups, g.key]);
                                  }
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition ${
                                  isSelected ? "bg-[#26352f]/10 text-[#26352f]" : "hover:bg-[#f7f4ee] text-[#26352f]"
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm">{g.icon}</span>
                                  <span>{g.label}</span>
                                </div>
                                {isSelected && <span className="text-[#5f8067] font-bold">✓ Selected</span>}
                              </button>
                            );
                          })}
                        </div>

                        {/* INDIVIDUAL MEMBERS SECTION (SECOND) */}
                        <div className="pt-2">
                          <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
                            Individual Members ({allUsers.length})
                          </p>
                          {allUsers
                            .filter((u) => {
                              const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name || u.username;
                              const text = `${fullName} ${u.username} ${u.email}`.toLowerCase();
                              return text.includes(comboboxSearch.toLowerCase());
                            })
                            .slice(0, 20)
                            .map((u) => {
                              const isSelected = selectedMemberIds.includes(u.id);
                              const nameStr = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.name || u.username;
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedMemberIds(selectedMemberIds.filter((id) => id !== u.id));
                                    } else {
                                      setSelectedMemberIds([...selectedMemberIds, u.id]);
                                    }
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition ${
                                    isSelected ? "bg-[#5f8067]/10 text-[#26352f]" : "hover:bg-[#f7f4ee] text-[#26352f]"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span>👤</span>
                                    <div>
                                      <span className="font-semibold text-[#26352f]">{nameStr}</span>
                                      <span className="text-[11px] text-[#617068] ml-2">@{u.username}</span>
                                    </div>
                                  </div>
                                  {isSelected && <span className="text-[#5f8067] font-bold">✓ Selected</span>}
                                </button>
                              );
                            })}
                        </div>

                        <div className="pt-2 pb-1 text-right">
                          <button
                            type="button"
                            onClick={() => setIsDropdownOpen(false)}
                            className="text-xs font-bold text-[#b36b3c] hover:underline px-3"
                          >
                            Done selecting
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                    <button
                      type="button"
                      disabled={issuingCards}
                      onClick={() => setIssuingCampaign(null)}
                      className="rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-semibold text-[#617068] transition hover:border-[#b36b3c]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={issuingCards}
                      className="rounded-full bg-[#5f8067] px-6 py-2.5 text-xs font-bold text-white transition hover:bg-[#4d6d55] disabled:opacity-60 shadow-sm"
                    >
                      {issuingCards ? "Issuing Invites..." : "Issue Invites Now"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Existing Campaigns List */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-[#26352f]">
              {isAdminMode ? `All Fund Drives (${campaigns.length})` : `Active Fund Drives (${campaigns.length})`}
            </h2>

            {campaigns.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-[#dfdbd1]">
                <p className="text-sm text-[#617068]">
                  {isAdminMode
                    ? 'No fund drives created yet. Click "+ Create New Fund Drive" to get started.'
                    : "There are no active fund drives right now. Please check back soon."}
                </p>
              </div>
            ) : (
              <>
                {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */}
                <RecordList
                  rows={campaigns}
                  loading={false}
                  rowKey={(c) => c.id}
                  headers={[
                    { label: "Fund Drive", className: "px-5 py-3.5" },
                    { label: "Account Ref", className: "px-4 py-3.5" },
                    { label: "Target & Raised", className: "px-4 py-3.5" },
                    { label: "Timeline", className: "px-4 py-3.5" },
                    ...(isAdminMode
                      ? [{ label: "Invites", className: "px-3 py-3.5 text-center" }]
                      : []),
                    { label: "Status", className: "px-3 py-3.5 text-center" },
                    { label: "Actions", className: "px-5 py-3.5 text-right" },
                  ]}
                  loadingLabel=""
                  tableWrapperClassName="overflow-hidden overflow-x-auto custom-table-scrollbar rounded-3xl bg-white shadow-sm ring-1 ring-[#dfdbd1]"
                  tableClassName="w-full text-left border-collapse"
                  headClassName=""
                  headRowClassName="border-b border-[#dfdbd1] bg-[#faf9f5] text-[11px] font-bold uppercase tracking-wider text-[#617068]"
                  headCellClassName=""
                  bodyClassName="divide-y divide-[#dfdbd1] text-xs"
                  cardsClassName="grid gap-4"
                  renderRow={(c) => (
                          <tr key={c.id} className="transition hover:bg-[#fcfbf9]">
                            <td className="px-5 py-4 align-middle">
                              <Link
                                href={`/campaigns/${c.id}`}
                                className="group block"
                              >
                                <div className="font-bold text-[#26352f] group-hover:text-[#b36b3c] transition-colors text-sm">
                                  {c.title || c.name}
                                </div>
                              </Link>
                            </td>
                            <td className="px-4 py-4 align-middle whitespace-nowrap">
                              <code className="rounded-md bg-[#f7f4ee] px-2 py-1 font-mono text-xs font-bold text-[#b36b3c] border border-[#dfdbd1]">
                                {c.account_name || c.name}
                              </code>
                            </td>
                            <td className="px-4 py-4 align-middle min-w-[180px]">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-[#5f8067]">
                                    KES {Number(c.total_raised).toLocaleString()}
                                  </span>
                                  <span className="text-[11px] text-[#617068]">
                                    {c.percentage_raised}% of {Number(c.target_amount).toLocaleString()}
                                  </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e6e2d8]">
                                  <div
                                    className="h-full rounded-full bg-[#5f8067]"
                                    style={{ width: `${Math.min(100, c.percentage_raised)}%` }}
                                  />
                                </div>
                                <div className="text-[10px] text-[#617068]">
                                  {c.donor_count || 0} donor{(c.donor_count || 0) === 1 ? "" : "s"}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 align-middle whitespace-nowrap text-xs text-[#617068]">
                              <div>
                                <span className="font-medium text-[#26352f]">{c.start_date}</span>
                              </div>
                              <div className="text-[11px]">
                                {c.end_date ? `to ${c.end_date}` : "(Ongoing)"}
                              </div>
                            </td>
                            {isAdminMode && (
                              <td className="px-3 py-4 align-middle text-center whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#f7f4ee] px-2.5 py-1 text-xs font-semibold text-[#26352f] border border-[#dfdbd1]">
                                  🎴 {c.assigned_cards_count || 0}
                                </span>
                              </td>
                            )}
                            <td className="px-3 py-4 align-middle text-center whitespace-nowrap">
                              <span
                                className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  c.is_active
                                    ? "bg-[#e8f3ec] text-[#2d5d39]"
                                    : "bg-[#f3e8e8] text-[#8c2e2e]"
                                }`}
                              >
                                {c.is_active ? "Active" : "Ended"}
                              </span>
                            </td>
                            <td className="px-5 py-4 align-middle text-right whitespace-nowrap relative">
                              <div className="relative inline-block text-left">
                                <button
                                  type="button"
                                  onClick={() => setOpenActionsId(openActionsId === c.id ? null : c.id)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#dfdbd1] bg-white px-3 py-1.5 text-xs font-semibold text-[#26352f] shadow-sm hover:bg-[#f7f4ee] hover:border-[#b36b3c] transition-colors focus:outline-none"
                                >
                                  <span>Actions</span>
                                  <svg className={`w-3.5 h-3.5 transition-transform ${openActionsId === c.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>

                                {openActionsId === c.id && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-10"
                                      onClick={() => setOpenActionsId(null)}
                                    />
                                    <div className="absolute right-0 mt-1.5 z-20 w-48 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-[#dfdbd1] space-y-1 text-left">
                                      <Link
                                        href={`/campaigns/${c.id}`}
                                        onClick={() => setOpenActionsId(null)}
                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] hover:text-[#b36b3c] transition-colors"
                                      >
                                        💳 View Card &rarr;
                                      </Link>

                                      {isAdminMode && canEdit && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenActionsId(null);
                                              handleOpenIssueCards(c);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#b36b3c] hover:bg-[#f7f4ee] transition-colors"
                                          >
                                            🎴 + Issue Invites
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenActionsId(null);
                                              handleBroadcastMessage(c.id, c.title || c.name);
                                            }}
                                            disabled={broadcastingId === c.id}
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#5f8067] hover:bg-[#f7f4ee] disabled:opacity-50 transition-colors"
                                          >
                                            📢 {broadcastingId === c.id ? "Sending..." : "Message Members"}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenActionsId(null);
                                              handleToggleCampaignActive(c.id, c.is_active);
                                            }}
                                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                              c.is_active
                                                ? "text-red-700 hover:bg-red-50"
                                                : "text-emerald-700 hover:bg-emerald-50"
                                            }`}
                                          >
                                            {c.is_active ? "⏸️ End Fund Drive" : "▶️ Reactivate Drive"}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                  )}
                  renderCard={(c) => (
                    <div key={c.id} className="flex flex-col justify-between rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] transition hover:shadow-md space-y-4">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.is_active ? "bg-[#e8f3ec] text-[#2d5d39]" : "bg-[#f3e8e8] text-[#8c2e2e]"}`}>
                              {c.is_active ? "Active" : "Ended"}
                            </span>
                          </div>
                          {isAdminMode && (
                            <span className="text-xs text-[#617068]">Invites Issued: <strong className="text-[#26352f]">{c.assigned_cards_count || 0}</strong></span>
                          )}
                        </div>

                        <Link href={`/campaigns/${c.id}`} className="group block cursor-pointer">
                          <h3 className="text-lg font-bold text-[#26352f] group-hover:text-[#b36b3c] transition-colors">{c.title || c.name}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#617068]">
                            <span>Account Ref: <code className="font-mono font-bold text-[#b36b3c]">{c.account_name || c.name}</code></span>
                            <span>&bull;</span>
                            <span>{c.start_date} {c.end_date ? `to ${c.end_date}` : "(Ongoing)"}</span>
                          </div>
                        </Link>

                        {/* Progress details */}
                        <div>
                          <div className="flex justify-between text-xs font-medium text-[#26352f]">
                            <span>KES {Number(c.total_raised).toLocaleString()} raised</span>
                            <span>{c.percentage_raised}% of KES {Number(c.target_amount).toLocaleString()}</span>
                          </div>
                          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#e6e2d8]">
                            <div
                              className="h-full rounded-full bg-[#5f8067]"
                              style={{ width: `${Math.min(100, c.percentage_raised)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mobile Actions Dropdown */}
                      <div className="flex items-center justify-between border-t border-[#dfdbd1]/60 pt-3">
                        <span className="text-xs text-[#617068] font-medium">Drive Options</span>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={() => setOpenActionsId(openActionsId === c.id ? null : c.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[#dfdbd1] bg-white px-3 py-1.5 text-xs font-semibold text-[#26352f] shadow-sm hover:bg-[#f7f4ee] hover:border-[#b36b3c] transition-colors focus:outline-none"
                          >
                            <span>Actions</span>
                            <svg className={`w-3.5 h-3.5 transition-transform ${openActionsId === c.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {openActionsId === c.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenActionsId(null)}
                              />
                              <div className="absolute right-0 bottom-full mb-1.5 z-20 w-48 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-[#dfdbd1] space-y-1 text-left">
                                <Link
                                  href={`/campaigns/${c.id}`}
                                  onClick={() => setOpenActionsId(null)}
                                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] hover:text-[#b36b3c] transition-colors"
                                >
                                  💳 View Card &rarr;
                                </Link>

                                {isAdminMode && canEdit && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionsId(null);
                                        handleOpenIssueCards(c);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#b36b3c] hover:bg-[#f7f4ee] transition-colors"
                                    >
                                      🎴 + Issue Cards
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionsId(null);
                                        handleBroadcastMessage(c.id, c.title || c.name);
                                      }}
                                      disabled={broadcastingId === c.id}
                                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#5f8067] hover:bg-[#f7f4ee] disabled:opacity-50 transition-colors"
                                    >
                                      📢 {broadcastingId === c.id ? "Sending..." : "Message Members"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionsId(null);
                                        handleToggleCampaignActive(c.id, c.is_active);
                                      }}
                                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                        c.is_active
                                          ? "text-red-700 hover:bg-red-50"
                                          : "text-emerald-700 hover:bg-emerald-50"
                                      }`}
                                    >
                                      {c.is_active ? "⏸️ End Fund Drives" : "▶️ Reactivate Drive"}
                                    </button>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
