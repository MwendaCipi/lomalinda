"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { AVAILABLE_GROUPS } from "./campaign-management";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Purpose = {
  id: number;
  name: string;
  account_name?: string;
  active?: boolean;
};

type Drive = {
  id: number;
  name: string;
  title?: string;
  account_name?: string;
  target_amount: string | number;
  start_date: string;
  end_date?: string | null;
  is_active?: boolean;
};

type ChurchUser = {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
};

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export function GivingPurposeManager() {
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  // Add Purpose modal
  const [showPurposeForm, setShowPurposeForm] = useState(false);
  const [purposeName, setPurposeName] = useState("");
  const [purposeAccount, setPurposeAccount] = useState("");
  const [savingPurpose, setSavingPurpose] = useState(false);

  // Add Drive modal
  const [showDriveForm, setShowDriveForm] = useState(false);
  const [driveName, setDriveName] = useState("");
  const [driveAccount, setDriveAccount] = useState("");
  const [driveTarget, setDriveTarget] = useState("");
  const [driveStart, setDriveStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [driveEnd, setDriveEnd] = useState("");
  const [savingDrive, setSavingDrive] = useState(false);

  // Pledge card recipients (used by both the Add Drive modal and the Issue Cards modal)
  const [allUsers, setAllUsers] = useState<ChurchUser[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [comboboxSearch, setComboboxSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [issuingDrive, setIssuingDrive] = useState<Drive | null>(null);
  const [issuingCards, setIssuingCards] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Per-row busy states
  const [togglingDriveId, setTogglingDriveId] = useState<number | null>(null);
  const [removingPurposeId, setRemovingPurposeId] = useState<number | null>(null);

  // Row actions dropdown
  const [openActionRow, setOpenActionRow] = useState<string | null>(null);
  const [actionDropUp, setActionDropUp] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Edit Drive / Edit Purpose modals
  const [editDrive, setEditDrive] = useState<Drive | null>(null);
  const [editDriveAccount, setEditDriveAccount] = useState("");
  const [editDriveTarget, setEditDriveTarget] = useState("");
  const [editDriveStart, setEditDriveStart] = useState("");
  const [editDriveEnd, setEditDriveEnd] = useState("");
  const [savingEditDrive, setSavingEditDrive] = useState(false);

  const [editPurpose, setEditPurpose] = useState<Purpose | null>(null);
  const [editPurposeName, setEditPurposeName] = useState("");
  const [editPurposeAccount, setEditPurposeAccount] = useState("");
  const [savingEditPurpose, setSavingEditPurpose] = useState(false);

  useEffect(() => {
    if (!isDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isDropdownOpen]);

  // Close the row actions dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionRow(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleActionRow = (key: string, el: HTMLElement | null) => {
    if (openActionRow === key) {
      setOpenActionRow(null);
      return;
    }
    // Flip upward near the viewport bottom so the popup is not hidden.
    if (el) {
      const rect = el.getBoundingClientRect();
      setActionDropUp(window.innerHeight - rect.bottom < 180);
    }
    setOpenActionRow(key);
  };

  async function loadAll() {
    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const [pRes, cRes] = await Promise.all([
        fetch(`${API_URL}/api/members/giving-purposes/`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/members/campaigns/`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (pRes.ok) setPurposes(await pRes.json());
      if (cRes.ok) setDrives(await cRes.json());
    } finally {
      setLoading(false);
    }
  }

  function fetchUsers() {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch(`${API_URL}/api/members/users/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllUsers(Array.isArray(data) ? data : []))
      .catch(() => setAllUsers([]));
  }

  useEffect(() => {
    loadAll().catch(() =>
      setMessage({ type: "error", text: "Unable to load giving accounts and drives." })
    );
  }, []);

  const memberName = (u?: ChurchUser) =>
    [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.username || "";

  const resetRecipientSelection = () => {
    setSelectedGroups([]);
    setSelectedMemberIds([]);
    setComboboxSearch("");
    setIsDropdownOpen(false);
  };

  // Merge drives into the purposes table: a drive shows its own name + account and From/To dates.
  const rows: Array<
    | { kind: "drive"; drive: Drive; purpose: string; account: string; from: string; to: string }
    | { kind: "purpose"; purpose: Purpose; purposeLabel: string; account: string }
  > = [
    ...drives.map((d) => ({
      kind: "drive" as const,
      drive: d,
      purpose: d.title || d.name,
      account: d.account_name || "",
      from: fmtDate(d.start_date),
      to: fmtDate(d.end_date),
    })),
    ...purposes
      .filter((p) => !drives.some((d) => (d.title || d.name).toLowerCase() === p.name.toLowerCase()))
      .map((p) => ({
        kind: "purpose" as const,
        purpose: p,
        purposeLabel: p.name,
        account: p.account_name || "",
      })),
  ];

  const filteredRows = rows.filter((r) => {
    const label = r.kind === "drive" ? r.purpose : r.purposeLabel;
    const acct = r.account;
    const q = search.toLowerCase();
    return label.toLowerCase().includes(q) || acct.toLowerCase().includes(q);
  });

  // ── Recipient selector (shared by Add Drive + Issue Cards) ────────────────
  const recipientSelector = (
    <div className="relative space-y-2" ref={dropdownRef}>
      <label className="block text-xs font-semibold text-[#26352f]">
        Invite Recipients (optional)
      </label>
      <p className="text-[11px] text-[#617068]">
        Select groups (starting with &quot;All Members&quot;) and/or individual members to receive personal invite links for this drive.
      </p>
      <div
        className="min-h-[48px] w-full cursor-text rounded-2xl border border-[#c9c5bb] bg-[#f7f4ee] p-2 flex flex-wrap items-center gap-1.5 transition focus-within:border-[#b36b3c] focus-within:bg-white"
        onClick={() => setIsDropdownOpen(true)}
      >
        {selectedGroups.map((gKey) => {
          const grp = AVAILABLE_GROUPS.find((g) => g.key === gKey);
          return (
            <span key={gKey} className="inline-flex items-center gap-1.5 rounded-xl bg-[#26352f] px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              <span>{grp?.icon || "👥"}</span>
              <span>{grp?.label || gKey}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedGroups(selectedGroups.filter((k) => k !== gKey));
                }}
                className="ml-1 font-bold hover:text-rose-300"
              >
                ✕
              </button>
            </span>
          );
        })}
        {selectedMemberIds.map((mId) => {
          const u = allUsers.find((x) => x.id === mId);
          return (
            <span key={mId} className="inline-flex items-center gap-1.5 rounded-xl bg-[#5f8067] px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              <span>👤</span>
              <span>{memberName(u) || `Member #${mId}`}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMemberIds(selectedMemberIds.filter((id) => id !== mId));
                }}
                className="ml-1 font-bold hover:text-rose-300"
              >
                ✕
              </button>
            </span>
          );
        })}
        <input
          type="text"
          value={comboboxSearch}
          onChange={(e) => {
            setComboboxSearch(e.target.value);
            setIsDropdownOpen(true);
          }}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder={selectedGroups.length === 0 && selectedMemberIds.length === 0 ? "Click or type to search groups & members..." : "Add recipients..."}
          className="min-w-[140px] flex-1 bg-transparent p-1 text-xs text-[#26352f] outline-none placeholder:text-[#8b9790]"
        />
      </div>

      {isDropdownOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 divide-y divide-[#dfdbd1]/60 overflow-y-auto rounded-2xl border border-[#dfdbd1] bg-white p-2 shadow-2xl">
          <div className="pb-2">
            <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#b36b3c]">
              Church Groups
            </p>
            {AVAILABLE_GROUPS.filter((g) =>
              g.label.toLowerCase().includes(comboboxSearch.toLowerCase())
            ).map((g) => {
              const isSelected = selectedGroups.includes(g.key);
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() =>
                    isSelected
                      ? setSelectedGroups(selectedGroups.filter((k) => k !== g.key))
                      : setSelectedGroups([...selectedGroups, g.key])
                  }
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                    isSelected ? "bg-[#26352f]/10 text-[#26352f]" : "text-[#26352f] hover:bg-[#f7f4ee]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-sm">{g.icon}</span>
                    <span>{g.label}</span>
                  </span>
                  {isSelected && <span className="font-bold text-[#5f8067]">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="pt-2">
            <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#617068]">
              Individual Members ({allUsers.length})
            </p>
            {allUsers
              .filter((u) => {
                const text = `${memberName(u)} ${u.username} ${u.email}`.toLowerCase();
                return text.includes(comboboxSearch.toLowerCase());
              })
              .slice(0, 20)
              .map((u) => {
                const isSelected = selectedMemberIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() =>
                      isSelected
                        ? setSelectedMemberIds(selectedMemberIds.filter((id) => id !== u.id))
                        : setSelectedMemberIds([...selectedMemberIds, u.id])
                    }
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                      isSelected ? "bg-[#5f8067]/10 text-[#26352f]" : "text-[#26352f] hover:bg-[#f7f4ee]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span>👤</span>
                      <span className="font-semibold">{memberName(u)}</span>
                      <span className="ml-1 text-[11px] text-[#617068]">@{u.username}</span>
                    </span>
                    {isSelected && <span className="font-bold text-[#5f8067]">✓</span>}
                  </button>
                );
              })}
          </div>
          <div className="pb-1 pt-2 text-right">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(false)}
              className="px-3 text-xs font-bold text-[#b36b3c] hover:underline"
            >
              Done selecting
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleAddPurpose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!purposeName.trim()) return;
    setSavingPurpose(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");
    try {
      const payload: { name: string; account_name?: string } = { name: purposeName.trim() };
      if (purposeAccount.trim()) payload.account_name = purposeAccount.trim();
      const res = await fetch(`${API_URL}/api/members/giving-purposes/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage({ type: "success", text: `Added giving account "${purposeName.trim()}".` });
        showAlert("Account Added", `Added giving account "${purposeName.trim()}".`, "success");
        setPurposeName("");
        setPurposeAccount("");
        setShowPurposeForm(false);
        await loadAll();
      } else {
        setMessage({ type: "error", text: data.detail || "Unable to add giving account." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error adding giving account." });
    } finally {
      setSavingPurpose(false);
    }
  }

  async function handleAddDrive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!driveName.trim()) return;
    setSavingDrive(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");
    try {
      const payload: Record<string, unknown> = {
        name: driveName.trim(),
        title: driveName.trim(),
        target_amount: driveTarget,
        start_date: driveStart,
      };
      if (driveAccount.trim()) payload.account_name = driveAccount.trim();
      if (driveEnd) payload.end_date = driveEnd;
      const res = await fetch(`${API_URL}/api/members/campaigns/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.detail || Object.values(data).flat().join(" ") || "Unable to create fund drive.";
        setMessage({ type: "error", text: detail });
        return;
      }

      // Issue pledge cards straight away if recipients were selected in the modal.
      let cardsNote = "";
      if (selectedGroups.length > 0 || selectedMemberIds.length > 0) {
        const cardsRes = await fetch(`${API_URL}/api/members/campaigns/${data.id}/issue-cards/`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ target_groups: selectedGroups, member_ids: selectedMemberIds }),
        });
        if (cardsRes.ok) cardsNote = " Personal invites issued to the selected recipients.";
        else cardsNote = " Invites could not be issued — use “Issue Invites” on the drive row to retry.";
      }

      setMessage({ type: "success", text: `Created fund drive "${driveName.trim()}".${cardsNote}` });
      showAlert("Drive Created", `Created fund drive "${driveName.trim()}".${cardsNote}`, "success");
      setDriveName("");
      setDriveAccount("");
      setDriveTarget("");
      setDriveEnd("");
      resetRecipientSelection();
      setShowDriveForm(false);
      await loadAll();
    } catch {
      setMessage({ type: "error", text: "Network error creating fund drive." });
    } finally {
      setSavingDrive(false);
    }
  }

  async function handleIssueCardsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!issuingDrive) return;
    if (selectedGroups.length === 0 && selectedMemberIds.length === 0) {
      showAlert("No Recipients Selected", "Please select at least one group or individual member to issue cards.", "error");
      return;
    }
    setIssuingCards(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/${issuingDrive.id}/issue-cards/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_groups: selectedGroups, member_ids: selectedMemberIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Failed to issue cards.");
      showAlert("Cards Issued", data.detail || `Issued cards successfully for ${issuingDrive.title || issuingDrive.name}.`, "success");
      setIssuingDrive(null);
      resetRecipientSelection();
      await loadAll();
    } catch (err) {
      showAlert("Issuance Failed", err instanceof Error ? err.message : "Error issuing cards.", "error");
    } finally {
      setIssuingCards(false);
    }
  }

  async function handleToggleDrive(drive: Drive) {
    setTogglingDriveId(drive.id);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/campaigns/${drive.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !drive.is_active }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Drive "${drive.title || drive.name}" ${!drive.is_active ? "activated" : "ended"}.` });
        await loadAll();
      } else {
        setMessage({ type: "error", text: "Could not update drive status." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error updating drive." });
    } finally {
      setTogglingDriveId(null);
    }
  }

  async function handleRemovePurpose(purpose: Purpose) {
    setRemovingPurposeId(purpose.id);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/giving-purposes/${purpose.id}/`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Removed giving account "${purpose.name}".` });
        await loadAll();
      } else {
        setMessage({ type: "error", text: "Unable to remove giving account." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error removing account." });
    } finally {
      setRemovingPurposeId(null);
    }
  }

  // ── Edit Drive / Edit Purpose ─────────────────────────────────────────────
  function startEditDrive(d: Drive) {
    setEditDrive(d);
    setEditDriveAccount(d.account_name || "");
    setEditDriveTarget(String(d.target_amount ?? ""));
    setEditDriveStart(d.start_date ? d.start_date.slice(0, 10) : "");
    setEditDriveEnd(d.end_date ? d.end_date.slice(0, 10) : "");
  }

  async function handleSaveEditDrive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editDrive) return;
    setSavingEditDrive(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");
    try {
      const payload: Record<string, unknown> = {
        account_name: editDriveAccount.trim(),
        target_amount: editDriveTarget,
        start_date: editDriveStart,
        end_date: editDriveEnd || null,
      };
      const res = await fetch(`${API_URL}/api/members/campaigns/${editDrive.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.detail || Object.values(data).flat().join(" ") || "Unable to update drive.";
        setMessage({ type: "error", text: detail });
        return;
      }
      setMessage({ type: "success", text: `Updated drive "${editDrive.title || editDrive.name}".` });
      setEditDrive(null);
      await loadAll();
    } catch {
      setMessage({ type: "error", text: "Network error updating drive." });
    } finally {
      setSavingEditDrive(false);
    }
  }

  function startEditPurpose(p: Purpose) {
    setEditPurpose(p);
    setEditPurposeName(p.name);
    setEditPurposeAccount(p.account_name || "");
  }

  async function handleSaveEditPurpose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editPurpose) return;
    setSavingEditPurpose(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/giving-purposes/${editPurpose.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editPurposeName.trim(), account_name: editPurposeAccount.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", text: data.detail || "Unable to update account." });
        return;
      }
      setMessage({ type: "success", text: `Updated giving account "${editPurposeName.trim()}".` });
      setEditPurpose(null);
      await loadAll();
    } catch {
      setMessage({ type: "error", text: "Network error updating account." });
    } finally {
      setSavingEditPurpose(false);
    }
  }

  async function restoreDefaults() {
    setLoadingDefaults(true);
    const token = localStorage.getItem("access_token");
    try {
      const response = await fetch(`${API_URL}/api/members/giving-purposes/restore-defaults/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        await loadAll();
        const msg = data.detail || "Standard default giving purposes loaded.";
        setMessage({ type: "success", text: msg });
        showAlert("Defaults Restored", msg, "success");
      } else {
        throw new Error(data.detail || "Failed to load default purposes.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error loading defaults.";
      setMessage({ type: "error", text: msg });
      showAlert("Error", msg, "error");
    } finally {
      setLoadingDefaults(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfdbd1] px-6 py-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-[#26352f]">Giving Accounts</h2>
          <p className="mt-0.5 text-xs text-[#617068]">
            {purposes.length} purposes · {drives.length} fund drives
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <input
            type="text"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[180px] max-w-sm flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
          />
          <button
            type="button"
            onClick={restoreDefaults}
            disabled={loadingDefaults || loading}
            className="rounded-xl border border-[#b36b3c]/30 bg-[#f7f4ee] px-4 py-2.5 text-xs font-semibold text-[#b36b3c] transition hover:bg-[#b36b3c] hover:text-white disabled:opacity-60"
          >
            {loadingDefaults ? "Loading..." : "Load Standard Defaults"}
          </button>
        </div>
      </div>

      {/* ── Alert message ── */}
      {message && (
        <div
          className={`mx-6 mt-3 shrink-0 rounded-xl p-3 text-xs font-semibold ${
            message.type === "success" ? "bg-[#eef2ed] text-[#3d5148]" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
          <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      {/* ── Scrollable table area ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-3 custom-table-scrollbar">
        {/* Desktop Table */}
        <div className="hidden md:block">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white border-b border-[#dfdbd1]">
              <tr className="text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
                <th className="pb-3 font-bold w-8">#</th>
                <th className="pb-3 font-bold">Account</th>
                <th className="pb-3 font-bold">Account Name</th>
                <th className="pb-3 font-bold">From</th>
                <th className="pb-3 font-bold">To</th>
                <th className="pb-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eeeae2]">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-xs text-[#617068]">Loading accounts and drives...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center">
                    <p className="text-sm font-semibold text-[#26352f]">No giving accounts or fund drives yet</p>
                    <p className="mt-1 text-xs text-[#617068]">
                      Add an account or a drive using the buttons below, or load the standard defaults.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) =>
                  r.kind === "drive" ? (
                    <tr key={`drive-${r.drive.id}`} className="hover:bg-[#f7f4ee]">
                      <td className="py-3 text-[#617068] w-8">{idx + 1}</td>
                      <td className="py-3 font-semibold text-[#26352f]">
                        {r.purpose}
                        {!r.drive.is_active && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Ended</span>
                        )}
                      </td>
                      <td className="py-3 text-[#617068]">
                        {r.account ? (
                          <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">{r.account}</code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-[#617068]">{r.from}</td>
                      <td className="py-3 text-[#617068]">{r.to}</td>
                      <td className="py-3 text-right">
                        <div
                          className="relative inline-block text-left"
                          ref={openActionRow === `drive-${r.drive.id}` ? actionMenuRef : undefined}
                        >
                          <button
                            type="button"
                            onClick={(e) => toggleActionRow(`drive-${r.drive.id}`, e.currentTarget)}
                            className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee]"
                          >
                            ⋯ Actions
                          </button>
                          {openActionRow === `drive-${r.drive.id}` && (
                            <div className={`absolute right-0 z-50 w-44 rounded-xl border border-[#dfdbd1] bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (allUsers.length === 0) fetchUsers();
                                  resetRecipientSelection();
                                  setIssuingDrive(r.drive);
                                  setOpenActionRow(null);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                              >
                                🎴 Issue Invites
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  startEditDrive(r.drive);
                                  setOpenActionRow(null);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                              >
                                ✏️ Edit Drive
                              </button>
                              <div className="my-1 border-t border-[#dfdbd1]" />
                              <button
                                type="button"
                                disabled={togglingDriveId === r.drive.id}
                                onClick={() => {
                                  handleToggleDrive(r.drive);
                                  setOpenActionRow(null);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-[#617068] hover:bg-[#f7f4ee] disabled:opacity-60"
                              >
                                {r.drive.is_active ? "⏸ End Drive" : "▶ Reactivate Drive"}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`purpose-${r.purpose.id}`} className="hover:bg-[#f7f4ee]">
                      <td className="py-3 text-[#617068] w-8">{idx + 1}</td>
                      <td className="py-3 font-semibold text-[#26352f]">{r.purposeLabel}</td>
                      <td className="py-3 text-[#617068]">
                        {r.account ? (
                          <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">{r.account}</code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-[#617068]">—</td>
                      <td className="py-3 text-[#617068]">—</td>
                      <td className="py-3 text-right">
                        <div
                          className="relative inline-block text-left"
                          ref={openActionRow === `purpose-${r.purpose.id}` ? actionMenuRef : undefined}
                        >
                          <button
                            type="button"
                            onClick={(e) => toggleActionRow(`purpose-${r.purpose.id}`, e.currentTarget)}
                            className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee]"
                          >
                            ⋯ Actions
                          </button>
                          {openActionRow === `purpose-${r.purpose.id}` && (
                            <div className={`absolute right-0 z-50 w-44 rounded-xl border border-[#dfdbd1] bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                              <button
                                type="button"
                                onClick={() => {
                                  startEditPurpose(r.purpose);
                                  setOpenActionRow(null);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-[#26352f] hover:bg-[#f7f4ee]"
                              >
                                ✏️ Edit Account
                              </button>
                              <div className="my-1 border-t border-[#dfdbd1]" />
                              <button
                                type="button"
                                disabled={removingPurposeId === r.purpose.id}
                                onClick={() => {
                                  handleRemovePurpose(r.purpose);
                                  setOpenActionRow(null);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-red-600 hover:bg-[#f7f4ee] disabled:opacity-60"
                              >
                                🚫 Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="grid gap-3 md:hidden">
          {loading ? (
            <div className="py-8 text-center text-xs text-[#617068]">Loading accounts and drives...</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#617068]">No giving accounts or fund drives yet.</div>
          ) : (
            filteredRows.map((r) =>
              r.kind === "drive" ? (
                <div key={`drive-${r.drive.id}`} className="space-y-2 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-[#26352f]">{r.purpose}</h3>
                    {!r.drive.is_active && (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Ended</span>
                    )}
                  </div>
                  <p className="text-xs text-[#617068]">Drive: {r.from} → {r.to}</p>
                  {r.account && (
                    <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-[#617068]">{r.account}</code>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-[#dfdbd1]/60 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (allUsers.length === 0) fetchUsers();
                        resetRecipientSelection();
                        setIssuingDrive(r.drive);
                      }}
                      className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee]"
                    >
                      🎴 Issue Invites
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditDrive(r.drive)}
                      className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee]"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      disabled={togglingDriveId === r.drive.id}
                      onClick={() => handleToggleDrive(r.drive)}
                      className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#617068] hover:bg-[#f7f4ee] disabled:opacity-60"
                    >
                      {r.drive.is_active ? "End Drive" : "Activate"}
                    </button>
                  </div>
                </div>
              ) : (
                <div key={`purpose-${r.purpose.id}`} className="space-y-2 rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-[#26352f]">{r.purposeLabel}</h3>
                    {r.account && (
                      <code className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-[#617068]">{r.account}</code>
                    )}
                  </div>
                  <p className="text-xs text-[#617068]">Ongoing account</p>
                  <div className="flex flex-wrap gap-2 border-t border-[#dfdbd1]/60 pt-2">
                    <button
                      type="button"
                      onClick={() => startEditPurpose(r.purpose)}
                      className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee]"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      disabled={removingPurposeId === r.purpose.id}
                      onClick={() => handleRemovePurpose(r.purpose)}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>

      {/* ── Bottom bar: Add buttons ── */}
      <div className="shrink-0 border-t border-[#dfdbd1] bg-white px-6 py-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[#617068]">{filteredRows.length} of {rows.length} shown</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setPurposeName(""); setPurposeAccount(""); setShowPurposeForm(true); }}
            className="rounded-xl bg-[#26352f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#b36b3c]"
          >
            + Add Purpose
          </button>
          <button
            onClick={() => {
              setDriveName(""); setDriveAccount(""); setDriveTarget(""); setDriveEnd("");
              resetRecipientSelection();
              if (allUsers.length === 0) fetchUsers();
              setShowDriveForm(true);
            }}
            className="rounded-xl bg-[#b36b3c] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#96552c]"
          >
            + Add Drive
          </button>
        </div>
      </div>

      {/* ══ Add Purpose Modal ══ */}
      {showPurposeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="add-purpose-title"
            className="w-full max-w-md rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1]">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 id="add-purpose-title" className="text-xl font-bold text-[#26352f]">Add Account</h3>
              <button type="button" onClick={() => setShowPurposeForm(false)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleAddPurpose} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Account Name *</label>
                <input
                  type="text"
                  required
                  value={purposeName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPurposeName(val);
                    if (!purposeAccount || purposeAccount === purposeName.toLowerCase().replace(/[^a-z0-9]/g, "_")) {
                      setPurposeAccount(val.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 30));
                    }
                  }}
                  placeholder="e.g. Camp Meeting Goals"
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Account Name</label>
                <input
                  type="text"
                  value={purposeAccount}
                  onChange={(e) => setPurposeAccount(e.target.value)}
                  placeholder="e.g. tithe, offering"
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-[#617068]">M-Pesa / giving account reference shown on the giving forms.</p>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setShowPurposeForm(false)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPurpose}
                  className="rounded-xl bg-[#26352f] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#b36b3c] disabled:opacity-60"
                >
                  {savingPurpose ? "Adding..." : "Add Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Add Drive Modal (with pledge card recipients) ══ */}
      {showDriveForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="add-drive-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1]">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 id="add-drive-title" className="text-xl font-bold text-[#26352f]">Add Drive</h3>
              <button type="button" onClick={() => setShowDriveForm(false)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleAddDrive} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Drive Name *</label>
                <input
                  type="text"
                  required
                  value={driveName}
                  onChange={(e) => setDriveName(e.target.value)}
                  placeholder="e.g. Church Roof Fund Drive 2026"
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Target Amount (KES) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={driveTarget}
                    onChange={(e) => setDriveTarget(e.target.value)}
                    placeholder="0.00"
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Account Name</label>
                  <input
                    type="text"
                    value={driveAccount}
                    onChange={(e) => setDriveAccount(e.target.value)}
                    placeholder="e.g. ROOF2026"
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">From Date *</label>
                  <input
                    type="date"
                    required
                    value={driveStart}
                    onChange={(e) => setDriveStart(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">To Date</label>
                  <input
                    type="date"
                    value={driveEnd}
                    onChange={(e) => setDriveEnd(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
              </div>

              {recipientSelector}

              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setShowDriveForm(false)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDrive}
                  className="rounded-xl bg-[#b36b3c] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#96552c] disabled:opacity-60"
                >
                  {savingDrive ? "Creating..." : "Add Drive"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Issue Cards Modal (existing drives) ══ */}
      {issuingDrive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="issue-cards-title"
            className="w-full max-w-lg rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1]">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#b36b3c]">Issue Invites</p>
                <h3 id="issue-cards-title" className="text-lg font-bold text-[#26352f]">{issuingDrive.title || issuingDrive.name}</h3>
              </div>
              <button type="button" onClick={() => setIssuingDrive(null)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleIssueCardsSubmit} className="mt-4 space-y-4">
              {recipientSelector}
              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setIssuingDrive(null)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={issuingCards}
                  className="rounded-xl bg-[#5f8067] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
                >
                  {issuingCards ? "Issuing..." : "Issue Invites"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Edit Drive Modal ══ */}
      {editDrive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-drive-title"
            className="w-full max-w-md rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1]">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 id="edit-drive-title" className="text-lg font-bold text-[#26352f]">Edit Drive — {editDrive.title || editDrive.name}</h3>
              <button type="button" onClick={() => setEditDrive(null)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSaveEditDrive} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Account Name</label>
                  <input
                    type="text"
                    value={editDriveAccount}
                    onChange={(e) => setEditDriveAccount(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Target Amount (KES) *</label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={editDriveTarget}
                    onChange={(e) => setEditDriveTarget(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">From Date *</label>
                  <input
                    type="date"
                    required
                    value={editDriveStart}
                    onChange={(e) => setEditDriveStart(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">To Date</label>
                  <input
                    type="date"
                    value={editDriveEnd}
                    onChange={(e) => setEditDriveEnd(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setEditDrive(null)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditDrive}
                  className="rounded-xl bg-[#26352f] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#b36b3c] disabled:opacity-60"
                >
                  {savingEditDrive ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Edit Purpose Modal ══ */}
      {editPurpose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-purpose-title"
            className="w-full max-w-md rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-[#dfdbd1]">
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
              <h3 id="edit-purpose-title" className="text-lg font-bold text-[#26352f]">Edit Account</h3>
              <button type="button" onClick={() => setEditPurpose(null)} className="text-[#617068] hover:text-[#26352f] text-xl leading-none">✕</button>
            </div>
            <form onSubmit={handleSaveEditPurpose} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Account Name *</label>
                <input
                  type="text"
                  required
                  value={editPurposeName}
                  onChange={(e) => setEditPurposeName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Account Name</label>
                <input
                  type="text"
                  value={editPurposeAccount}
                  onChange={(e) => setEditPurposeAccount(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-4">
                <button
                  type="button"
                  onClick={() => setEditPurpose(null)}
                  className="rounded-xl border border-[#c9c5bb] px-5 py-2 text-xs font-semibold text-[#617068] hover:border-[#b36b3c]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEditPurpose}
                  className="rounded-xl bg-[#26352f] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#b36b3c] disabled:opacity-60"
                >
                  {savingEditPurpose ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
