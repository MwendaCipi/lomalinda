"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Baby,
  Check,
  CreditCard,
  Crown,
  IdCard,
  Megaphone,
  Music,
  Pause,
  Pencil,
  Play,
  Receipt,
  User,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { dayFirst, localDate } from "@/lib/dates";
import { RecordList } from "./record-list";
import { densityCellPad } from "@/lib/table-density";
import { AddReceiptModal } from "./add-receipt-modal";

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
  allow_personal_invitations?: boolean;
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
  { key: "all_members", label: "All Members (Entire Congregation)", icon: Users },
  { key: "choir", label: "Choir Ministry", icon: Music },
  { key: "youth", label: "Youth Ministries", icon: Zap },
  { key: "children", label: "Children Ministry", icon: Baby },
  { key: "men", label: "Adventist Men Ministries", icon: User },
  { key: "women", label: "Adventist Women Ministries", icon: User },
  { key: "leaders", label: "Church Leaders & Elders", icon: Crown },
];

type CampaignMode = "admin" | "member";

export function CampaignManagement({
  mode = "member",
  openCreate = false,
  presetAccount = "",
  presetAccountLabel = "",
  skipList = false,
  formOnly = false,
  onCreated,
  onClosed,
}: {
  mode?: CampaignMode;
  /** Open the creation form as soon as the officer is allowed to see it. */
  openCreate?: boolean;
  /** A promoted treasury account: its short reference answers for the drive. */
  presetAccount?: string;
  /** The account's human wording, used to name the drive being promoted. */
  presetAccountLabel?: string;
  /** While the Fund Drives entry page picks the drive to open, the list holds
      back so the redirect never flashes a page we are leaving anyway. */
  skipList?: boolean;
  /** The creation form alone, over whatever page asked for it — the treasury
      accounts desk opens it in place, so promoting an account never leaves
      the page it was started from. The drives console renders as usual. */
  formOnly?: boolean;
  /** The drive just created, so a host page can move on once it exists. */
  onCreated?: (campaign: Campaign) => void;
  /** The form was dismissed without creating a drive. */
  onClosed?: () => void;
}) {
  const isAdminMode = mode === "admin";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfficial, setIsOfficial] = useState<boolean | null>(null);
  const [canEdit, setCanEdit] = useState<boolean>(false);
  const [broadcastingId, setBroadcastingId] = useState<number | null>(null);
  // The table search: drives are few, but the desk still wants to find one
  // by name or account reference without reading the whole list.
  const [search, setSearch] = useState("");
  // Compact rows for the drive table — the one shared desk preference.
  const rowDrive = densityCellPad();

  // New Campaign Form state
  const todayStr = localDate();
  const [form, setForm] = useState({
    name: "",
    title: "",
    account_name: "",
    description: "",
    is_temporary: true,
    target_amount: "",
    start_date: todayStr,
    end_date: "",
    member_message: "",
    schedule_message: false,
    scheduled_at: "",
    message_frequency: "once",
    allow_personal_invitations: false,
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

  // Actions menu state. The menu renders `fixed` at coordinates captured from
  // its button, because an `absolute` menu is clipped by the table wrapper's
  // `overflow-hidden` — fatal for a one-row table, whose wrapper bottom sits
  // right under the row no matter how much page remains below it.
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [actionsMenuPos, setActionsMenuPos] = useState<{
    right: number;
    dropUp: boolean;
    top: number;
    bottom: number;
  } | null>(null);

  const toggleActionsMenu = (id: number, event: React.MouseEvent<HTMLButtonElement>) => {
    if (openActionsId === id) {
      setActionsMenuPos(null);
      setOpenActionsId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const dropUp = window.innerHeight - rect.bottom < 260;
    setActionsMenuPos({
      right: window.innerWidth - rect.right,
      dropUp,
      top: rect.bottom + 6,
      bottom: window.innerHeight - rect.top + 6,
    });
    setOpenActionsId(id);
  };

  /** Closing the menu also clears its captured position. */
  const closeActionsMenu = () => {
    setOpenActionsId(null);
    setActionsMenuPos(null);
  };

  // A fixed menu doesn't travel with the page, so any scroll or resize would
  // strand it in space — close it instead of letting it drift.
  useEffect(() => {
    if (openActionsId === null) return;
    const close = () => {
      setOpenActionsId(null);
      setActionsMenuPos(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openActionsId]);
  // The drive being edited — when set, the create modal opens prefilled in edit mode.
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  // The drive a manual receipt is being recorded against.
  const [receiptCampaign, setReceiptCampaign] = useState<Campaign | null>(null);
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
          "treasurer",
        ];

        const allowedView = user && (userRoles.some((r) => officialRoles.includes(r)) || user.is_staff || user.is_superuser);
        const allowedEdit = user && (userRoles.some((r) => ["treasurer", "admin"].includes(r)) || user.is_staff || user.is_superuser);

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
      if (presetAccount) {
        // Promoting an account: the drive is about that account, so its short
        // reference answers for the M-Pesa prompt and its wording names the
        // drive. Both stay editable.
        setForm((prev) => ({
          ...prev,
          account_name: presetAccount,
          name: prev.name || presetAccountLabel || presetAccount,
          title: prev.title || presetAccountLabel,
        }));
      }
      setShowCreateModal(true);
    }
  }, [openCreate, canEdit, presetAccount, presetAccountLabel]);

  function fetchCampaigns(token: string) {
    fetch(`${API_URL}/api/members/campaigns/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  /** The drives the search names, case-insensitively, on name or account ref. */
  const filteredCampaigns = campaigns.filter((c) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return `${c.title || ""} ${c.name} ${c.account_name || ""}`.toLowerCase().includes(needle);
  });

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
      description: "",
      is_temporary: true,
      target_amount: "",
      start_date: todayStr,
      end_date: "",
      member_message: "",
      schedule_message: false,
      scheduled_at: "",
      message_frequency: "once",
      allow_personal_invitations: false,
    });
    setDriveAttachment(null);
    setEditingCampaign(null);
    setShowCreateModal(false);
    onClosed?.();
  }

  /** Open the create modal prefilled with a drive's details (edit mode). */
  function handleOpenEdit(campaign: Campaign) {
    setEditingCampaign(campaign);
    setForm({
      name: campaign.name || "",
      title: campaign.title || "",
      account_name: campaign.account_name || "",
      description: campaign.description || "",
      is_temporary: campaign.is_temporary ?? true,
      target_amount: campaign.target_amount ? String(campaign.target_amount) : "",
      start_date: campaign.start_date || todayStr,
      end_date: campaign.end_date || "",
      member_message: campaign.member_message || "",
      schedule_message: campaign.schedule_message || false,
      scheduled_at: campaign.scheduled_at ? campaign.scheduled_at.slice(0, 16) : "",
      message_frequency: campaign.message_frequency || "once",
      allow_personal_invitations: campaign.allow_personal_invitations || false,
    });
    setDriveAttachment(null);
    setShowCreateModal(true);
  }

  /** PATCH the drive's details (edit mode of the same modal). */
  async function handleUpdateCampaign(e: FormEvent) {
    e.preventDefault();
    if (!editingCampaign) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;

    const numericTarget = parseFloat(form.target_amount);
    if (!form.name.trim()) {
      showAlert("Missing Campaign Name", "Please enter a campaign name.", "error");
      return;
    }
    if (isNaN(numericTarget) || numericTarget <= 0) {
      showAlert("Invalid Goal", "Please enter a positive fund drive target goal amount.", "error");
      return;
    }
    if (!form.start_date) {
      showAlert("Missing Date", "Please select a beginning date.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/${editingCampaign.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name.trim(),
          title: form.title.trim() || form.name.trim(),
          account_name: form.account_name.trim() || form.name.trim(),
          description: form.description.trim(),
          is_temporary: form.is_temporary,
          target_amount: numericTarget,
          start_date: form.start_date || todayStr,
          end_date: form.end_date || null,
          member_message: "",
          allow_personal_invitations: form.allow_personal_invitations,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to update the drive.");

      showAlert("Fund Drive Updated", `Fund drive "${data.name || form.name}" was updated successfully.`, "success");
      resetAndCloseModal();
      fetchCampaigns(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error updating campaign";
      showAlert("Update Failed", msg, "error");
    } finally {
      setIsSubmitting(false);
    }
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
      showAlert("Invalid Goal", "Please enter a positive fund drive target goal amount.", "error");
      return;
    }
    if (!form.start_date) {
      showAlert("Missing Date", "Please select a beginning date.", "error");
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
        description: form.description.trim(),
        is_temporary: form.is_temporary,
        target_amount: numericTarget,
        start_date: form.start_date || todayStr,
        end_date: form.end_date || null,
        generate_card: false,
        member_message: "",
        schedule_message: false,
        scheduled_at: null,
        message_frequency: "once",
        allow_personal_invitations: form.allow_personal_invitations,
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
      // A host page (the treasury accounts desk) learns of the new drive here,
      // so promoting an account can move on the moment the drive exists.
      onCreated?.(data);
      resetAndCloseModal();
      fetchCampaigns(token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error creating campaign";
      showAlert("Creation Failed", msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Copy the drive's public giving link.
   *
   * When personal invitations are off, this is the only link a drive shares:
   * `/campaigns/<id>` opens for anyone — no account needed — and a gift made
   * through it is still counted towards the drive.
   */
  async function handleCopyGeneralLink(campaign: Campaign) {
    const url = `${window.location.origin}/campaigns/${campaign.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showAlert("Link Copied", `The public link for ${campaign.title || campaign.name} is on your clipboard.`, "success");
    } catch {
      showAlert("Copy the link", url, "info");
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
    // A host page (formOnly) already has its own chrome; it wants only the
    // form, so it renders nothing until the officer is known to be allowed it.
    if (formOnly) return null;
    return (
      <main className="min-h-screen md:h-full md:min-h-0 bg-white text-bark md:overflow-hidden">
        <div className="flex h-full md:overflow-hidden">
          <div className="flex-1 min-w-0 flex items-center justify-center">
            <p className="text-sm font-semibold text-moss">Loading Fund Drives...</p>
          </div>
        </div>
      </main>
    );
  }

  if (isOfficial === false) {
    if (formOnly) return null;
    return (
      <main className="min-h-screen md:h-full md:min-h-0 bg-white text-bark md:overflow-hidden">
        <div className="flex h-full md:overflow-hidden">
          <div className="flex-1 min-w-0 p-8 text-center">
            <h1 className="text-2xl font-bold text-bark">Access Restricted</h1>
            <p className="mt-2 text-sm text-moss">
              {isAdminMode
                ? "Managing fund drives is restricted to authorized church officials and finance managers."
                : "Please log in to view the church's active fund drives."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  // The creation form, hoisted out of the page so a host desk (the treasury
  // accounts page) can render it in place — `formOnly` — and create a drive
  // without ever leaving where the account lives. The drives console renders
  // the very same modal in place below.
  const createFormModal =
    isAdminMode && showCreateModal ? (
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
          className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
        >
          <div className="flex items-center justify-between border-b border-sand-line pb-4">
            <div>
              <h2 id="create-campaign-title" className="text-xl font-bold text-bark">
                {editingCampaign ? "Edit Fund Drive" : "New Fund Drive"}
              </h2>
              <p className="mt-1 text-xs text-moss">
                {editingCampaign
                  ? "Update the drive's details, account reference, target goal, and dates."
                  : "Set fund drive details, account reference, target goal, and member broadcast options."}
              </p>
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={resetAndCloseModal}
              className="rounded-full p-2 text-xl leading-none text-moss transition hover:bg-sand hover:text-bark"
              aria-label="Close modal"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={editingCampaign ? handleUpdateCampaign : handleCreateCampaign} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-bark">
                Fund Drive Name *
                <input
                  required
                  type="text"
                  placeholder="e.g. 2026 Church Building Expansion"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember focus:bg-white"
                />
              </label>

              <label className="block text-xs font-semibold text-bark">
                Account Reference / Title
                <input
                  type="text"
                  placeholder="e.g. BUILDING FUND (Default: Drive Name)"
                  value={form.account_name}
                  onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember focus:bg-white"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-xs font-semibold text-bark">
                Target Goal (KES) *
                <input
                  required
                  type="number"
                  min="1"
                  step="any"
                  placeholder="e.g. 500000"
                  value={form.target_amount}
                  onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs font-bold text-sage outline-none focus:border-ember focus:bg-white"
                />
              </label>

              <label className="block text-xs font-semibold text-bark">
                Start Date *
                <input
                  required
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember focus:bg-white"
                />
              </label>

              <label className="block text-xs font-semibold text-bark">
                End Date <span className="font-normal text-moss">(Optional)</span>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember focus:bg-white"
                />
              </label>
            </div>

            {/* The description members read on the drive's page. */}
            <label className="block text-xs font-semibold text-bark">
              Description
              <textarea
                rows={3}
                placeholder="Tell members what the drive is for and why it matters…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark outline-none focus:border-ember focus:bg-white"
              />
            </label>

            {/* Attachment (flyer / poster) */}
            <label className="block text-xs font-semibold text-bark">
              Attachment <span className="font-normal text-moss">(Optional — shown with the drive's announcement and attached to its emails)</span>
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setDriveAttachment(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full cursor-pointer rounded-xl border border-sand-line bg-sand-plate px-3 py-2 text-xs text-bark file:mr-3 file:rounded-lg file:border-0 file:bg-bark file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-white"
              />
            </label>

            {/* Personal invitations: when off, members share only the drive's
                general link; when on, the office can issue personal ones. */}
            <label className="flex items-start gap-2.5 text-xs font-medium text-bark cursor-pointer">
              <input
                type="checkbox"
                checked={form.allow_personal_invitations}
                onChange={(e) => setForm({ ...form, allow_personal_invitations: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 rounded accent-sage"
              />
              <span>
                Allow personal invitations
                <span className="block text-[11px] font-normal text-moss">
                  Members get personal invite links they can share, and the drive tracks who gave through each invite. Leave unchecked to share one general link only.
                </span>
              </span>
            </label>

            {/* No broadcast block: the description above is what the drive
                broadcasts, when the office asks it to. */}

            <div className="flex items-center justify-end gap-3 border-t border-sand-line pt-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={resetAndCloseModal}
                className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss transition hover:border-ember"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full bg-sage px-6 py-2.5 text-xs font-bold text-white transition hover:bg-sage-deep disabled:opacity-60 shadow-sm"
              >
                {isSubmitting ? "Saving..." : editingCampaign ? "Save Changes" : "Create Drive"}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  if (formOnly) {
    return <>{createFormModal}</>;
  }

  return (
    <main className="min-h-screen md:h-full md:min-h-0 bg-white text-bark md:overflow-hidden">
      <div className="flex h-full md:overflow-hidden">

        <div className="flex-1 min-w-0 w-full h-full bg-white p-5 sm:p-8 lg:p-10 border-b border-sand-line space-y-8 overflow-y-auto overscroll-contain custom-hover-scrollbar">
          {/* Phones carry no admin sidebar, so this page gives its own way back. */}
          {isAdminMode && (
            <Link
              href="/administration"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember transition hover:text-bark lg:hidden"
            >
              &larr; Back to administration
            </Link>
          )}

          {/* Top Banner / Header */}
          <div className="border-b border-sand-line pb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Fund Drives {isAdminMode && "& Goal Management"}
                </h1>
                <p className="mt-2 text-sm text-moss">
                  {isAdminMode
                    ? "Drives are opened from a treasury account's Promote action; manage targets, dates and broadcasts here."
                    : "Follow the church's active fund drives, see progress toward each goal, and support a cause."}
                </p>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <input
                  type="text"
                  placeholder="Search by drive or account..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full min-w-0 rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none sm:w-64"
                  aria-label="Search fund drives"
                />
              </div>
            </div>
          </div>

          {/* New Fund Drive Modal — the same hoisted form the treasury desk
              renders in place; see `createFormModal` above. */}
          {createFormModal}

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
                className="max-h-[90vh] w-full max-w-xl overflow-visible rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
              >
                <div className="flex items-center justify-between border-b border-sand-line pb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-ember">
                      Issue Personal Invites
                    </span>
                    <h2 className="text-xl font-bold text-bark">
                      {issuingCampaign.title || issuingCampaign.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    disabled={issuingCards}
                    onClick={() => setIssuingCampaign(null)}
                    className="rounded-full p-2 text-xl leading-none text-moss transition hover:bg-sand hover:text-bark"
                    aria-label="Close modal"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={handleIssueCardsSubmit} className="mt-6 space-y-6">
                  {/* Combobox Recipient Selector */}
                  <div className="relative space-y-2">
                    <label className="block text-xs font-bold text-bark">
                      Select Invite Recipients (Groups &amp; Members) *
                    </label>
                    <p className="text-[11px] text-moss">
                      Groups come first (beginning with &quot;All Members&quot;). You can also select individual church members.
                    </p>

                    {/* Combobox Input Container with selected text boxes/chips */}
                    <div
                      className="min-h-[48px] w-full rounded-2xl border border-sand-mute bg-sand-card p-2 flex flex-wrap items-center gap-1.5 focus-within:border-ember focus-within:bg-white focus-within:ring-2 focus-within:ring-ember/20 transition cursor-text"
                      onClick={() => setIsDropdownOpen(true)}
                    >
                      {/* Group Chips */}
                      {selectedGroups.map((gKey) => {
                        const grpObj = AVAILABLE_GROUPS.find((g) => g.key === gKey);
                        return (
                          <span
                            key={gKey}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-bark text-white px-2.5 py-1 text-xs font-semibold shadow-xs"
                          >
                            <span>{grpObj ? <grpObj.icon size={13} aria-hidden="true" /> : <Users size={13} aria-hidden="true" />}</span>
                            <span>{grpObj?.label || gKey}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedGroups(selectedGroups.filter((k) => k !== gKey));
                              }}
                              className="hover:text-rose-300 font-bold ml-1"
                            >
                              <X size={14} aria-hidden="true" />
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
                            className="inline-flex items-center gap-1.5 rounded-xl bg-sage text-white px-2.5 py-1 text-xs font-semibold shadow-xs"
                          >
                            <User size={13} aria-hidden="true" />
                            <span>{nameStr}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMemberIds(selectedMemberIds.filter((id) => id !== mId));
                              }}
                              className="hover:text-rose-300 font-bold ml-1"
                            >
                              <X size={14} aria-hidden="true" />
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
                        className="flex-1 min-w-[140px] bg-transparent text-xs text-bark outline-none p-1 placeholder:text-moss-faint"
                      />
                    </div>

                    {/* Combobox Dropdown Popover List */}
                    {isDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto rounded-2xl bg-white border border-sand-line shadow-2xl p-2 z-50 divide-y divide-sand-line/60">
                        {/* GROUPS SECTION (FIRST, BEGINNING WITH ALL) */}
                        <div className="pb-2">
                          <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-ember">
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
                                  isSelected ? "bg-bark/10 text-bark" : "hover:bg-sand text-bark"
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <g.icon size={14} aria-hidden="true" />
                                  <span>{g.label}</span>
                                </div>
                                {isSelected && <span className="inline-flex items-center gap-1 text-sage font-bold"><Check size={12} aria-hidden="true" /> Selected</span>}
                              </button>
                            );
                          })}
                        </div>

                        {/* INDIVIDUAL MEMBERS SECTION (SECOND) */}
                        <div className="pt-2">
                          <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-moss">
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
                                    isSelected ? "bg-sage/10 text-bark" : "hover:bg-sand text-bark"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <User size={14} aria-hidden="true" />
                                    <div>
                                      <span className="font-semibold text-bark">{nameStr}</span>
                                      <span className="text-[11px] text-moss ml-2">@{u.username}</span>
                                    </div>
                                  </div>
                                  {isSelected && <span className="inline-flex items-center gap-1 text-sage font-bold"><Check size={12} aria-hidden="true" /> Selected</span>}
                                </button>
                              );
                            })}
                        </div>

                        <div className="pt-2 pb-1 text-right">
                          <button
                            type="button"
                            onClick={() => setIsDropdownOpen(false)}
                            className="text-xs font-bold text-ember hover:underline px-3"
                          >
                            Done selecting
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-3 border-t border-sand-line pt-4">
                    <button
                      type="button"
                      disabled={issuingCards}
                      onClick={() => setIssuingCampaign(null)}
                      className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss transition hover:border-ember"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={issuingCards}
                      className="rounded-full bg-sage px-6 py-2.5 text-xs font-bold text-white transition hover:bg-sage-deep disabled:opacity-60 shadow-sm"
                    >
                      {issuingCards ? "Issuing Invites..." : "Issue Invites Now"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Manual receipt for a drive — the same modal the contributions
              ledger uses, with the drive's account preset as the purpose so
              the money lands in the drive's total. */}
          <AddReceiptModal
            open={Boolean(receiptCampaign)}
            presetPurpose={receiptCampaign ? receiptCampaign.account_name || receiptCampaign.name : undefined}
            onClose={() => setReceiptCampaign(null)}
            onSaved={(deliveryMessage) => {
              showAlert("Receipt Sent", deliveryMessage, "success");
              setReceiptCampaign(null);
              const token = localStorage.getItem("access_token");
              if (token) fetchCampaigns(token);
            }}
          />

          {/* Existing Campaigns List */}
          {!skipList ? (
          <div className="space-y-4">
            {/* No section heading: the table's own columns carry the meaning, so
                the old "All / Active Fund Drives" label only repeated the page
                title above it. */}
            {filteredCampaigns.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-sand-line">
                <p className="text-sm text-moss">
                  {search.trim()
                    ? `No fund drives match "${search.trim()}".`
                    : isAdminMode
                    ? 'No fund drives yet. Open one from a treasury account with its Promote action.'
                    : "There are no active fund drives right now. Please check back soon."}
                </p>
              </div>
            ) : (
              <>
                {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */}
                <RecordList
                  rows={filteredCampaigns}
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
                  tableWrapperClassName="overflow-hidden overflow-x-auto custom-table-scrollbar rounded-3xl bg-white shadow-sm ring-1 ring-sand-line"
                  tableClassName="w-full text-left border-collapse"
                  headClassName=""
                  headRowClassName="border-b border-sand-line bg-sand-card text-[11px] font-bold uppercase tracking-wider text-moss"
                  headCellClassName=""
                  bodyClassName="divide-y divide-sand-line text-xs"
                  cardsClassName="grid gap-4"
                  renderRow={(c) => (
                          <tr key={c.id} className="transition hover:bg-sand-plate">
                            <td className={`px-5 ${rowDrive} align-middle`}>
                              <Link
                                href={`/support/campaigns/${c.id}`}
                                className="group block"
                              >
                                <div className="font-bold text-bark group-hover:text-ember transition-colors text-sm">
                                  {c.title || c.name}
                                </div>
                              </Link>
                            </td>
                            <td className={`px-4 ${rowDrive} align-middle whitespace-nowrap`}>
                              <code className="rounded-md bg-sand px-2 py-1 font-mono text-xs font-bold text-ember border border-sand-line">
                                {c.account_name || c.name}
                              </code>
                            </td>
                            <td className={`px-4 ${rowDrive} align-middle min-w-[180px]`}>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-sage">
                                    KES {Number(c.total_raised).toLocaleString()}
                                  </span>
                                  <span className="text-[11px] text-moss">
                                    {c.percentage_raised}% of {Number(c.target_amount).toLocaleString()}
                                  </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-sand-sheen">
                                  <div
                                    className="h-full rounded-full bg-sage"
                                    style={{ width: `${Math.min(100, c.percentage_raised)}%` }}
                                  />
                                </div>
                                <div className="text-[10px] text-moss">
                                  {c.donor_count || 0} donor{(c.donor_count || 0) === 1 ? "" : "s"}
                                </div>
                              </div>
                            </td>
                            <td className={`px-4 ${rowDrive} align-middle whitespace-nowrap text-xs text-moss`}>
                              <div>
                                <span className="font-medium text-bark">{dayFirst(c.start_date)}</span>
                              </div>
                              <div className="text-[11px]">
                                {c.end_date ? `to ${dayFirst(c.end_date)}` : "(Ongoing)"}
                              </div>
                            </td>
                            {isAdminMode && (
                              <td className={`px-3 ${rowDrive} align-middle text-center whitespace-nowrap`}>
                                <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-xs font-semibold text-bark border border-sand-line">
                                  <IdCard size={13} className="inline" aria-hidden="true" /> {c.assigned_cards_count || 0}
                                </span>
                              </td>
                            )}
                            <td className={`px-3 ${rowDrive} align-middle text-center whitespace-nowrap`}>
                              <span
                                className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  c.is_active
                                    ? "bg-mist-soft text-sage-bright"
                                    : "bg-alert-film text-brick"
                                }`}
                              >
                                {c.is_active ? "Active" : "Ended"}
                              </span>
                            </td>
                            <td className={`px-5 ${rowDrive} align-middle text-right whitespace-nowrap relative`}>
                              <div className="relative inline-block text-left">
                                <button
                                  type="button"
                                  onClick={(e) => toggleActionsMenu(c.id, e)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-bark shadow-sm hover:bg-sand hover:border-ember transition-colors focus:outline-none"
                                >
                                  <span>Actions</span>
                                  <svg className={`w-3.5 h-3.5 transition-transform ${openActionsId === c.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>

                                {openActionsId === c.id && actionsMenuPos && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-30"
                                      onClick={closeActionsMenu}
                                    />
                                    <div
                                      className="fixed z-40 w-48 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-sand-line space-y-1 text-left"
                                      style={
                                        actionsMenuPos.dropUp
                                          ? { right: actionsMenuPos.right, bottom: actionsMenuPos.bottom }
                                          : { right: actionsMenuPos.right, top: actionsMenuPos.top }
                                      }
                                    >
                                      <Link
                                        href={`/support/campaigns/${c.id}`}
                                        onClick={closeActionsMenu}
                                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-bark hover:bg-sand hover:text-ember transition-colors"
                                      >
                                        <CreditCard size={13} className="inline" aria-hidden="true" /> View Card
                                      </Link>

                                      {isAdminMode && canEdit && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              closeActionsMenu();
                                              handleOpenEdit(c);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-bark hover:bg-sand transition-colors"
                                          >
                                            <Pencil size={13} className="inline" aria-hidden="true" /> Edit Drive
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              closeActionsMenu();
                                              setReceiptCampaign(c);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-bark hover:bg-sand transition-colors"
                                          >
                                            <Receipt size={13} className="inline" aria-hidden="true" /> Add Receipt
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              closeActionsMenu();
                                              if (c.allow_personal_invitations) handleOpenIssueCards(c);
                                              else void handleCopyGeneralLink(c);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-ember hover:bg-sand transition-colors"
                                          >
                                            <IdCard size={13} className="inline" aria-hidden="true" /> {c.allow_personal_invitations ? "+ Issue Invites" : "Copy General Link"}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              closeActionsMenu();
                                              handleBroadcastMessage(c.id, c.title || c.name);
                                            }}
                                            disabled={broadcastingId === c.id}
                                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-sage hover:bg-sand disabled:opacity-50 transition-colors"
                                          >
                                            <Megaphone size={13} className="inline" aria-hidden="true" /> {broadcastingId === c.id ? "Sending..." : "Message Members"}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              closeActionsMenu();
                                              handleToggleCampaignActive(c.id, c.is_active);
                                            }}
                                            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                                              c.is_active
                                                ? "text-red-700 hover:bg-red-50"
                                                : "text-emerald-700 hover:bg-emerald-50"
                                            }`}
                                          >
                                            {c.is_active ? <><Pause size={13} className="inline" aria-hidden="true" /> End Fund Drive</> : <><Play size={13} className="inline" aria-hidden="true" /> Reactivate Drive</>}
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
                    /* The whole card opens the drive — no actions menu here.
                       Officers manage drives from the admin console. */
                    <Link
                      key={c.id}
                      href={`/support/campaigns/${c.id}`}
                      className="flex flex-col justify-between rounded-3xl bg-white p-4 shadow-sm ring-1 ring-sand-line transition hover:-translate-y-0.5 hover:ring-ember/50 space-y-3"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.is_active ? "bg-mist-soft text-sage-bright" : "bg-alert-film text-brick"}`}>
                            {c.is_active ? "Active" : "Ended"}
                          </span>
                          {isAdminMode && (
                            <span className="text-xs text-moss">Invites: <strong className="text-bark">{c.assigned_cards_count || 0}</strong></span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-lg font-bold text-bark">{c.title || c.name}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-moss">
                            <code className="font-mono font-bold text-ember">{c.account_name || c.name}</code>
                            <span>&bull;</span>
                            <span>{dayFirst(c.start_date)} {c.end_date ? `to ${dayFirst(c.end_date)}` : "(Ongoing)"}</span>
                          </div>
                        </div>

                        {/* Progress details */}
                        <div>
                          <div className="flex justify-between text-xs font-medium text-bark">
                            <span>KES {Number(c.total_raised).toLocaleString()} raised</span>
                            <span>{c.percentage_raised}% of KES {Number(c.target_amount).toLocaleString()}</span>
                          </div>
                          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-sand-sheen">
                            <div
                              className="h-full rounded-full bg-sage"
                              style={{ width: `${Math.min(100, c.percentage_raised)}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* The one action: open the drive page. */}
                      <span className="flex items-center justify-center rounded-xl bg-bark px-4 py-2.5 text-xs font-semibold text-white transition group-hover:bg-ember">
                        Open Drive
                      </span>
                    </Link>
                  )}
                />
              </>
            )}
          </div>
          ) : (
            <p className="py-16 text-center text-sm font-semibold text-moss">Opening the active fund drive…</p>
          )}
        </div>
      </div>
    </main>
  );
}
