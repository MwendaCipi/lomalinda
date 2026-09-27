"use client";

/**
 * Church Departments — the elder's desk view of the church's departments.
 *
 * One card per department; opening one shows its leadership (leader and
 * assistants with contacts, replaceable through the shared role picker), its
 * roll of members (addable, removable), and its calendar (stored server-side
 * and read by the public ministry pages).
 *
 * Backend: /api/members/departments/ (directory), …/members/ (roll CRUD),
 * …/events/ (calendar CRUD). Role changes ride the existing
 * /api/members/users/<id>/role/ endpoint, so every surface that can change
 * roles shares one set of rules and one notification path.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Landmark,
  Mail,
  Megaphone,
  Phone,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import {
  RolesCombobox,
  roleLabel,
  ROLE_OPTIONS,
  type RoleRegisterRow,
} from "./roles-combobox";
import { AnnouncementManager } from "./announcement-manager";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type DepartmentCode = "amm" | "awm" | "aym" | "apm" | "chaplaincy";

/** Visual identity carried from the department screens this view replaces. */
const DEPARTMENT_STYLES: Record<DepartmentCode, { icon: string; accent: string; chip: string }> = {
  amm: { icon: "⚙️", accent: "text-blue-800", chip: "bg-blue-50 text-blue-800" },
  awm: { icon: "💗", accent: "text-rose-800", chip: "bg-rose-50 text-rose-800" },
  aym: { icon: "🌱", accent: "text-amber-800", chip: "bg-amber-50 text-amber-800" },
  apm: { icon: "♿", accent: "text-teal-800", chip: "bg-teal-50 text-teal-800" },
  chaplaincy: { icon: "🙏", accent: "text-indigo-900", chip: "bg-indigo-50 text-indigo-900" },
};

/** The role that leads each department, matching the backend's DEPARTMENT_LEAD_ROLE. */
const DEPARTMENT_LEAD_ROLE: Record<DepartmentCode, string> = {
  amm: "men_ministry",
  awm: "women_ministry",
  aym: "youth_leader",
  apm: "apm_leader",
  chaplaincy: "chaplaincy",
};

type Holder = {
  id: number;
  name: string;
  username: string;
  email: string;
  phone_number: string;
  photo_url?: string;
  /** The holder's full role set, sent along so the picker edits in place. */
  roles?: string[];
  assistant_roles?: string[];
};

type DepartmentRow = {
  code: DepartmentCode;
  label: string;
  lead_role: string;
  leader: Holder | null;
  assistants: Holder[];
  member_count: number;
  event_count: number;
};

type RollMember = {
  membership_id: number;
  id: number;
  name: string;
  username: string;
  email: string;
  phone_number: string;
  gender: string;
  added_at: string;
};

type DeptEvent = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  lead: string;
  notes: string;
};

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function contactHolder(holder: Holder) {
  const buttons: Record<string, string> = {};
  if (holder.phone_number) buttons[`Call ${holder.phone_number}`] = `tel:${holder.phone_number}`;
  if (holder.email) buttons[`Email ${holder.email}`] = `mailto:${holder.email}`;
  if (Object.keys(buttons).length === 0) {
    showAlert("No contact on record", `${holder.name} has no phone number or email on their account.`, "warning");
    return;
  }
  const result = await showAlert(
    `Contact ${holder.name}`,
    [holder.phone_number && `Phone: ${holder.phone_number}`, holder.email && `Email: ${holder.email}`]
      .filter(Boolean)
      .join("\n"),
    "info",
    {
      ...buttons,
      showCancelButton: true,
      cancelButtonText: "Close",
      confirmButtonText: "Close",
      showConfirmButton: false,
    }
  );
  void result;
}

function HolderCard({
  holder,
  roleCaption,
  onContact,
  onManageRoles,
  actions,
}: {
  holder: Holder;
  roleCaption: string;
  onContact: () => void;
  onManageRoles?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#b36b3c]">{roleCaption}</p>
          <h4 className="mt-0.5 truncate text-sm font-bold text-[#26352f]">{holder.name}</h4>
          <p className="text-[11px] text-[#8b9790]">@{holder.username}</p>
          <div className="mt-1.5 space-y-0.5 text-xs text-[#617068]">
            {holder.phone_number && <p className="truncate">📞 {holder.phone_number}</p>}
            {holder.email && <p className="truncate">✉️ {holder.email}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {actions}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onContact}
              title="Contact"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
            >
              <Phone className="h-3.5 w-3.5" />
            </button>
            {holder.email && (
              <a
                href={`mailto:${holder.email}`}
                title="Email"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
              >
                <Mail className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddMemberModal({
  departmentLabel,
  rollIds,
  onClose,
  onAdd,
}: {
  departmentLabel: string;
  rollIds: Set<number>;
  onClose: () => void;
  onAdd: (member: { id: number; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      // The office users list is the roster the elder's desk already has;
      // search it client-side, matching the other office screens.
      fetch(`${API_URL}/api/members/users/`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          const rows = Array.isArray(data) ? data : [];
          const q = query.trim().toLowerCase();
          const matched = rows
            .filter((u: { first_name?: string; last_name?: string; username?: string; phone_number?: string }) => {
              const hay = `${u.first_name || ""} ${u.last_name || ""} ${u.username || ""} ${u.phone_number || ""}`.toLowerCase();
              return hay.includes(q);
            })
            .slice(0, 12)
            .map((u: { id: number; first_name?: string; last_name?: string; username: string }) => ({
              id: u.id,
              name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username,
              username: u.username,
            }));
          setResults(matched);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add member to ${departmentLabel}`}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1]"
      >
        <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
          <h3 className="text-lg font-bold text-[#26352f]">Add to {departmentLabel}</h3>
          <button type="button" onClick={onClose} className="text-[#617068] hover:text-[#26352f]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#617068]" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name, username or phone…"
            className="w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] py-2 pl-9 pr-3 text-xs focus:border-[#b36b3c] focus:outline-none"
          />
        </div>
        <div className="mt-3 divide-y divide-[#eeeae2]">
          {searching && <p className="py-4 text-center text-xs text-[#617068]">Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-4 text-center text-xs text-[#617068]">No members match that search.</p>
          )}
          {results.map((member) => {
            const onRoll = rollIds.has(member.id);
            return (
              <button
                key={member.id}
                type="button"
                disabled={onRoll}
                onClick={() => onAdd(member)}
                className={`flex w-full items-center justify-between gap-2 py-2.5 text-left text-xs transition ${
                  onRoll ? "cursor-not-allowed opacity-50" : "hover:bg-[#f7f4ee]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[#26352f]">{member.name}</span>
                  <span className="block truncate text-[11px] text-[#8b9790]">@{member.username}</span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-[#b36b3c]">
                  {onRoll ? "On this roll" : "Add"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AddEventModal({
  departmentLabel,
  onClose,
  onAdd,
}: {
  departmentLabel: string;
  onClose: () => void;
  onAdd: (event: { title: string; date: string; time: string; location: string; lead: string; notes: string }) => void;
}) {
  const [form, setForm] = useState({ title: "", date: "", time: "09:00 AM", location: "", lead: "", notes: "" });
  const valid = form.title.trim() && form.date;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add event to ${departmentLabel}`}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1]"
      >
        <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
          <h3 className="text-lg font-bold text-[#26352f]">Add event — {departmentLabel}</h3>
          <button type="button" onClick={onClose} className="text-[#617068] hover:text-[#26352f]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onAdd(form);
          }}
        >
          <div>
            <label className="text-xs font-semibold text-[#26352f]">Event title *</label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#26352f]">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#26352f]">Time</label>
              <input
                type="text"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#26352f]">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#26352f]">Lead</label>
            <input
              type="text"
              value={form.lead}
              onChange={(e) => setForm({ ...form, lead: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#26352f]">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!valid}
            className="w-full rounded-xl bg-[#b36b3c] py-2.5 text-sm font-semibold text-white transition hover:bg-[#96552c] disabled:opacity-50"
          >
            Add event
          </button>
        </form>
      </div>
    </div>
  );
}

function DepartmentDetail({
  department,
  onBack,
  onChanged,
  initialTab = "members",
}: {
  department: DepartmentRow;
  onBack: () => void;
  onChanged: () => void;
  initialTab?: "members" | "calendar";
}) {
  const style = DEPARTMENT_STYLES[department.code];
  const leadRole = DEPARTMENT_LEAD_ROLE[department.code];
  const [roll, setRoll] = useState<RollMember[]>([]);
  const [events, setEvents] = useState<DeptEvent[]>([]);
  const [loadingRoll, setLoadingRoll] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [subTab, setSubTab] = useState<"members" | "calendar">(initialTab);

  const loadRoll = useCallback(() => {
    setLoadingRoll(true);
    fetch(`${API_URL}/api/members/departments/${department.code}/members/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((data) => setRoll(data.members || []))
      .catch(() => setRoll([]))
      .finally(() => setLoadingRoll(false));
  }, [department.code]);

  const loadEvents = useCallback(() => {
    setLoadingEvents(true);
    fetch(`${API_URL}/api/members/departments/${department.code}/events/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  }, [department.code]);

  useEffect(() => {
    loadRoll();
    loadEvents();
  }, [loadRoll, loadEvents]);

  const addMember = async (member: { id: number; name: string }) => {
    const res = await fetch(`${API_URL}/api/members/departments/${department.code}/members/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: member.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showAlert("Added to roll", `${member.name} now serves in ${department.label}.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setShowAddMember(false);
      loadRoll();
      onChanged();
    } else {
      showAlert("Could not add", data.detail || "The member could not be added to the roll.", "error");
    }
  };

  const removeMember = async (member: RollMember) => {
    const result = await showAlert(
      "Remove from roll",
      `Take ${member.name} off the ${department.label} roll? Their membership in the church is not affected.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: "#b36b3c" }
    );
    if (!result.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/departments/${department.code}/members/${member.id}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      showAlert("Removed", `${member.name} is off the roll.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      loadRoll();
      onChanged();
    } else {
      showAlert("Could not remove", "The member could not be removed from the roll.", "error");
    }
  };

  const addEvent = async (event: { title: string; date: string; time: string; location: string; lead: string; notes: string }) => {
    const res = await fetch(`${API_URL}/api/members/departments/${department.code}/events/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showAlert("Event added", `"${event.title}" is on the ${department.label} calendar.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setShowAddEvent(false);
      loadEvents();
      onChanged();
    } else {
      showAlert("Could not add event", data.detail || "The event could not be saved.", "error");
    }
  };

  const removeEvent = async (event: DeptEvent) => {
    const result = await showAlert("Remove event", `Take "${event.title}" off the calendar?`, "question", {
      showCancelButton: true,
      confirmButtonText: "Remove",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#b36b3c",
    });
    if (!result.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/departments/${department.code}/events/${event.id}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      loadEvents();
      onChanged();
    } else {
      showAlert("Could not remove", "The event could not be removed.", "error");
    }
  };

  const changeRoles = async (holder: Holder, roles: string[], assistants: string[]) => {
    const res = await fetch(`${API_URL}/api/members/users/${holder.id}/role/`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ roles, assistant_roles: assistants }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showAlert("Leadership updated", "The department's leadership has been updated.", "success", { toast: true, timer: 4000, showConfirmButton: false });
      onChanged();
    } else {
      showAlert("Could not update roles", data.detail || "The role change was not saved.", "error");
    }
  };

  const rollIds = new Set(roll.map((m) => m.id));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to all departments"
              className="lg:hidden -ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-[#26352f] transition hover:bg-[#f7f4ee] hover:text-[#b36b3c]"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden="true">{style.icon}</span>
                <h2 className={`text-lg font-bold ${style.accent}`}>{department.label}</h2>
              </div>
              <p className="mt-1 text-xs text-[#617068]">
                {roll.length} member{roll.length === 1 ? "" : "s"} on the roll · {events.length} calendar event{events.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setSubTab("members")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                subTab === "members" ? "bg-[#26352f] text-white" : "border border-[#dfdbd1] bg-[#f7f4ee] text-[#617068] hover:text-[#26352f]"
              }`}
            >
              <Users className="mr-1 inline h-3.5 w-3.5" /> Members
            </button>
            <button
              type="button"
              onClick={() => setSubTab("calendar")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                subTab === "calendar" ? "bg-[#26352f] text-white" : "border border-[#dfdbd1] bg-[#f7f4ee] text-[#617068] hover:text-[#26352f]"
              }`}
            >
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Calendar
            </button>
          </div>
        </div>

        {/* Leadership */}
        <div className="mt-4 border-t border-[#dfdbd1] pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#617068]">Leadership</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {department.leader ? (
              <HolderCard
                holder={department.leader}
                roleCaption={roleLabel(leadRole) || "Leader"}
                onContact={() => contactHolder(department.leader!)}
                actions={
                  <RolesCombobox
                    selected={department.leader.roles ?? ["member"]}
                    assistants={department.leader.assistant_roles ?? []}
                    showAssistants
                    onChange={(roles, assistants) => changeRoles(department.leader!, roles, assistants)}
                    memberId={department.leader.id}
                  />
                }
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-[#dfdbd1] p-4 text-xs text-[#617068]">
                No {roleLabel(leadRole) || "leader"} is set. Assign the role from the Members tab in user management.
              </div>
            )}
            {department.assistants.map((assistant) => (
              <HolderCard
                key={assistant.id}
                holder={assistant}
                roleCaption={`Assistant ${roleLabel(leadRole) || "Leader"}`}
                onContact={() => contactHolder(assistant)}
                actions={
                  <RolesCombobox
                    selected={assistant.roles ?? ["member"]}
                    assistants={assistant.assistant_roles ?? []}
                    showAssistants
                    onChange={(roles, assistants) => changeRoles(assistant, roles, assistants)}
                    memberId={assistant.id}
                  />
                }
              />
            ))}
          </div>
        </div>
      </div>

      {/* Members tab */}
      {subTab === "members" && (
        <div className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#26352f]">Department roll</h3>
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#b36b3c] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#96552c]"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add member
            </button>
          </div>
          {loadingRoll ? (
            <p className="py-8 text-center text-xs text-[#617068]">Loading the roll…</p>
          ) : roll.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#617068]">
              Nobody is on this roll yet. Use “Add member” to build the department's list.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[#eeeae2]">
              {roll.map((member) => (
                <div key={member.membership_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#26352f]">{member.name}</p>
                    <p className="truncate text-[11px] text-[#8b9790]">
                      {member.phone_number || member.email || `@${member.username}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(member)}
                    className="shrink-0 rounded-xl border border-[#dfdbd1] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#617068] transition hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendar tab */}
      {subTab === "calendar" && (
        <div className="rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[#26352f]">Department calendar</h3>
            <button
              type="button"
              onClick={() => setShowAddEvent(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#b36b3c] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#96552c]"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Add event
            </button>
          </div>
          {loadingEvents ? (
            <p className="py-8 text-center text-xs text-[#617068]">Loading the calendar…</p>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#617068]">
              Nothing on the calendar yet. Events added here are stored and can be published to the congregation.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-[#eeeae2]">
              {events.map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#26352f]">{event.title}</p>
                    <p className="text-[11px] text-[#617068]">
                      {event.date}
                      {event.time ? ` · ${event.time}` : ""}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    {event.notes && <p className="mt-0.5 text-[11px] italic text-[#8b9790]">{event.notes}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEvent(event)}
                    className="shrink-0 rounded-xl border border-[#dfdbd1] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#617068] transition hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddMember && (
        <AddMemberModal
          departmentLabel={department.label}
          rollIds={rollIds}
          onClose={() => setShowAddMember(false)}
          onAdd={addMember}
        />
      )}
      {showAddEvent && (
        <AddEventModal departmentLabel={department.label} onClose={() => setShowAddEvent(false)} onAdd={addEvent} />
      )}
    </div>
  );
}

export function DepartmentHub() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Which department detail (and which of its tabs) is open; the row's
  // Calendar/Members buttons open the detail directly on that tab.
  const [selected, setSelected] = useState<DepartmentRow | null>(null);
  const [detailTab, setDetailTab] = useState<"members" | "calendar">("members");
  // Which department's budget modal or Communicate flow is open.
  const [budgetDept, setBudgetDept] = useState<DepartmentRow | null>(null);
  const [communicateDept, setCommunicateDept] = useState<DepartmentRow | null>(null);

  const loadDirectory = useCallback(() => {
    fetch(`${API_URL}/api/members/departments/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { departments: [] }))
      .then((data) => {
        setDepartments(data.departments || []);
        setSelected((current) =>
          current ? (data.departments || []).find((d: DepartmentRow) => d.code === current.code) ?? null : null
        );
      })
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-[#617068]">Loading departments…</p>;
  }

  if (selected) {
    return (
      <DepartmentDetail
        department={selected}
        onBack={() => setSelected(null)}
        onChanged={loadDirectory}
        initialTab={detailTab}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-[#26352f]">Departments &amp; Ministries</h2>
        <p className="mt-0.5 text-xs text-[#617068]">
          Each row: the department's leadership, and its calendar, roll, budget and announcements.
        </p>
      </div>
      {departments.map((department) => {
        const style = DEPARTMENT_STYLES[department.code];
        return (
          <div
            key={department.code}
            className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              {/* Identity + the two offices, inline: leader, then assistant. */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">{style.icon}</span>
                  <h3 className={`truncate text-sm font-bold ${style.accent}`}>{department.label}</h3>
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  <p className="text-[#26352f]">
                    <span className="font-semibold text-[#617068]">Leader:</span>{" "}
                    {department.leader ? (
                      <>
                        <span className="font-semibold">{department.leader.name}</span>
                        {department.leader.phone_number && <span className="text-[#617068]"> · {department.leader.phone_number}</span>}
                      </>
                    ) : (
                      <span className="italic text-[#8b9790]">not set</span>
                    )}
                  </p>
                  <p className="text-[#26352f]">
                    <span className="font-semibold text-[#617068]">Assistant:</span>{" "}
                    {department.assistants.length > 0 ? (
                      <>
                        <span className="font-semibold">{department.assistants.map((a) => a.name).join(", ")}</span>
                        {department.assistants[0].phone_number && <span className="text-[#617068]"> · {department.assistants[0].phone_number}</span>}
                      </>
                    ) : (
                      <span className="italic text-[#8b9790]">not set</span>
                    )}
                  </p>
                  <p className="text-[11px] text-[#617068]">
                    {department.member_count} on roll · {department.event_count} event{department.event_count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              {/* Actions: open the full view, or work on one strand directly. */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDetailTab("members");
                    setSelected(department);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#26352f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1a2420]"
                >
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Budget"
                  onClick={() => setBudgetDept(department)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#dfdbd1] bg-white text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
                >
                  <Landmark className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Calendar"
                  onClick={() => {
                    setDetailTab("calendar");
                    setSelected(department);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#dfdbd1] bg-white text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
                >
                  <CalendarDays className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Members"
                  onClick={() => {
                    setDetailTab("members");
                    setSelected(department);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#dfdbd1] bg-white text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
                >
                  <Users className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Communicate — post an announcement to this department"
                  onClick={() => setCommunicateDept(department)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#dfdbd1] bg-white text-[#617068] transition hover:border-[#b36b3c] hover:text-[#b36b3c]"
                >
                  <Megaphone className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {budgetDept && (
        <DepartmentBudgetModal
          department={budgetDept}
          onClose={() => setBudgetDept(null)}
        />
      )}
      {communicateDept && (
        <CommunicateModal
          department={communicateDept}
          onClose={() => setCommunicateDept(null)}
        />
      )}
    </div>
  );
}

/** A budget line as the API returns it. */
type BudgetRow = {
  id: number;
  year: number;
  title: string;
  amount: string | number;
  notes: string;
};

/**
 * One department's budget: planned spending lines, added and removed at the
 * desk. Amounts are planned figures, not treasury transactions — money still
 * moves through the treasurer's desks.
 */
function DepartmentBudgetModal({
  department,
  onClose,
}: {
  department: DepartmentRow;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`${API_URL}/api/members/departments/${department.code}/budgets/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { budgets: [] }))
      .then((data) => setRows(data.budgets || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [department.code]);

  useEffect(() => {
    load();
  }, [load]);

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/members/departments/${department.code}/budgets/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ year: Number(year), title: title.trim(), amount: Number(amount || 0) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Could not save the budget line.");
      setTitle("");
      setAmount("");
      load();
    } catch (error) {
      showAlert("Budget not saved", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeLine(id: number) {
    const answer = await showAlert("Remove this budget line?", `${title || "The line"} will be taken off ${department.label}'s budget.`, "warning", {
      showCancelButton: true,
      confirmButtonText: "Remove",
      cancelButtonText: "Keep",
      confirmButtonColor: "#b91c1c",
    });
    if (!answer.isConfirmed) return;
    try {
      const response = await fetch(`${API_URL}/api/members/departments/${department.code}/budgets/${id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("Could not remove the budget line.");
      load();
    } catch (error) {
      showAlert("Not removed", error instanceof Error ? error.message : "Try again.", "error");
    }
  }

  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${department.label} budget`}
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1]"
      >
        <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
          <div>
            <h3 className="text-lg font-bold text-[#26352f]">{department.label} — Budget</h3>
            <p className="text-[11px] text-[#617068]">Planned spending lines; the treasury still moves the money.</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#617068] hover:text-[#26352f]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={addLine} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold text-[#26352f]">
            What the money is for
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Camp fees subsidy"
              className="mt-1 w-full rounded-xl border border-[#dfdbd1] px-3 py-2 text-xs font-normal focus:border-[#b36b3c] focus:outline-none"
            />
          </label>
          <label className="w-24 text-xs font-semibold text-[#26352f]">
            KES
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-[#dfdbd1] px-3 py-2 text-xs font-normal focus:border-[#b36b3c] focus:outline-none"
            />
          </label>
          <label className="w-24 text-xs font-semibold text-[#26352f]">
            Year
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#dfdbd1] px-3 py-2 text-xs font-normal focus:border-[#b36b3c] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="inline-flex h-9 items-center rounded-xl bg-[#b36b3c] px-4 text-xs font-semibold text-white transition hover:bg-[#96552c] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add line"}
          </button>
        </form>

        {loading ? (
          <p className="py-8 text-center text-xs text-[#617068]">Loading the budget…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#617068]">No budget lines yet for this department.</p>
        ) : (
          <div className="mt-4 divide-y divide-[#eeeae2]">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#26352f]">{row.title}</p>
                  <p className="text-[11px] text-[#617068]">{row.year}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-semibold text-[#26352f]">KES {Number(row.amount || 0).toLocaleString("en-KE")}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(row.id)}
                    className="rounded-xl border border-[#dfdbd1] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#617068] transition hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between py-2.5 text-xs font-bold text-[#26352f]">
              <span>Total planned</span>
              <span>KES {total.toLocaleString("en-KE")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Communicate: the announcement composer, opened already addressed to this
 * department. The audience codes are the department's own; the composer's
 * Post-to list carries the same vocabulary, so the preselection renders
 * correctly and the member can widen it if the message is for more people.
 */
function CommunicateModal({
  department,
  onClose,
}: {
  department: DepartmentRow;
  onClose: () => void;
}) {
  const audienceCode = DEPARTMENT_LEAD_ROLE[department.code];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Post an announcement to ${department.label}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl ring-1 ring-[#dfdbd1]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#dfdbd1] bg-white px-6 py-4">
          <h3 className="text-base font-bold text-[#26352f]">Announcement — {department.label}</h3>
          <button type="button" onClick={onClose} className="text-[#617068] hover:text-[#26352f]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <AnnouncementManager
            presetAudience={audienceCode ? [audienceCode] : []}
            composerOnly
            onDone={onClose}
          />
        </div>
      </div>
    </div>
  );
}
