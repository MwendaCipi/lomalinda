"use client";

/**
 * Church Departments — the desk's view of every department of the church:
 * Eldership, Clerkship, Deaconate and the ministries. Opening one shows its
 * roll — the department's leaders first, wearing the office they hold, then
 * the rest of its people — beside its calendar (stored server-side and read
 * by the public ministry pages).
 *
 * Backend: /api/members/departments/ (directory), …/leadership/
 * (appointments PUT, custom roles), …/members/ (roll CRUD), …/events/
 * (calendar CRUD). Saving appointments reconciles the derived role flags
 * server-side, so permissions and audiences follow without a second save.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import {
  Accessibility,
  Baby,
  CalendarDays,
  Church,
  Clock,
  Handshake,
  Heart,
  HeartPulse,
  Landmark,
  MicVocal,
  PenLine,
  Plus,
  Pencil,
  Search,
  Sun,
  UserPlus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { meetingDay, meetingHours, type WeeklyMeeting } from "@/lib/gathering";

import { invalidateDepartments } from "@/hooks/use-departments";
import { densityCellPad } from "@/lib/table-density";
import { RecordList } from "./record-list";
import { SubNav } from "./sub-nav";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type DepartmentCode = string;

/** Visual identity per known area code; anything the desk adds gets a
    neutral mark so the table stays coherent. */
const DEPARTMENT_STYLES: Record<string, { icon: React.ReactNode; accent: string; chip: string }> = {
  amm: { icon: <Users className="h-4 w-4" />, accent: "text-blue-800", chip: "bg-blue-50 text-blue-800" },
  awm: { icon: <Heart className="h-4 w-4" />, accent: "text-rose-800", chip: "bg-rose-50 text-rose-800" },
  aym: { icon: <Sun className="h-4 w-4" />, accent: "text-amber-800", chip: "bg-amber-50 text-amber-800" },
  children: { icon: <Baby className="h-4 w-4" />, accent: "text-fuchsia-800", chip: "bg-fuchsia-50 text-fuchsia-800" },
  ambassadors: { icon: <Volume2 className="h-4 w-4" />, accent: "text-orange-800", chip: "bg-orange-50 text-orange-800" },
  apm: { icon: <Accessibility className="h-4 w-4" />, accent: "text-teal-800", chip: "bg-teal-50 text-teal-800" },
  chaplaincy: { icon: <Church className="h-4 w-4" />, accent: "text-indigo-900", chip: "bg-indigo-50 text-indigo-900" },
  eldership: { icon: <Landmark className="h-4 w-4" />, accent: "text-violet-800", chip: "bg-violet-50 text-violet-800" },
  clerkship: { icon: <PenLine className="h-4 w-4" />, accent: "text-cyan-800", chip: "bg-cyan-50 text-cyan-800" },
  deaconate: { icon: <Handshake className="h-4 w-4" />, accent: "text-emerald-800", chip: "bg-emerald-50 text-emerald-800" },
  health: { icon: <HeartPulse className="h-4 w-4" />, accent: "text-green-800", chip: "bg-green-50 text-green-800" },
};

/** A row's style, with a shared neutral look for areas the desk added. */
function areaStyle(code: string) {
  return DEPARTMENT_STYLES[code] ?? { icon: <Users className="h-4 w-4" />, accent: "text-bark", chip: "bg-sand text-moss" };
}

/** Long directory names, shortened where a table column would otherwise
    stretch: the badge keeps the area recognisable, the label keeps the row
    narrow. */
const DEPARTMENT_SHORT_LABELS: Record<string, string> = {
  amm: "AMM",
  awm: "AWM",
  aym: "AYM",
  apm: "APM",
  health: "Health",
};

function shortDeptLabel(department: { code: string; label: string }) {
  return DEPARTMENT_SHORT_LABELS[department.code] ?? department.label;
}

/** The seats the church fills by sex: the deaconate's two offices. The
    leadership desk checks the member's recorded sex before staging an
    appointment; the server refuses the seat at save all the same. */
const SEAT_SEX_BY_OFFICE: Record<string, "male" | "female"> = {
  "head deacon": "male",
  "head deaconess": "female",
};

/**
 * The one action a directory row keeps: opening the leadership editor.
 * Budget, calendar and members live inside the department's own desk, and
 * communication goes through announcements.
 */
function EditLeadershipButton({ departmentLabel, onClick }: { departmentLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Edit ${departmentLabel} leadership`}
      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-sand-line bg-white px-2.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
    >
      <Pencil className="h-3.5 w-3.5" />
      Edit Leadership
    </button>
  );
}

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
  /** The office this holder fills, e.g. "Leader" or "Secretary". */
  position?: string;
};

/** One role in a department, as the directory returns it. */
type DepartmentRoleRow = {
  id: number;
  name: string;
  /** The department may appoint assistants of this role beside its leader. */
  has_assistant: boolean;
  is_custom: boolean;
  /** Everyone serving this role, leaders first as the API orders them. */
  holders: { id: number; name: string; username: string; kind: "leader" | "assistant" }[];
  /** The appointments behind those holders — only the unit-scoped read
      carries them, and they are what releasing one names. */
  assignments?: { id: number; member_id: number; kind: "leader" | "assistant" }[];
};

type DepartmentRow = {
  code: DepartmentCode;
  label: string;
  description: string;
  leader: Holder | null;
  assistants: Holder[];
  roles: DepartmentRoleRow[];
  member_count: number;
  event_count: number;
  /** Where the rail files it: an office, a ministry or a department. */
  group?: "office" | "ministry" | "department";
  /** Sub-units, when the department runs as more than one (Children). */
  units?: string[];
};

type RollMember = {
  membership_id: number;
  id: number;
  name: string;
  username: string;
  email: string;
  phone_number: string;
  gender: string;
  unit?: string;
  /** Music's roll is a union: a row with no membership id arrived through
      the choir or a singing group, and ``via`` names which. */
  via?: string;
  added_at: string;
};

/**
 * One row of a department's roll table. The board comes first — the leader,
 * then each assistant, wearing the office they hold — and the roll's own
 * members follow, so opening a department reads its leadership at the top of
 * the table rather than in a card to scroll past.
 */
type RollRow = {
  key: string;
  name: string;
  username: string;
  email: string;
  phone_number: string;
  /** The office held on the department's board, when the row is one of them. */
  office: string | null;
  /** Where a unioned roll row came through ("Choir", a group's name) — the
      music desk's way of showing why someone with no membership row is on
      the roll. */
  via: string | null;
  /** The roll entry behind the row, when there is one to take off the roll. */
  member: RollMember | null;
};

/** One singer on a registered group's list, as the singing-groups read carries. */
type SingingGroupSinger = {
  id: number;
  name: string;
  username: string;
};

/** One registered singing group: the music desk's own register rows. */
type SingingGroupRow = {
  id: number;
  name: string;
  description: string;
  leader_id: number | null;
  leader_name: string;
  is_active: boolean;
  created_at: string;
  member_count: number;
  members: SingingGroupSinger[];
};

type DeptEvent = {
  id: number;
  title: string;
  date: string;
  time: string;
  location: string;
  lead: string;
  notes: string;
  unit?: string;
};

/**
 * A department's desk reads one unit at a time, or the whole of it.
 *
 * ``null`` is the department itself — every unit and the rows tagged to none
 * — which is what the desk opens on, so nothing is hidden until a unit is
 * chosen.
 */
function unitQuery(unit: string | null) {
  return unit ? `?unit=${encodeURIComponent(unit)}` : "";
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function AddMemberModal({
  departmentLabel,
  rollIds,
  onClose,
  onAdd,
  /** When set, the picker fills this instead — one modal serves both the
      roll's Add member and a singing group's add-singer. */
  title,
  takenLabel = "On this roll",
  excludeIds,
}: {
  departmentLabel: string;
  rollIds: Set<number>;
  onClose: () => void;
  onAdd: (member: { id: number; name: string }) => void;
  title?: string;
  takenLabel?: string;
  excludeIds?: Set<number>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const inGroup = excludeIds ?? new Set<number>();

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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 className="text-lg font-bold text-bark">{title ?? `Add to ${departmentLabel}`}</h3>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-moss" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name, username or phone…"
            className="w-full rounded-xl border border-sand-line bg-sand py-2 pl-9 pr-3 text-xs focus:border-ember focus:outline-none"
          />
        </div>
        <div className="mt-3 divide-y divide-sand-soft">
          {searching && <p className="py-4 text-center text-xs text-moss">Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-4 text-center text-xs text-moss">No members match that search.</p>
          )}
          {results.map((member) => {
            const onRoll = rollIds.has(member.id) || inGroup.has(member.id);
            return (
              <button
                key={member.id}
                type="button"
                disabled={onRoll}
                onClick={() => onAdd(member)}
                className={`flex w-full items-center justify-between gap-2 py-2.5 text-left text-xs transition ${
                  onRoll ? "cursor-not-allowed opacity-50" : "hover:bg-sand"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-bark">{member.name}</span>
                  <span className="block truncate text-[11px] text-moss-faint">@{member.username}</span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-ember">
                  {onRoll ? takenLabel : "Add"}
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 className="text-lg font-bold text-bark">Add event — {departmentLabel}</h3>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
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
            <label className="text-xs font-semibold text-bark">Event title *</label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-bark">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-bark">Time</label>
              <input
                type="text"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-bark">Location</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-bark">Lead</label>
            <input
              type="text"
              value={form.lead}
              onChange={(e) => setForm({ ...form, lead: e.target.value })}
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-bark">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!valid}
            className="w-full rounded-xl bg-ember py-2.5 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            Add event
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Register a singing group: a name, an optional leader found by the same
 * member search the roll's modal uses, and an optional line about the group.
 * The desk names the group; the server refuses duplicates case-insensitively.
 */
function RegisterSingingGroupModal({
  onClose,
  onRegister,
}: {
  onClose: () => void;
  onRegister: (group: { name: string; description: string; leader_id: number | null; leader_name: string }) => void;
}) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [leader, setLeader] = useState<{ id: number; name: string } | null>(null);
  const valid = form.name.trim().length >= 3;

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
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
            .slice(0, 8)
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
        aria-label="Register a singing group"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 className="text-lg font-bold text-bark">Register a singing group</h3>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onRegister({
              name: form.name.trim(),
              description: form.description.trim(),
              leader_id: leader?.id ?? null,
              leader_name: leader?.name ?? "",
            });
          }}
        >
          <div>
            <label className="text-xs font-semibold text-bark">Group name *</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Praise Team"
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-bark">Leader (optional)</label>
            {leader ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-sand-line bg-sand px-3 py-2">
                <span className="truncate text-xs font-semibold text-bark">{leader.name}</span>
                <button type="button" onClick={() => setLeader(null)} className="shrink-0 text-[11px] font-semibold text-moss hover:text-red-600">
                  Clear
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search members by name, username or phone…"
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
                />
                <div className="mt-2 divide-y divide-sand-soft">
                  {searching && <p className="py-2 text-center text-xs text-moss">Searching…</p>}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <p className="py-2 text-center text-xs text-moss">No members match that search.</p>
                  )}
                  {results.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        setLeader({ id: member.id, name: member.name });
                        setQuery("");
                        setResults([]);
                      }}
                      className="flex w-full items-center justify-between gap-2 py-2 text-left text-xs transition hover:bg-sand"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-bark">{member.name}</span>
                        <span className="block truncate text-[11px] text-moss-faint">@{member.username}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-ember">Set as leader</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-bark">About the group (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="When they sing, what they lead, how they serve…"
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!valid}
            className="w-full rounded-xl bg-ember py-2.5 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            Register group
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * A member's ask to open a singing group, riding the requests queue: it
 * files the same kind of request the rail's join modal files, so the desk
 * answers both from one place. Approval registers the group and seats the
 * proposer as its first singer; the reply reaches them on their rail.
 */
function RequestToRegisterModal({ departmentCode, onClose }: { departmentCode: string; onClose: () => void }) {
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const valid = groupName.trim().length >= 3;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/members/department-join-requests/${departmentCode}/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "singing_group",
          group_name: groupName.trim(),
          group_description: groupDescription.trim(),
          note: note.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.group_name || data.detail || "Unable to send your proposal.");
      showAlert("Proposal sent", data.detail || "Your proposal is with the music desk's leadership.", "success", { toast: true, timer: 4000, showConfirmButton: false });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send your proposal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Request to register a singing group"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 className="text-lg font-bold text-bark">Request to register a group</h3>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          {error && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
          <div>
            <label className="text-xs font-semibold text-bark">Group name *</label>
            <input
              autoFocus
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Praise Team"
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-bark">About the group (optional)</label>
            <textarea
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              rows={3}
              placeholder="When they sing, what they lead, how they serve…"
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-bark">A word about why (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Tell the leadership why this group would serve the church…"
              className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <p className="text-[11px] leading-5 text-moss">
            Your proposal goes to the music desk's leadership and the elders' desk. If it is approved, the group is
            registered under Music and you are its first singer; the answer reaches your rail.
          </p>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="w-full rounded-xl bg-ember py-2.5 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send proposal"}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * The music register: the singing groups registered under the department,
 * each with its singers. Reading is open to the desk; adding a group, taking
 * one off, or moving a singer in or out follows the server's own guard — the
 * same officer-or-leader keys the roll uses — so the buttons ride the flag
 * the list read carries.
 */
function SingingGroupsPanel({
  departmentCode,
  departmentLabel,
  onChanged,
}: {
  departmentCode: string;
  departmentLabel: string;
  onChanged: () => void;
}) {
  const [groups, setGroups] = useState<SingingGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  // Members without the desk's keys can still ask: the proposal lands in the
  // requests queue and registers the group when the desk approves it.
  const [showPropose, setShowPropose] = useState(false);
  const [search, setSearch] = useState("");
  // Which group's add-singer modal is open.
  const [addingFor, setAddingFor] = useState<SingingGroupRow | null>(null);
  // Which group's singer list is expanded.
  const [openGroup, setOpenGroup] = useState<number | null>(null);

  const loadGroups = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/members/departments/${departmentCode}/singing-groups/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { groups: [], can_manage: false }))
      .then((data) => {
        setGroups(data.groups || []);
        setCanManage(Boolean(data.can_manage));
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, [departmentCode]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const registerGroup = async (group: { name: string; description: string; leader_id: number | null; leader_name: string }) => {
    const res = await fetch(`${API_URL}/api/members/departments/${departmentCode}/singing-groups/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: group.name, description: group.description, leader_id: group.leader_id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showAlert("Group registered", `${group.name} is on the music register.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setShowRegister(false);
      setOpenGroup(data.id ?? null);
      loadGroups();
      onChanged();
    } else {
      showAlert("Could not register", data.name || data.detail || "The group could not be registered.", "error");
    }
  };

  const removeGroup = async (group: SingingGroupRow) => {
    const result = await showAlert(
      "Remove singing group",
      `Take "${group.name}" off the register? Its ${group.member_count} ${group.member_count === 1 ? "singer" : "singers"} will no longer appear on the music roll through it.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/departments/${departmentCode}/singing-groups/${group.id}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      showAlert("Group removed", `"${group.name}" is off the register.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      loadGroups();
      onChanged();
    } else {
      showAlert("Could not remove", "The singing group could not be removed.", "error");
    }
  };

  const addSinger = async (member: { id: number; name: string }) => {
    if (!addingFor) return;
    const res = await fetch(`${API_URL}/api/members/departments/${departmentCode}/singing-groups/${addingFor.id}/members/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: member.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showAlert("Singer added", `${member.name} now sings with ${addingFor.name}.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setAddingFor(null);
      loadGroups();
      onChanged();
    } else {
      showAlert("Could not add", data.detail || "The member could not be added to the group.", "error");
    }
  };

  const removeSinger = async (group: SingingGroupRow, singer: { id: number; name: string }) => {
    const result = await showAlert(
      "Remove from group",
      `Take ${singer.name} out of ${group.name}? Their place on the music roll through this group goes with them.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/departments/${departmentCode}/singing-groups/${group.id}/members/`, {
      method: "DELETE",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: singer.id }),
    });
    if (res.ok) {
      showAlert("Removed", `${singer.name} is out of ${group.name}.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      loadGroups();
      onChanged();
    } else {
      showAlert("Could not remove", "The singer could not be removed from the group.", "error");
    }
  };

  const needle = search.trim().toLowerCase();
  const visibleGroups = needle
    ? groups.filter((g) => `${g.name} ${g.description} ${g.leader_name} ${g.members.map((m) => m.name).join(" ")}`.toLowerCase().includes(needle))
    : groups;

  return (
    <div className="rounded-2xl border border-sand-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-bark">Singing groups</h3>
          <p className="mt-0.5 text-[11px] text-moss">
            The groups registered under {departmentLabel} — each one's singers also count on the department's roll.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowRegister(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
          >
            <MicVocal className="h-3.5 w-3.5" /> Register group
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowPropose(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3.5 py-2 text-xs font-semibold text-moss transition hover:border-ember hover:text-bark"
          >
            <MicVocal className="h-3.5 w-3.5" /> Request to register
          </button>
        )}
      </div>
      {groups.length > 0 && (
        <div className="border-b border-sand-line px-4 py-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups by name, leader or singer…"
            className="w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2 text-xs focus:border-ember focus:outline-none"
          />
        </div>
      )}
      <div className="px-4 py-3">
        {loading ? (
          <p className="py-8 text-center text-xs text-moss">Loading the register…</p>
        ) : visibleGroups.length === 0 ? (
          <p className="py-8 text-center text-xs text-moss">
            {groups.length === 0
              ? canManage
                ? "No singing groups yet. Use “Register group” to start the register."
                : "No singing groups have been registered yet."
              : "No group matches that search."}
          </p>
        ) : (
          <div className="divide-y divide-sand-soft">
            {visibleGroups.map((group) => {
              const open = openGroup === group.id;
              return (
                <div key={group.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenGroup(open ? null : group.id)}
                      aria-expanded={open}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs font-semibold text-bark">
                        {group.name}
                        <span className="ml-2 rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bark">
                          {group.member_count} {group.member_count === 1 ? "singer" : "singers"}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-moss">
                        {group.leader_name ? `Led by ${group.leader_name}` : "No leader set"}
                        {group.description ? ` · ${group.description}` : ""}
                      </p>
                    </button>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAddingFor(group)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                        >
                          <UserPlus className="h-3 w-3" /> Add singer
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGroup(group)}
                          className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  {open && (
                    <div className="mt-2 rounded-xl bg-sand/60 px-3 py-2">
                      {group.members.length === 0 ? (
                        <p className="py-2 text-center text-[11px] text-moss">
                          No singers in this group yet.{canManage ? " Use “Add singer” to build it." : ""}
                        </p>
                      ) : (
                        <ul className="divide-y divide-sand-soft">
                          {group.members.map((singer) => (
                            <li key={singer.id} className="flex items-center justify-between gap-2 py-1.5">
                              <span className="min-w-0 truncate text-xs text-bark">{singer.name}</span>
                              {canManage ? (
                                <button
                                  type="button"
                                  onClick={() => removeSinger(group, singer)}
                                  className="shrink-0 text-[11px] font-semibold text-moss transition hover:text-red-600"
                                >
                                  Remove
                                </button>
                              ) : (
                                <span className="shrink-0 text-[11px] italic text-moss-faint">@{singer.username}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showRegister && <RegisterSingingGroupModal onClose={() => setShowRegister(false)} onRegister={registerGroup} />}
      {showPropose && <RequestToRegisterModal departmentCode={departmentCode} onClose={() => setShowPropose(false)} />}
      {addingFor && (
        <AddMemberModal
          departmentLabel={departmentLabel}
          title={`Add singers to ${addingFor.name}`}
          rollIds={new Set<number>()}
          excludeIds={new Set(addingFor.members.map((m) => m.id))}
          takenLabel="Already in group"
          onClose={() => setAddingFor(null)}
          onAdd={addSinger}
        />
      )}
    </div>
  );
}

/** One appointment staged in the leadership modal: the person the save will
    seat under a position — the Leader's, or one of the two Assistants'. */
type RolePerson = {
  id: number;
  name: string;
  username: string;
  kind: "leader" | "assistant";
  /** The appointment's own id, so releasing one names the row and not the role. */
  assignmentId?: number;
  /** The member's sex as the roster records it, where the office asks. */
  gender?: string;
};

/** One candidate the leadership search returns. */
type SearchResult = { id: number; name: string; username: string; gender?: string };

type RoleDraft = {
  id: number;
  name: string;
  has_assistant: boolean;
  is_custom: boolean;
  people: RolePerson[];
};

/**
 * Edit leadership: appointments staged against a search.
 *
 * The modal opens on the search alone — no roles listed until the desk
 * acts. Finding a member and pressing Set leader / Set elder / Set assistant
 * stages the appointment, which appears under the search as one line naming
 * the person and the position they were given; assistants are uncapped, so
 * every press adds another line. Setting a leader over a seated one asks
 * first, and the save replaces them server-side. One PUT carries the staged
 * lines; the server reconciles the derived role flags so permissions and
 * audiences follow.
 */
function LeadershipEditModal({
  department,
  unit = null,
  onClose,
  onSaved,
}: {
  department: DepartmentRow;
  /** The unit whose leadership is being edited; null is the department's. */
  unit?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<RoleDraft[]>(() =>
    department.roles.map((role) => ({
      id: role.id,
      name: role.name,
      has_assistant: role.has_assistant,
      is_custom: role.is_custom,
      people: role.holders.map((h) => ({ id: h.id, name: h.name, username: h.username, kind: h.kind })),
    }))
  );

  // In a department that runs as units, the board on screen is that unit's —
  // read from the API rather than taken from the directory, which carries the
  // department's board and not each unit's.
  useEffect(() => {
    if (!unit) return;
    let cancelled = false;
    fetch(`${API_URL}/api/members/departments/${department.code}/leadership/${unitQuery(unit)}`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.roles) return;
        setDraft(
          data.roles.map((role: DepartmentRoleRow) => ({
            id: role.id,
            name: role.name,
            has_assistant: role.has_assistant,
            is_custom: role.is_custom,
            people: (role.assignments ?? [])
              .map((assignment): RolePerson | null => {
                const holder = role.holders.find((h) => h.id === assignment.member_id);
                return holder
                  ? { id: holder.id, name: holder.name, username: holder.username, kind: assignment.kind, assignmentId: assignment.id }
                  : null;
              })
              .filter((person): person is RolePerson => person !== null),
          }))
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [department.code, unit]);
  // The two positions the desk appoints by: the Leader role and the role
  // that takes the extra seats — the area's own "Assistant" row, falling
  // back to a custom role when a reshape left none. Eldership sits under
  // its three named offices instead of a generic Leader.
  const leaderRole = draft.find((r) => !r.is_custom && r.name.toLowerCase() === "leader") ?? null;
  const assistantRole =
    draft.find((r) => !r.is_custom && r.name.toLowerCase() === "assistant") ??
    draft.find((r) => r.is_custom) ??
    null;
  // The area's named offices — everything seeded that is not the generic
  // Leader or Assistant row: Eldership's three elders, the deaconate's Head
  // Deacon and Head Deaconess. Their seats are set by name, and (on the
  // deaconate) by the member's sex, the way the church reads the office.
  const officeRoles = draft.filter((r) => !r.is_custom && r.name.toLowerCase() !== "leader" && r.name.toLowerCase() !== "assistant");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  /** The one search the modal runs, debounced. The state writes ride a
      microtask, which is what keeps the effect from cascading the render. */
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      void Promise.resolve().then(() => {
        setResults([]);
        setSearching(false);
      });
      return;
    }
    void Promise.resolve().then(() => {
      setResults([]);
      setSearching(true);
    });
    const timer = window.setTimeout(() => {
      // The office users list is the roster the elder's desk already has.
      fetch(`${API_URL}/api/members/users/`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : []))
        .then((rows) => {
          const q = value.toLowerCase();
          setResults(
            (Array.isArray(rows) ? rows : [])
              .filter((u: { first_name?: string; last_name?: string; username?: string; phone_number?: string }) =>
                `${u.first_name || ""} ${u.last_name || ""} ${u.username || ""} ${u.phone_number || ""}`.toLowerCase().includes(q)
              )
              .slice(0, 8)
              .map((u: { id: number; first_name?: string; last_name?: string; username: string; gender?: string }) => ({
                id: u.id,
                name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username,
                username: u.username,
                gender: u.gender,
              }))
          );
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  /** The staged lines: every appointment the desk has set that the area
      does not already carry. One per press, person first, position under. */
  const staged: { roleId: number; positionLabel: string; person: RolePerson }[] = [];
  for (const role of draft) {
    const before = department.roles.find((r) => r.id === role.id);
    for (const p of role.people) {
      if (!before?.holders.some((h) => h.id === p.id && h.kind === p.kind)) {
        staged.push({ roleId: role.id, positionLabel: p.kind === "leader" ? role.name : `Assistant ${role.name}`, person: p });
      }
    }
  }

  /** Take one staged appointment back off the list before the save. */
  const unstage = (line: { roleId: number; person: RolePerson }) => {
    setDraft((current) => current.map((r) =>
      r.id === line.roleId
        ? { ...r, people: r.people.filter((p) => !(p.id === line.person.id && p.kind === line.person.kind)) }
        : r
    ));
  };

  /** Stage one appointment. A leader seat already filled asks first — the
      staged line will replace that holder at save; assistants are uncapped,
      so every press adds another staged line. */
  const appoint = (role: RoleDraft, seat: "leader" | "assistant", member: SearchResult, clearQuery: () => void) => {
    const go = () => {
      setDraft((current) => current.map((r) => {
        if (r.id !== role.id) return r;
        const people = r.people.filter((p) => !(p.kind === seat && p.id === member.id));
        const person: RolePerson = { id: member.id, name: member.name, username: member.username, kind: seat };
        if (seat === "leader") people.unshift(person);
        else people.push(person);
        return { ...r, people };
      }));
      clearQuery();
    };
    // The deaconate seats its two offices by sex, as the church reads them:
    // the Head Deacon is a man's, the Head Deaconess a woman's. Where the
    // member's profile records a sex, the seat refuses the wrong one before
    // staging; a profile that does not say leaves the desk to know.
    const seatSex = SEAT_SEX_BY_OFFICE[role.name.toLowerCase()];
    if (seat === "leader" && seatSex && member.gender && member.gender.toLowerCase() !== seatSex) {
      showAlert(
        "Not this office's to hold",
        `The ${role.name} is a ${seatSex === "male" ? "man" : "woman"}'s office.`,
        "warning"
      );
      return;
    }
    if (seat === "leader") {
      const before = department.roles.find((r) => r.id === role.id);
      const holder = role.people.find((p) => p.kind === "leader") ?? before?.holders.find((h) => h.kind === "leader");
      if (holder && holder.id !== member.id) {
        showAlert(
          "Seat is taken",
          `${role.name} is ${holder.name}. Appointing ${member.name} replaces them at save.`,
          "warning",
          { confirmButtonText: "Replace", showCancelButton: true, cancelButtonText: "Cancel" }
        ).then((answer) => {
          if (answer.isConfirmed) go();
        });
        return;
      }
    }
    go();
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
  };

  const save = async () => {
    const fresh = draft.flatMap((role) =>
      role.people
        .filter((p) => !department.roles.find((before) => before.id === role.id)?.holders.some((h) => h.id === p.id && h.kind === p.kind))
        .map((p) => ({ role_id: role.id, member_id: p.id, kind: p.kind })),
    );
    if (fresh.length === 0) {
      showAlert("Nothing to save", "Every appointment here is already in place.", "info");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${department.code}/leadership/`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: fresh, unit: unit ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not save the leadership board.");
      showAlert("Leadership updated", `${department.label}'s leadership has been saved.`, "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
      onSaved();
    } catch (error) {
      showAlert("Could not update leadership", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${department.label} leadership`}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-bark">{department.label} — Leadership</h3>
            <p className="text-[11px] text-moss">Search a member, set them into a position, then save. Contacts stay on their accounts.</p>
          </div>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* One search at the top: find a member, then set them into a
            position — the leader's seat, one of the assistants', or an
            elder's office. */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-moss" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a member to appoint…"
              className="w-full rounded-xl border border-sand-line bg-sand py-2 pl-9 pr-3 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div className="mt-2 divide-y divide-sand-soft">
            {results.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <p className="min-w-0 truncate text-xs">
                  <span className="font-semibold text-bark">{member.name}</span>
                  <span className="ml-1.5 text-[11px] text-moss-faint">@{member.username}</span>
                </p>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {leaderRole && (
                    <button
                      type="button"
                      onClick={() => appoint(leaderRole, "leader", member, clearSearch)}
                      className="rounded-xl bg-ember px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ember-deep"
                    >
                      Set leader
                    </button>
                  )}
                  {officeRoles.map((role) => {
                    // A seat the church fills by sex rests inert under a
                    // candidate the office is not for — the profile that
                    // says nothing leaves the button open for the desk to
                    // judge.
                    const seatSex = SEAT_SEX_BY_OFFICE[role.name.toLowerCase()];
                    const offSex = Boolean(seatSex && member.gender && member.gender.toLowerCase() !== seatSex);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        disabled={offSex}
                        title={offSex ? `The ${role.name} is a ${seatSex === "male" ? "man" : "woman"}'s office.` : undefined}
                        onClick={() => appoint(role, "leader", member, clearSearch)}
                        className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
                          offSex
                            ? "cursor-not-allowed border border-sand-line bg-sand text-moss-faint"
                            : "bg-ember text-white hover:bg-ember-deep"
                        }`}
                      >
                        Set {role.name}
                      </button>
                    );
                  })}
                  {/* Eldership seats no assistants — its three offices are
                      the whole board, so no Set assistant there. */}
                  {assistantRole && officeRoles.length === 0 && (
                    <button
                      type="button"
                      onClick={() => appoint(assistantRole, "assistant", member, clearSearch)}
                      className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                    >
                      Set assistant
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="py-2 text-center text-xs text-moss">No members match that search.</p>
            )}
            {searching && <p className="py-2 text-center text-xs text-moss">Searching…</p>}
          </div>
        </div>

        {/* The staged appointments: one line per press — person, then the
            position they were given. Nothing shows until something is set. */}
        <div className="mt-4 space-y-2">
          {staged.map((line) => (
            <div key={`${line.roleId}-${line.person.id}-${line.person.kind}`} className="flex items-center justify-between gap-3 rounded-xl border border-sand-line bg-sand-plate px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-bark">{line.person.name}</p>
                <p className="text-[11px] text-moss">{line.positionLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => unstage(line)}
                title="Remove this appointment"
                className="shrink-0 rounded-full p-1 text-moss transition hover:bg-white hover:text-red-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {staged.length === 0 && (
            <p className="rounded-xl border border-dashed border-sand-line px-3 py-2 text-[11px] italic text-moss-faint">
              No appointments set yet — search above, then set a position.
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-sand-line pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save leadership"}
          </button>
        </div>
      </div>
    </div>
  );
}
/** One weekly meeting as the desk edits it. */
type MeetingDraft = {
  id: number | null;
  title: string;
  weekday: number;
  start_time: string;
  end_time: string;
  place: string;
  online: boolean;
  meeting_link: string;
};

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** A new meeting starts on the day the church is likeliest to add one. */
const BLANK_MEETING: MeetingDraft = {
  id: null,
  title: "",
  weekday: 6,
  start_time: "09:00",
  end_time: "11:00",
  place: "Church sanctuary",
  online: false,
  meeting_link: "",
};

/**
 * The church's week, kept where its keeper works.
 *
 * These are the whole congregation's meetings — midweek vespers, Friday
 * vespers, the Sabbath — not this department's own activities, which is why
 * they sit on Personal Ministries' page rather than in its calendar: that
 * office runs the church's weekly rhythm. Every screen that draws the week
 * reads these rows: the website's gathering card, the calendar, the homepage's
 * weekly calendar and the Live badge on the identity bar.
 *
 * Retiring is offered beside removing because a meeting a church pauses for a
 * season is not a meeting it never held — the row stays, out of the week.
 */
function WeeklyMeetingsPanel() {
  const [meetings, setMeetings] = useState<WeeklyMeeting[] | null>(null);
  const [draft, setDraft] = useState<MeetingDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    // The desk sees the retired ones too, so a meeting put down can be picked
    // back up; every other reader is served only the live week.
    fetch(`${API_URL}/api/members/weekly-meetings/?include_inactive=true`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { meetings: [] }))
      .then((data) => setMeetings(data.meetings || []))
      .catch(() => setMeetings([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft || saving) return;
    if (!draft.title.trim()) {
      setError("Give the meeting a name — \"Midweek Vespers\", \"Sabbath Worship\".");
      return;
    }
    if (draft.end_time <= draft.start_time) {
      setError("A meeting has to end after it starts.");
      return;
    }
    if (draft.online && !draft.meeting_link.trim()) {
      setError("An online meeting needs the link members join by.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        draft.id ? `${API_URL}/api/members/weekly-meetings/${draft.id}/` : `${API_URL}/api/members/weekly-meetings/`,
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            title: draft.title.trim(),
            weekday: draft.weekday,
            start_time: draft.start_time,
            end_time: draft.end_time,
            online: draft.online,
            // A meeting is one or the other: online needs a link, in person
            // needs somewhere to be. The API clears the field it is not using.
            place: draft.online ? "" : draft.place.trim(),
            meeting_link: draft.online ? draft.meeting_link.trim() : "",
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const first = Object.values(data as Record<string, unknown>).flat()[0];
        throw new Error(typeof first === "string" ? first : "Could not save the meeting.");
      }
      setDraft(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the meeting.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(meeting: WeeklyMeeting) {
    try {
      const response = await fetch(`${API_URL}/api/members/weekly-meetings/${meeting.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ is_active: !meeting.is_active }),
      });
      if (!response.ok) throw new Error("Could not change the meeting.");
      load();
    } catch (err) {
      showAlert("Not changed", err instanceof Error ? err.message : "Try again.", "error");
    }
  }

  async function remove(meeting: WeeklyMeeting) {
    const answer = await showAlert(
      "Remove this meeting?",
      `${meeting.title} will come off the church's week everywhere it is shown.`,
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Remove",
        cancelButtonText: "Keep",
        confirmButtonColor: brand.alert,
      }
    );
    if (!answer.isConfirmed) return;
    try {
      const response = await fetch(`${API_URL}/api/members/weekly-meetings/${meeting.id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("Could not remove the meeting.");
      load();
    } catch (err) {
      showAlert("Not removed", err instanceof Error ? err.message : "Try again.", "error");
    }
  }

  const field =
    "mt-1.5 w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm font-normal outline-none focus:border-ember";

  return (
    <div className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-bark">The church&apos;s week</h3>
          <p className="mt-0.5 text-[11px] text-moss">
            The regular meetings every screen draws. A meeting that is online and running right now puts the Live
            badge on the identity bar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft({ ...BLANK_MEETING });
            setError("");
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
        >
          <Plus className="h-3.5 w-3.5" /> Add meeting
        </button>
      </div>

      {draft && (
        <div className="mt-4 rounded-xl border border-sand-line bg-sand-plate p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-bark">
              Meeting
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Midweek Vespers"
                className={field}
              />
            </label>
            <label className="text-xs font-semibold text-bark">
              Day
              <select
                value={draft.weekday}
                onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}
                className={field}
              >
                {WEEKDAY_NAMES.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-bark">
              Starts
              <input
                type="time"
                value={draft.start_time}
                onChange={(e) => setDraft({ ...draft, start_time: e.target.value })}
                className={field}
              />
            </label>
            <label className="text-xs font-semibold text-bark">
              Ends
              <input
                type="time"
                value={draft.end_time}
                onChange={(e) => setDraft({ ...draft, end_time: e.target.value })}
                className={field}
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-bark sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.online}
                onChange={(e) => setDraft({ ...draft, online: e.target.checked })}
                className="h-3.5 w-3.5 accent-ember"
              />
              Meets online, as a web conference
            </label>
            {draft.online ? (
              <label className="text-xs font-semibold text-bark sm:col-span-2">
                Joining link
                <input
                  type="url"
                  value={draft.meeting_link}
                  onChange={(e) => setDraft({ ...draft, meeting_link: e.target.value })}
                  placeholder="https://zoom.us/j/..."
                  className={field}
                />
              </label>
            ) : (
              <label className="text-xs font-semibold text-bark sm:col-span-2">
                Where it meets
                <input
                  value={draft.place}
                  onChange={(e) => setDraft({ ...draft, place: e.target.value })}
                  placeholder="Church sanctuary"
                  className={field}
                />
              </label>
            )}
          </div>
          {error && <p className="mt-2 text-[11px] font-semibold text-alert-shade">{error}</p>}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setError("");
              }}
              className="rounded-xl border border-sand-line bg-white px-3.5 py-2 text-xs font-semibold text-moss transition hover:border-ember hover:text-ember"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
            >
              {saving ? "Saving…" : draft.id ? "Save meeting" : "Add meeting"}
            </button>
          </div>
        </div>
      )}

      {meetings === null ? (
        <p className="py-8 text-center text-xs text-moss">Loading the church&apos;s week…</p>
      ) : meetings.length === 0 ? (
        <p className="py-8 text-center text-xs text-moss">
          No weekly meetings yet. Add the ones the church keeps — midweek vespers, Friday vespers, the Sabbath.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-sand-soft">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${meeting.is_active ? "text-bark" : "text-moss-faint line-through"}`}>
                  {meeting.title}
                  {meeting.online && (
                    <span className="ml-2 rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss-dark">
                      Online
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-moss">
                  {meetingDay(meeting)} · {meetingHours(meeting)}
                  {!meeting.online && meeting.place ? ` · ${meeting.place}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft({
                      id: meeting.id,
                      title: meeting.title,
                      weekday: meeting.weekday,
                      start_time: meeting.start_time,
                      end_time: meeting.end_time,
                      place: meeting.place,
                      online: meeting.online,
                      meeting_link: meeting.meeting_link,
                    });
                    setError("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(meeting)}
                  className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                >
                  {meeting.is_active ? "Retire" : "Restore"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(meeting)}
                  className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DepartmentDetail({
  department,
  onChanged,
  initialTab = "members",
}: {
  department: DepartmentRow;
  onChanged: () => void;
  initialTab?: "members" | "calendar";
}) {
  const units = department.units ?? [];
  // Personal Ministries runs the church's weekly rhythm, so the church's own
  // week is kept on its page — see WeeklyMeetingsPanel.
  const keepsTheWeek = department.code === "personal_ministries";
  // Music is the church's singing, and it sings in groups: the register of
  // singing groups is a music-desk view, not a general department one.
  const isMusic = department.code === "music";
  // Which unit's desk is open; null is the whole department.
  const [unit, setUnit] = useState<string | null>(null);
  // The unit's own leadership, when one is selected: the directory's board is
  // the department's, and a unit has its own leader.
  const [unitBoard, setUnitBoard] = useState<{ leader: Holder | null; assistants: Holder[] } | null>(null);
  const [roll, setRoll] = useState<RollMember[]>([]);
  const [events, setEvents] = useState<DeptEvent[]>([]);
  const [loadingRoll, setLoadingRoll] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showLeadership, setShowLeadership] = useState(false);
  const [subTab, setSubTab] = useState<"members" | "calendar" | "meetings" | "singing_groups">(initialTab);
  // The roll's and the calendar's search boxes.
  const [rollSearch, setRollSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const rowPad = densityCellPad();

  const loadRoll = useCallback(() => {
    setLoadingRoll(true);
    fetch(`${API_URL}/api/members/departments/${department.code}/members/${unitQuery(unit)}`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((data) => setRoll(data.members || []))
      .catch(() => setRoll([]))
      .finally(() => setLoadingRoll(false));
  }, [department.code, unit]);

  const loadEvents = useCallback(() => {
    setLoadingEvents(true);
    fetch(`${API_URL}/api/members/departments/${department.code}/events/${unitQuery(unit)}`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  }, [department.code, unit]);

  useEffect(() => {
    // Every department carries a roll — Eldership, Clerkship and Deaconate
    // included; the church itself is not a department.
    loadRoll();
    loadEvents();
  }, [loadRoll, loadEvents]);

  const loadUnitBoard = useCallback(() => {
    // Deferred by a microtask: the read settles state after the effect's own
    // synchronous body, which is what keeps the render from cascading.
    void Promise.resolve().then(async () => {
      if (!unit) {
        setUnitBoard(null);
        return;
      }
      try {
        const res = await fetch(
          `${API_URL}/api/members/departments/${department.code}/leadership/${unitQuery(unit)}`,
          { headers: authHeaders() }
        );
        const data = res.ok ? await res.json() : null;
        setUnitBoard(data ? { leader: data.leader ?? null, assistants: data.assistants ?? [] } : null);
      } catch {
        setUnitBoard(null);
      }
    });
  }, [department.code, unit]);

  useEffect(() => {
    loadUnitBoard();
  }, [loadUnitBoard]);

  /** The board on show: the unit's when one is selected, the department's otherwise. */
  const board = unitBoard ?? { leader: department.leader, assistants: department.assistants };

  const addMember = async (member: { id: number; name: string }) => {
    const res = await fetch(`${API_URL}/api/members/departments/${department.code}/members/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: member.id, unit: unit ?? "" }),
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
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
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
      body: JSON.stringify({ ...event, unit: unit ?? "" }),
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
      confirmButtonColor: brand.ember,
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

  const rollIds = new Set(roll.map((m) => m.id));

  /**
   * The table's rows: the department's board first — its leader, then each
   * assistant, each wearing the office they hold — and the roll's own members
   * after. Someone who both leads and serves is one row, not two: the board
   * entry wins and keeps their roll row, so they can still be taken off it.
   *
   * This is why the page opens on the table rather than on a card: leadership
   * is the first thing in it, and the roll reads as one list.
   */
  const rollRows: RollRow[] = (() => {
    const keyOf = (person: { username?: string; id?: number }) =>
      (person.username || `id:${person.id ?? ""}`).toLowerCase();
    const seen = new Set<string>();
    const rows: RollRow[] = [];
    const boardPeople: { holder: Holder; office: string }[] = [
      ...(board.leader ? [{ holder: board.leader, office: board.leader.position || "Leader" }] : []),
      ...board.assistants.map((assistant) => ({
        holder: assistant,
        office: assistant.position ? `${assistant.position} · Assistant` : "Assistant",
      })),
    ];
    for (const { holder, office } of boardPeople) {
      const key = keyOf(holder);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        name: holder.name,
        username: holder.username,
        email: holder.email,
        phone_number: holder.phone_number,
        office,
        via: null,
        member: roll.find((m) => keyOf(m) === key) ?? null,
      });
    }
    for (const member of roll) {
      const key = keyOf(member);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        name: member.name,
        username: member.username,
        email: member.email,
        phone_number: member.phone_number,
        office: null,
        via: member.via ?? null,
        member,
      });
    }
    return rows;
  })();

  const rollQuery = rollSearch.trim().toLowerCase();
  const visibleRoll = rollQuery
    ? rollRows.filter((row) => `${row.name} ${row.username} ${row.phone_number} ${row.email}`.toLowerCase().includes(rollQuery))
    : rollRows;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto px-2 py-3 custom-hover-scrollbar md:overflow-hidden md:px-4 lg:px-6">
        {/* A department that runs as units reads one at a time — the roll,
            the calendar and the leadership all follow the toggle, so
            Kindergarten and Pathfinders are two desks under one roof. */}
        {units.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-line pt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-moss">Unit</span>
            <div role="group" aria-label="Department unit" className="flex flex-wrap items-center gap-1.5">
              {[{ value: null as string | null, label: "All" }, ...units.map((name) => ({ value: name as string | null, label: name }))].map((option) => {
                const active = unit === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setUnit(option.value)}
                    aria-pressed={active}
                    className={`inline-flex h-8 items-center rounded-xl px-3 text-xs font-semibold transition ${
                      active ? "bg-bark text-white shadow-sm" : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      {/* The department's own views, on the shared strip: the roll first, the
          calendar beside it. It pins to the top of the page, so the desk can
          switch views without scrolling back up past the table. */}
      <SubNav
        sticky
        label="Department views"
        items={[
          { key: "members", label: "Members", icon: Users },
          // Music sings in more than one voice: the groups registered under
          // it get their own view beside the roll.
          ...(isMusic ? [{ key: "singing_groups", label: "Singing Groups", icon: MicVocal }] : []),
          { key: "calendar", label: "Calendar", icon: CalendarDays },
          // Only the ministry that keeps the church's week carries its panel.
          ...(keepsTheWeek ? [{ key: "meetings", label: "Weekly Meetings", icon: Clock }] : []),
        ]}
        value={subTab}
        onChange={(key) => setSubTab(key as "members" | "calendar" | "meetings" | "singing_groups")}
        className="-mx-2 md:-mx-4 lg:-mx-6"
      />

      {/* Members tab — a contained table: the page holds still, the rows
          scroll, the way the roster and treasury read. The department's board
          leads the table, so opening a department shows who leads it first. */}
      {subTab === "members" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
            <h3 className="text-sm font-bold text-bark">Department roll</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddMember(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add member
              </button>
            </div>
          </div>
          <div className="border-b border-sand-line px-4 py-2.5">
            <input
              type="text"
              value={rollSearch}
              onChange={(e) => setRollSearch(e.target.value)}
              placeholder="Search the roll by name, phone or email…"
              className="w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2 text-xs focus:border-ember focus:outline-none"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto custom-table-scrollbar">
            {loadingRoll ? (
              <p className="py-8 text-center text-xs text-moss">Loading the roll…</p>
            ) : visibleRoll.length === 0 ? (
              <p className="py-8 text-center text-xs text-moss">
                {rollRows.length === 0
                  ? "Nobody is on this roll yet. Use “Add member” to build the department's list."
                  : "No roll member matches that search."}
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-white text-[11px] font-bold uppercase tracking-wider text-ember">
                  <tr className="border-b border-sand-line">
                    <th className="px-4 pb-3 pt-3 font-bold">Name</th>
                    <th className="hidden px-4 pb-3 pt-3 font-bold sm:table-cell">Contact</th>
                    <th className="px-4 pb-3 pt-3 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-soft">
                  {visibleRoll.map((row) => (
                    <tr key={row.key}>
                      <td className={`px-4 ${rowPad} align-middle`}>
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-bark">{row.name}</p>
                          {row.office && (
                            <span className="shrink-0 rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bark">
                              {row.office}
                            </span>
                          )}
                          {/* A unioned row: the person sits on the roll through
                              the choir or a singing group, not a roll entry. */}
                          {row.via && (
                            <span
                              className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss"
                              title={`On the roll through ${row.via} — remove them there`}
                            >
                              via {row.via}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`hidden px-4 ${rowPad} align-middle sm:table-cell`}>
                        <span className="truncate text-moss">{row.phone_number || row.email || `@${row.username}`}</span>
                      </td>
                      <td className={`px-4 ${rowPad} text-right align-middle`}>
                        {row.member ? (
                          <button
                            type="button"
                            onClick={() => row.member && removeMember(row.member)}
                            className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                          >
                            Remove
                          </button>
                        ) : row.via ? (
                          /* Through the choir or a singing group — the roll
                             here has no row to take off. */
                          <span className="text-[11px] italic text-moss-faint">In {row.via}</span>
                        ) : (
                          <span className="text-[11px] italic text-moss-faint">Appointed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* The bottom row: count on the left, Add Member on the right. */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sand-line px-4 py-3">
            <p className="text-xs text-moss">
              {visibleRoll.length} {visibleRoll.length === 1 ? "person" : "people"}
              {rollQuery ? ` of ${rollRows.length}` : ""} shown · {roll.length} on the roll
            </p>
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add Member
            </button>
          </div>
        </div>
      )}

      {/* Calendar tab */}
      {subTab === "calendar" && (
        <div className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-bark">Department calendar</h3>
            <button
              type="button"
              onClick={() => setShowAddEvent(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Add event
            </button>
          </div>
          {events.length > 0 && (
            <input
              type="text"
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
              placeholder="Search the calendar by title, date or location…"
              className="mt-3 w-full rounded-xl border border-sand-line bg-sand px-3.5 py-2 text-xs focus:border-ember focus:outline-none"
            />
          )}
          {loadingEvents ? (
            <p className="py-8 text-center text-xs text-moss">Loading the calendar…</p>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-xs text-moss">
              Nothing on the calendar yet. Events added here are stored and can be published to the congregation.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-sand-soft">
              {events.filter((event) => `${event.title} ${event.date} ${event.location || ""} ${event.notes || ""}`.toLowerCase().includes(eventSearch.trim().toLowerCase())).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-bark">{event.title}</p>
                    <p className="text-[11px] text-moss">
                      {event.date}
                      {event.time ? ` · ${event.time}` : ""}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    {event.notes && <p className="mt-0.5 text-[11px] italic text-moss-faint">{event.notes}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEvent(event)}
                    className="shrink-0 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Singing groups — the music register: groups registered under the
          department, each with the singers who make it up. */}
      {subTab === "singing_groups" && isMusic && (
        <SingingGroupsPanel
          departmentCode={department.code}
          departmentLabel={department.label}
          onChanged={onChanged}
        />
      )}

      {/* Weekly meetings — the church's own week, on the ministry that keeps
          it. Church-wide, so it is its own view rather than a calendar entry. */}
      {subTab === "meetings" && keepsTheWeek && <WeeklyMeetingsPanel />}

      {/* Join requests — the asks raised from the rail, answered here by the
          desk's own leadership or the office. Approving puts the member on
          the roll the same way Add member does. */}
      <JoinRequestsPanel departmentCode={department.code} onChanged={onChanged} />

      {showAddMember && (
        <AddMemberModal
          departmentLabel={department.label}
          rollIds={rollIds}
          onClose={() => setShowAddMember(false)}
          onAdd={addMember}
        />
      )}
      {showLeadership && (
        <LeadershipEditModal
          department={department}
          unit={unit}
          onClose={() => setShowLeadership(false)}
          onSaved={() => {
            setShowLeadership(false);
            loadUnitBoard();
            onChanged();
          }}
        />
      )}
      {showAddEvent && (
        <AddEventModal departmentLabel={department.label} onClose={() => setShowAddEvent(false)} onAdd={addEvent} />
      )}
    </div>
  );
}

export function DepartmentHub({ initialDept = null }: { initialDept?: string | null } = {}) {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Which department detail (and which of its tabs) is open; the row's
  // Calendar/Members buttons open the detail directly on that tab.
  const [selected, setSelected] = useState<DepartmentRow | null>(null);
  const [detailTab, setDetailTab] = useState<"members" | "calendar">("members");
  // Which department's budget modal is open.
  const [budgetDept, setBudgetDept] = useState<DepartmentRow | null>(null);
  // Which department's leadership modal is open.
  const [leadershipDept, setLeadershipDept] = useState<DepartmentRow | null>(null);
  // The Add area modal.
  const [showAddArea, setShowAddArea] = useState(false);
  // The directory search: narrows by area or by any name seated at it.
  const [directorySearch, setDirectorySearch] = useState("");
  const directoryNeedle = directorySearch.trim().toLowerCase();
  const visibleDepartments = directoryNeedle
    ? departments.filter((d) =>
        `${shortDeptLabel(d)} ${d.label} ${d.leader?.name ?? ""} ${d.assistants.map((a) => a.name).join(" ")}`
          .toLowerCase()
          .includes(directoryNeedle)
      )
    : departments;

  const loadDirectory = useCallback(() => {
    fetch(`${API_URL}/api/members/departments/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { departments: [] }))
      .then((data) => {
        setDepartments(data.departments || []);
        setSelected((current) => {
          // A rail row names the department it opens (`?dept=children`), so the
          // hub lands on it rather than on the table it is listed in. The URL
          // wins over whatever is on screen — clicking a different area's row
          // while one is open must move the desk, not keep the old one.
          const code = initialDept ?? current?.code;
          if (!code) return null;
          return (data.departments || []).find((d: DepartmentRow) => d.code === code) ?? null;
        });
      })
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  }, [initialDept]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-moss">Loading departments…</p>;
  }

  if (selected) {
    return (
      <DepartmentDetail
        department={selected}
        onChanged={loadDirectory}
        initialTab={detailTab}
      />
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto px-2 py-3 custom-hover-scrollbar md:overflow-hidden md:px-4 lg:px-6">
      {/* The strip above the card names the place on a wide screen, so the
          heading here is the phone's telling only. */}
      <div className="shrink-0 md:hidden">
        <h2 className="text-lg font-bold text-bark">Leadership</h2>
        <p className="mt-0.5 text-xs text-moss">
          Every leadership area — the church's offices and each department — with its leader and assistants.
        </p>
      </div>

      {/* One search above the directory: find an area or anyone seated in
          one, at either width. */}
      <div className="shrink-0">
        <input
          type="text"
          value={directorySearch}
          onChange={(e) => setDirectorySearch(e.target.value)}
          placeholder="Search areas or the people leading them…"
          aria-label="Search the leadership directory"
          className="w-full rounded-xl border border-sand-line bg-white px-4 py-2.5 text-xs shadow-sm focus:border-ember focus:outline-none"
        />
      </div>

      {/* One table, one row per department — the directory a desk scans, not
          a stack of cards. On phones the same rows are cards. */}
      <div className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto custom-table-scrollbar">
        {/* Fixed columns: each office gets the same width, so a long name
            never stretches its neighbour — the text truncates instead. */}
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-sand-line bg-sand-veil text-[10px] uppercase tracking-wider text-moss">
              <th className="px-3 py-3 font-bold">Department</th>
              <th className="px-3 py-3 font-bold">Leader</th>
              <th className="px-3 py-3 font-bold">First Assistant</th>
              <th className="px-3 py-3 font-bold">Second Assistant</th>
              <th className="w-[9%] px-3 py-3 text-center font-bold">Roll</th>
              <th className="w-[16%] px-3 py-3 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleDepartments.map((department) => {
              const style = areaStyle(department.code);
              const [firstAssistant, secondAssistant] = department.assistants;
              return (
                <tr key={department.code} className="border-b border-sand-soft last:border-0 hover:bg-sand/60">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.chip}`} aria-hidden="true">
                        {style.icon}
                      </span>
                      <span className={`truncate text-sm font-bold ${style.accent}`} title={department.label}>
                        {shortDeptLabel(department)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {department.leader ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-bark" title={department.leader.name}>{department.leader.name}</p>
                        <p className="truncate text-[11px] text-moss">{department.leader.phone_number || department.leader.email || ""}</p>
                      </div>
                    ) : (
                      <span className="text-xs italic text-moss-faint">not set</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {firstAssistant ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-bark" title={firstAssistant.name}>{firstAssistant.name}</p>
                        <p className="truncate text-[11px] text-moss">{firstAssistant.phone_number || firstAssistant.email || ""}</p>
                      </div>
                    ) : (
                      <span className="text-xs italic text-moss-faint">not set</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {secondAssistant ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-bark" title={secondAssistant.name}>{secondAssistant.name}</p>
                        <p className="truncate text-[11px] text-moss">{secondAssistant.phone_number || secondAssistant.email || ""}</p>
                      </div>
                    ) : (
                      <span className="text-xs italic text-moss-faint">not set</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-moss">
                    {department.member_count}
                    <span className="block text-[10px] text-moss-faint">{department.event_count} event{department.event_count === 1 ? "" : "s"}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <EditLeadershipButton
                      departmentLabel={department.label}
                      onClick={() => setLeadershipDept(department)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {/* The bottom row: the count on the left, Add Department on the
            right — communication goes through announcements. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sand-line px-4 py-3">
          <p className="text-xs text-moss">
            {visibleDepartments.length} of {departments.length} leadership area{departments.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={() => setShowAddArea(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:bg-sand/60"
          >
            <Plus className="h-3.5 w-3.5" /> Add Department
          </button>
        </div>
      </div>

      {/* Phones: the same directory as cards. */}
      <div className="space-y-3 md:hidden">
        {visibleDepartments.map((department) => {
          const style = areaStyle(department.code);
          return (
            <div key={department.code} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.chip}`} aria-hidden="true">
                    {style.icon}
                  </span>
                  <h3 className={`truncate text-sm font-bold ${style.accent}`}>{department.label}</h3>
                </div>
                <EditLeadershipButton
                  departmentLabel={department.label}
                  onClick={() => setLeadershipDept(department)}
                />
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <p className="text-bark">
                  <span className="font-semibold text-moss">Leader:</span>{" "}
                  {department.leader ? (
                    <span className="font-semibold">{department.leader.name}</span>
                  ) : (
                    <span className="italic text-moss-faint">not set</span>
                  )}
                </p>
                <p className="text-bark">
                  <span className="font-semibold text-moss">Assistants:</span>{" "}
                  {department.assistants.length > 0 ? (
                    <span className="font-semibold">{department.assistants.map((a) => `${a.name}${a.position ? ` (${a.position})` : ""}`).join(", ")}</span>
                  ) : (
                    <span className="italic text-moss-faint">none</span>
                  )}
                </p>
                <p className="text-[11px] text-moss">
                  {department.member_count} on roll · {department.event_count} event{department.event_count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          );
        })}
        {/* Phones get the same Add Department action beneath the cards. */}
        <button
          type="button"
          onClick={() => setShowAddArea(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
        >
          <Plus className="h-3.5 w-3.5" /> Add Department
        </button>
      </div>

      {budgetDept && (
        <DepartmentBudgetModal
          department={budgetDept}
          onClose={() => setBudgetDept(null)}
        />
      )}
      {showAddArea && (
        <AddAreaModal
          onClose={() => setShowAddArea(false)}
          onCreated={loadDirectory}
        />
      )}
      {leadershipDept && (
        <LeadershipEditModal
          department={leadershipDept}
          unit={null}
          onClose={() => setLeadershipDept(null)}
          onSaved={() => {
            setLeadershipDept(null);
            loadDirectory();
          }}
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
      confirmButtonColor: brand.alert,
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
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-bark">{department.label} — Budget</h3>
            <p className="text-[11px] text-moss">Planned spending lines; the treasury still moves the money.</p>
          </div>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={addLine} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold text-bark">
            What the money is for
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Camp fees subsidy"
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
          </label>
          <label className="w-24 text-xs font-semibold text-bark">
            KES
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
          </label>
          <label className="w-24 text-xs font-semibold text-bark">
            Year
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="inline-flex h-9 items-center rounded-xl bg-ember px-4 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add line"}
          </button>
        </form>

        {loading ? (
          <p className="py-8 text-center text-xs text-moss">Loading the budget…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-moss">No budget lines yet for this department.</p>
        ) : (
          <div className="mt-4 divide-y divide-sand-soft">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-bark">{row.title}</p>
                  <p className="text-[11px] text-moss">{row.year}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-semibold text-bark">KES {Number(row.amount || 0).toLocaleString("en-KE")}</span>
                  <button
                    type="button"
                    onClick={() => removeLine(row.id)}
                    className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between py-2.5 text-xs font-bold text-bark">
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
 * Add Department: a new department of the church, created with the Leader
 * (assistant-capable), Secretary and Treasurer roles, fillable the moment
 * it exists. Its audience code (`dept_<code>`) rides the same announcement
 * machinery as the original departments.
 */
function AddAreaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // The rail files it under one of two lists, so the desk says which; the
  // third answer (a church office) only ever applies to the seeded bodies.
  const [group, setGroup] = useState<"ministry" | "department">("department");
  const [units, setUnits] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/create/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), group, units: units.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.name || data.detail || "Could not create the department.");
      // The rail reads the church's records, so a ministry added here should
      // appear on it without a reload.
      invalidateDepartments();
      showAlert(
        "Department created",
        `${data.name} now has its own roles. Open Edit leadership to appoint its officers.`,
        "success",
        { toast: true, timer: 4500, showConfirmButton: false }
      );
      onCreated();
      onClose();
    } catch (error) {
      showAlert("Could not create department", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a department"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-bark">Add Department</h3>
            <p className="text-[11px] text-moss">A new department with its own roles, roll and calendar.</p>
          </div>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-bark">
            Name *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pathfinders, Music Department"
              required
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
          </label>
          <label className="block text-xs font-semibold text-bark">
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line about what this department does (optional)"
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
          </label>
          <label className="block text-xs font-semibold text-bark">
            Listed under
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as "ministry" | "department")}
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            >
              <option value="department">Departments</option>
              <option value="ministry">Ministries</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-bark">
            Units
            <input
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="e.g. Kindergarten, Pathfinders (optional)"
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
            <span className="mt-1 block text-[11px] font-normal text-moss">
              Only for a department that runs as more than one group: its desk then reads one at a time.
            </span>
          </label>
          <p className="text-[11px] text-moss">
            Created with Leader, Secretary and Treasurer roles — appoint their holders when editing leadership.
          </p>
          <div className="flex items-center justify-end gap-2 border-t border-sand-line pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-sand-line bg-white px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create department"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * The join requests one department has received, with the desk's answer:
 * approve (onto the roll) or decline, with a reply the member reads on their
 * own rail. Visible to whoever can open this desk — the leadership and the
 * office — and the API decides the same way on the way out.
 */
function JoinRequestsPanel({ departmentCode, onChanged }: { departmentCode: string; onChanged: () => void }) {
  const [requests, setRequests] = useState<
    { id: number; member_name: string; note: string; status: string; created_at: string }[]
  >([]);
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch(`${API_URL}/api/members/department-join-requests/review/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data) =>
        setRequests(
          (data?.requests ?? []).filter(
            (row: { department: string }) => row.department === departmentCode,
          ),
        ),
      )
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [departmentCode]);

  useEffect(() => {
    load();
  }, [load]);

  async function answer(id: number, status: "approved" | "rejected") {
    setBusyId(id);
    try {
      const res = await fetch(`${API_URL}/api/members/department-join-requests/${id}/`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, reply: replies[id] ?? "" }),
      });
      if (res.ok) {
        showAlert(
          status === "approved" ? "Approved" : "Declined",
          status === "approved"
            ? "The member is on the roll and has been told."
            : "The member has been told.",
          "success",
        );
        load();
        onChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert("Not answered", data.detail || "Could not save the answer.", "error");
      }
    } catch {
      showAlert("Error", "Could not reach the server.", "error");
    } finally {
      setBusyId(null);
    }
  }

  const open = requests.filter((row) => row.status === "pending");
  const answered = requests.filter((row) => row.status !== "pending");

  if (loading) {
    return <p className="text-center text-xs text-moss">Loading join requests…</p>;
  }
  if (requests.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-bark">Join requests</h3>
      <p className="mt-0.5 text-xs text-moss">
        Members asking to join {departmentCode.replace("_", " ")} — approve to add them to the roll, with a reply they will read.
      </p>
      {open.length > 0 && (
        <div className="mt-4 space-y-3">
          {open.map((row) => (
            <div key={row.id} className="rounded-2xl border border-ember/30 bg-sand-linen p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-bark">{row.member_name}</p>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                  waiting
                </span>
              </div>
              {row.note && <p className="mt-1.5 text-xs italic text-moss">&ldquo;{row.note}&rdquo;</p>}
              <input
                type="text"
                value={replies[row.id] ?? ""}
                onChange={(e) => setReplies((current) => ({ ...current, [row.id]: e.target.value }))}
                placeholder="Reply to the member (optional)"
                className="mt-3 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => answer(row.id, "approved")}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => answer(row.id, "rejected")}
                  className="rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {answered.length > 0 && (
        <div className="mt-4 space-y-2">
          {answered.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sand px-4 py-2.5">
              <p className="text-xs font-semibold text-bark">{row.member_name}</p>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${
                  row.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                }`}
              >
                {row.status === "approved" ? "approved" : "declined"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
