"use client";

/**
 * Church Departments — the desk's view of every leadership area: The
 * Church, the office bodies (Eldership, Clerkship, Deaconate) and each
 * department. Opening one shows its leadership — named offices with a
 * holder each, no assistant flags — plus, for departments, its roll and
 * calendar (stored server-side and read by the public ministry pages).
 *
 * Backend: /api/members/departments/ (directory), …/leadership/ (offices
 * PUT/POST/DELETE), …/members/ (roll CRUD), …/events/ (calendar CRUD).
 * Filling an office reconciles the derived role flags server-side, so
 * permissions and audiences follow without a second save.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import {
  Accessibility,
  ArrowLeft,
  Baby,
  CalendarDays,
  ChevronDown,
  Church,
  Handshake,
  Heart,
  Landmark,
  Mail,
  PenLine,
  Plus,
  Megaphone,
  Pencil,
  Phone,
  Search,
  Sun,
  UserPlus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";

import { DensityToggle, densityCellPad, useTableDensity } from "@/lib/table-density";
import { AnnouncementManager } from "./announcement-manager";
import { RecordList } from "./record-list";

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
  church: { icon: <Church className="h-4 w-4" />, accent: "text-stone-800", chip: "bg-stone-100 text-stone-800" },
  eldership: { icon: <Landmark className="h-4 w-4" />, accent: "text-violet-800", chip: "bg-violet-50 text-violet-800" },
  clerkship: { icon: <PenLine className="h-4 w-4" />, accent: "text-cyan-800", chip: "bg-cyan-50 text-cyan-800" },
  deaconate: { icon: <Handshake className="h-4 w-4" />, accent: "text-emerald-800", chip: "bg-emerald-50 text-emerald-800" },
};

/** A row's style, with a shared neutral look for areas the desk added. */
function areaStyle(code: string) {
  return DEPARTMENT_STYLES[code] ?? { icon: <Users className="h-4 w-4" />, accent: "text-bark", chip: "bg-sand text-moss" };
}

/**
 * The row's actions behind one ⋯ button — Edit leadership, Budget, Calendar,
 * Members, Communicate — a popover rather than a strip of icons. Closes on an
 * outside click, and unmounts cleanly when the row re-renders.
 */
function DepartmentActionsMenu({
  department,
  onEditLeadership,
  onCalendar,
  onMembers,
  onBudget,
  onCommunicate,
}: {
  department: DepartmentRow;
  onEditLeadership: () => void;
  onCalendar: () => void;
  onMembers: () => void;
  onBudget: () => void;
  onCommunicate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const items: { label: string; icon: React.ReactNode; run: () => void }[] = [
    { label: "Edit leadership", icon: <Pencil className="h-4 w-4" />, run: onEditLeadership },
    { label: "Budget", icon: <Landmark className="h-4 w-4" />, run: onBudget },
    { label: "Calendar", icon: <CalendarDays className="h-4 w-4" />, run: onCalendar },
    // Only department areas carry a roll to open.
    ...(department.kind === "department" ? [{ label: "Members", icon: <Users className="h-4 w-4" />, run: onMembers }] : []),
    // Announcements address departments (their roll plus leadership); a
    // church-office body has no roll to address.
    ...(department.kind === "department" ? [{ label: "Communicate", icon: <Megaphone className="h-4 w-4" />, run: onCommunicate }] : []),
  ];

  return (
    <div className="relative inline-block" ref={wrapRef} data-dept-menu={department.code}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${department.label}`}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-8 items-center gap-1 rounded-xl border border-sand-line bg-white px-2.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
      >
        Actions
        <ChevronDown className={`h-3.5 w-3.5 text-moss transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-2xl border border-sand-line bg-white p-1.5 shadow-xl ring-1 ring-black/5"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
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

/** One office in an area, as the directory returns it. */
type AreaPosition = {
  id: number;
  title: string;
  is_custom: boolean;
  holder: { id: number; name: string; username: string } | null;
};

type DepartmentRow = {
  code: DepartmentCode;
  label: string;
  /** "church" (The Church), "office" (Eldership, Deaconate…) or
      "department" (a ministry with its own roll). */
  kind: "church" | "office" | "department";
  description: string;
  leader: Holder | null;
  assistants: Holder[];
  positions: AreaPosition[];
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
    <div className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ember">{roleCaption}</p>
          <h4 className="mt-0.5 truncate text-sm font-bold text-bark">{holder.name}</h4>
          <p className="text-[11px] text-moss-faint">@{holder.username}</p>
          <div className="mt-1.5 space-y-0.5 text-xs text-moss">
            {holder.phone_number && <p className="truncate">{holder.phone_number}</p>}
            {holder.email && <p className="truncate">{holder.email}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {actions}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onContact}
              title="Contact"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-sand-line bg-sand text-moss transition hover:border-ember hover:text-ember"
            >
              <Phone className="h-3.5 w-3.5" />
            </button>
            {holder.email && (
              <a
                href={`mailto:${holder.email}`}
                title="Email"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-sand-line bg-sand text-moss transition hover:border-ember hover:text-ember"
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 className="text-lg font-bold text-bark">Add to {departmentLabel}</h3>
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
            const onRoll = rollIds.has(member.id);
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

/** Someone staged in the leadership modal: how they hold the department's
    lead role, plus the role sets the save needs. */
/** One office staged for the save: who holds it now, and who should. */
type OfficeDraft = {
  id: number;
  title: string;
  is_custom: boolean;
  holder: { id: number; name: string; username: string } | null;
};

/**
 * Edit leadership: fill the area's named offices in one modal.
 *
 * Each office row holds exactly one person, chosen from the roster — the
 * office someone sits in IS their role here, so there is no assistant
 * checkbox to remember. Appointing into a filled office replaces its
 * holder (with a word of warning), clearing an office releases them, and
 * the desk can add or remove offices beyond the seeded ones. One PUT saves
 * the whole board; the server reconciles the derived role flags so
 * permissions and announcement audiences follow.
 */
function LeadershipEditModal({
  department,
  onClose,
  onSaved,
}: {
  department: DepartmentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<OfficeDraft[]>(() =>
    department.positions.map((p) => ({
      id: p.id,
      title: p.title,
      is_custom: p.is_custom,
      holder: p.holder,
    }))
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [addingOffice, setAddingOffice] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      // The office users list is the roster the elder's desk already has.
      fetch(`${API_URL}/api/members/users/`, { headers: authHeaders() })
        .then((res) => (res.ok ? res.json() : []))
        .then((rows) => {
          const q = query.trim().toLowerCase();
          setResults(
            (Array.isArray(rows) ? rows : [])
              .filter((u: { first_name?: string; last_name?: string; username?: string; phone_number?: string }) =>
                `${u.first_name || ""} ${u.last_name || ""} ${u.username || ""} ${u.phone_number || ""}`.toLowerCase().includes(q)
              )
              .slice(0, 8)
              .map((u: { id: number; first_name?: string; last_name?: string; username: string }) => ({
                id: u.id,
                name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.username,
                username: u.username,
              }))
          );
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const addOffice = async () => {
    if (!newTitle.trim() || addingOffice) return;
    setAddingOffice(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${department.code}/leadership/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.title || data.detail || "Could not add the office.");
      setDraft((current) => [...current, { id: data.id, title: data.title, is_custom: true, holder: null }]);
      setNewTitle("");
    } catch (error) {
      showAlert("Could not add office", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setAddingOffice(false);
    }
  };

  const removeOffice = async (office: OfficeDraft) => {
    const answer = await showAlert("Remove this office?", `"${office.title}" will be taken off ${department.label}'s leadership board.` + (office.holder ? ` ${office.holder.name} will no longer hold it.` : ""), "warning", {
      showCancelButton: true,
      confirmButtonText: "Remove",
      cancelButtonText: "Keep",
      confirmButtonColor: brand.alert,
    });
    if (!answer.isConfirmed) return;
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${department.code}/leadership/`, {
        method: "DELETE",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ position_id: office.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not remove the office.");
      setDraft((current) => current.filter((p) => p.id !== office.id));
    } catch (error) {
      showAlert("Could not remove office", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  const save = async () => {
    const replaced = department.positions
      .map((before) => {
        const after = draft.find((p) => p.id === before.id);
        return after && before.holder && after.holder && before.holder.id !== after.holder.id ? before.holder.name : null;
      })
      .filter(Boolean) as string[];
    const summary = draft
      .map((p) => `${p.title}: ${p.holder ? p.holder.name : "open"}`)
      .join("\n");
    const answer = await showAlert(
      "Update leadership?",
      summary + (replaced.length ? `\n\nReplacing: ${replaced.join(", ")}` : ""),
      "question",
      { showCancelButton: true, confirmButtonText: "Save", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
    );
    if (!answer.isConfirmed) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${department.code}/leadership/`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          positions: draft.map((p) => ({ id: p.id, holder_id: p.holder?.id ?? null })),
        }),
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-bark">{department.label} — Leadership</h3>
            <p className="text-[11px] text-moss">One person per office; the office is the role. Contacts stay on their accounts.</p>
          </div>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The offices, each holding one person or open. */}
        <div className="mt-4 space-y-2">
          {draft.map((office) => (
            <div key={office.id} className="rounded-xl border border-sand-line bg-sand-plate px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-bark">{office.title}</p>
                  <p className="truncate text-[11px] text-moss">
                    {office.holder ? `${office.holder.name} · @${office.holder.username}` : "Open — search below to appoint"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {office.holder && (
                    <button
                      type="button"
                      onClick={() => setDraft((current) => current.map((p) => (p.id === office.id ? { ...p, holder: null } : p)))}
                      className="rounded-lg border border-sand-line bg-white px-2 py-1 text-[11px] font-semibold text-moss transition hover:text-bark"
                    >
                      Clear
                    </button>
                  )}
                  {office.is_custom && (
                    <button
                      type="button"
                      onClick={() => removeOffice(office)}
                      title="Remove this office"
                      className="rounded-lg border border-sand-line bg-white px-2 py-1 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {draft.length === 0 && (
            <p className="rounded-xl border border-dashed border-sand-line p-3 text-xs text-moss">
              No offices yet. Add one below.
            </p>
          )}
        </div>

        {/* Appoint into an office: pick the office, then the person. */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-moss" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members to appoint…"
            className="w-full rounded-xl border border-sand-line bg-sand py-2 pl-9 pr-3 text-xs focus:border-ember focus:outline-none"
          />
        </div>
        <div className="mt-2 divide-y divide-sand-soft">
          {searching && <p className="py-3 text-center text-xs text-moss">Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="py-3 text-center text-xs text-moss">No members match that search.</p>
          )}
          {results.map((member) => (
            <div key={member.id} className="py-2">
              <p className="text-xs">
                <span className="font-semibold text-bark">{member.name}</span>
                <span className="ml-1.5 text-[11px] text-moss-faint">@{member.username}</span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {draft.map((office) => {
                  const already = draft.some((p) => p.holder?.id === member.id);
                  return (
                    <button
                      key={office.id}
                      type="button"
                      onClick={() => {
                        if (office.holder && office.holder.id !== member.id) {
                          showAlert(
                            "Office is filled",
                            `${office.title} is held by ${office.holder.name}. Appointing ${member.name} replaces them.`,
                            "warning",
                            { confirmButtonText: "Replace", showCancelButton: true, cancelButtonText: "Cancel" }
                          ).then((answer) => {
                            if (answer.isConfirmed) {
                              setDraft((current) => current.map((p) => (p.id === office.id ? { ...p, holder: { id: member.id, name: member.name, username: member.username } } : p)));
                              setQuery("");
                              setResults([]);
                            }
                          });
                          return;
                        }
                        setDraft((current) => current.map((p) => (p.id === office.id ? { ...p, holder: { id: member.id, name: member.name, username: member.username } } : p)));
                        setQuery("");
                        setResults([]);
                      }}
                      disabled={already && !draft.some((p) => p.holder?.id === member.id && p.id === office.id)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        office.holder?.id === member.id
                          ? "bg-ember text-white"
                          : already
                            ? "cursor-not-allowed border border-sand-line bg-white text-moss-faint"
                            : "border border-sand-line bg-white text-bark hover:border-ember hover:text-ember"
                      }`}
                    >
                      {office.holder?.id === member.id ? `${office.title} ✓` : `Appoint as ${office.title}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Add an office beyond the seeded ones. */}
        <form
          className="mt-4 flex items-center gap-2 border-t border-sand-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            addOffice();
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New office, e.g. Pianist"
            className="min-w-0 flex-1 rounded-xl border border-sand-line px-3 py-2 text-xs focus:border-ember focus:outline-none"
          />
          <button
            type="submit"
            disabled={addingOffice || !newTitle.trim()}
            className="inline-flex items-center gap-1 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add office
          </button>
        </form>

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
  const style = areaStyle(department.code);
  const [roll, setRoll] = useState<RollMember[]>([]);
  const [events, setEvents] = useState<DeptEvent[]>([]);
  const [loadingRoll, setLoadingRoll] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showLeadership, setShowLeadership] = useState(false);
  const [subTab, setSubTab] = useState<"members" | "calendar">(initialTab);
  // The roll's search box and row density, shared with the other desks.
  const [rollSearch, setRollSearch] = useState("");
  const { dense, toggleDensity } = useTableDensity();
  const rowPad = densityCellPad(dense);

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
    // Only department areas carry a roll; office bodies (Eldership,
    // Clerkship, Deaconate) are roles without members of their own.
    if (department.kind === "department") loadRoll();
    loadEvents();
  }, [loadRoll, loadEvents, department.kind]);

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

  const rollQuery = rollSearch.trim().toLowerCase();
  const filteredRoll = rollQuery
    ? roll.filter((m) => `${m.name} ${m.username} ${m.phone_number} ${m.email}`.toLowerCase().includes(rollQuery))
    : roll;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto px-2 py-3 custom-hover-scrollbar md:overflow-hidden md:px-4 lg:px-6">
      {/* Header */}
      <div className="shrink-0 rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to all departments"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-bark transition hover:bg-sand hover:text-ember"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.chip}`} aria-hidden="true">
                  {style.icon}
                </span>
                <h2 className={`text-lg font-bold ${style.accent}`}>{department.label}</h2>
              </div>
              <p className="mt-1 text-xs text-moss">
                {department.kind === "department" && (
                  <>
                    {roll.length} member{roll.length === 1 ? "" : "s"} on the roll ·{" "}
                  </>
                )}
                {events.length} calendar event{events.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {department.kind === "department" && (
              <button
                type="button"
                onClick={() => setSubTab("members")}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  subTab === "members" ? "bg-bark text-white" : "border border-sand-line bg-sand text-moss hover:text-bark"
                }`}
              >
                <Users className="mr-1 inline h-3.5 w-3.5" /> Members
              </button>
            )}
            <button
              type="button"
              onClick={() => setSubTab("calendar")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                subTab === "calendar" ? "bg-bark text-white" : "border border-sand-line bg-sand text-moss hover:text-bark"
              }`}
            >
              <CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Calendar
            </button>
          </div>
        </div>

        {/* Leadership: every named office, filled or open — the same board
            the leadership modal edits. */}
        <div className="mt-4 border-t border-sand-line pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-moss">Leadership</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {department.positions.map((position) =>
              position.holder ? (
                <HolderCard
                  key={position.id}
                  holder={{
                    id: position.holder.id,
                    name: position.holder.name,
                    username: position.holder.username,
                    email: "",
                    phone_number: "",
                  }}
                  roleCaption={position.title}
                  onContact={() => contactHolder({
                    id: position.holder!.id,
                    name: position.holder!.name,
                    username: position.holder!.username,
                    email: "",
                    phone_number: "",
                  })}
                />
              ) : (
                <div key={position.id} className="rounded-2xl border border-dashed border-sand-line p-4 text-xs text-moss">
                  <span className="font-semibold">{position.title}</span> — open. Use Edit leadership to appoint someone.
                </div>
              )
            )}
            {department.positions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-sand-line p-4 text-xs text-moss">
                No offices yet. Use Edit leadership to add them.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Members tab — a contained table: the page holds still, the rows
          scroll, the way the roster and treasury read. */}
      {subTab === "members" && department.kind === "department" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
            <h3 className="text-sm font-bold text-bark">Department roll</h3>
            <div className="flex items-center gap-2">
              <DensityToggle dense={dense} onToggle={toggleDensity} />
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
            ) : filteredRoll.length === 0 ? (
              <p className="py-8 text-center text-xs text-moss">
                {roll.length === 0
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
                  {filteredRoll.map((member) => (
                    <tr key={member.membership_id}>
                      <td className={`px-4 ${rowPad} align-middle`}>
                        <p className="truncate font-semibold text-bark">{member.name}</p>
                      </td>
                      <td className={`hidden px-4 ${rowPad} align-middle sm:table-cell`}>
                        <span className="truncate text-moss">{member.phone_number || member.email || `@${member.username}`}</span>
                      </td>
                      <td className={`px-4 ${rowPad} text-right align-middle`}>
                        <button
                          type="button"
                          onClick={() => removeMember(member)}
                          className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                        >
                          Remove
                        </button>
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
              {filteredRoll.length} member{filteredRoll.length === 1 ? "" : "s"}
              {rollQuery ? ` of ${roll.length}` : ""} on the roll
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
          {loadingEvents ? (
            <p className="py-8 text-center text-xs text-moss">Loading the calendar…</p>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-xs text-moss">
              Nothing on the calendar yet. Events added here are stored and can be published to the congregation.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-sand-soft">
              {events.map((event) => (
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
          onClose={() => setShowLeadership(false)}
          onSaved={() => {
            setShowLeadership(false);
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

export function DepartmentHub() {
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
  // Communicate targets: one department, or several ticked in the table.
  const [communicateDept, setCommunicateDept] = useState<DepartmentRow | null>(null);
  const [communicateSet, setCommunicateSet] = useState<DepartmentRow[] | null>(null);
  // The table's checked rows.
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  // The Add area modal.
  const [showAddArea, setShowAddArea] = useState(false);

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

  const toggleDept = (code: string) => {
    setSelectedCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedCodes((current) =>
      current.size === departments.length ? new Set() : new Set(departments.map((d) => d.code))
    );
  };

  const openMultiCommunicate = () => {
    const chosen = departments.filter((d) => selectedCodes.has(d.code));
    if (chosen.length === 0) return;
    setCommunicateSet(chosen);
  };

  if (loading) {
    return <p className="py-16 text-center text-sm text-moss">Loading departments…</p>;
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
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto px-2 py-3 custom-hover-scrollbar md:overflow-hidden md:px-4 lg:px-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-bark">Departments &amp; Ministries</h2>
          <p className="mt-0.5 text-xs text-moss">
            Every leadership area — the church's offices and each department — with its roles filled office by office. Tick rows to address several departments at once.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddArea(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
        >
          <Plus className="h-3.5 w-3.5" /> Add Department
        </button>
      </div>

      {/* One table, one row per department — the directory a desk scans, not
          a stack of cards. On phones the same rows are cards. */}
      <div className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto custom-table-scrollbar">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-sand-line bg-sand-veil text-[10px] uppercase tracking-wider text-moss">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all departments"
                  checked={departments.length > 0 && selectedCodes.size === departments.length}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 accent-ember"
                />
              </th>
              <th className="px-4 py-3 font-bold">Department</th>
              <th className="px-4 py-3 font-bold">Leader</th>
              <th className="px-4 py-3 font-bold">Other offices</th>
              <th className="px-4 py-3 text-center font-bold">Roll</th>
              <th className="px-4 py-3 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((department) => {
              const style = areaStyle(department.code);
              return (
                <tr key={department.code} className="border-b border-sand-soft last:border-0 hover:bg-sand/60">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${department.label}`}
                      checked={selectedCodes.has(department.code)}
                      onChange={() => toggleDept(department.code)}
                      className="h-3.5 w-3.5 accent-ember"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.chip}`} aria-hidden="true">
                        {style.icon}
                      </span>
                      <span className={`text-sm font-bold ${style.accent}`}>{department.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {department.leader ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-bark">{department.leader.name}</p>
                        <p className="truncate text-[11px] text-moss">{department.leader.phone_number || department.leader.email || ""}</p>
                      </div>
                    ) : (
                      <span className="text-xs italic text-moss-faint">not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {department.assistants.length > 0 ? (
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-bark">{department.assistants.map((a) => a.name).join(", ")}</p>
                        <p className="truncate text-[11px] text-moss">{department.assistants[0].phone_number || department.assistants[0].email || ""}</p>
                      </div>
                    ) : (
                      <span className="text-xs italic text-moss-faint">not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-moss">
                    {department.member_count}
                    <span className="block text-[10px] text-moss-faint">{department.event_count} event{department.event_count === 1 ? "" : "s"}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DepartmentActionsMenu
                      department={department}
                      onEditLeadership={() => setLeadershipDept(department)}
                      onCalendar={() => {
                        setDetailTab("calendar");
                        setSelected(department);
                      }}
                      onMembers={() => {
                        setDetailTab("members");
                        setSelected(department);
                      }}
                      onBudget={() => setBudgetDept(department)}
                      onCommunicate={() => setCommunicateDept(department)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {/* The bottom row: what's ticked on the left, Communicate on the right. */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sand-line px-4 py-3">
          <p className="text-xs text-moss">
            {selectedCodes.size === 0
              ? "Tick departments to message several at once"
              : `${selectedCodes.size} department${selectedCodes.size === 1 ? "" : "s"} selected`}
          </p>
          <button
            type="button"
            onClick={openMultiCommunicate}
            disabled={selectedCodes.size === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Megaphone className="h-3.5 w-3.5" /> Communicate
          </button>
        </div>
      </div>

      {/* Phones: the same directory as cards. */}
      <div className="space-y-3 md:hidden">
        {departments.map((department) => {
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
                <DepartmentActionsMenu
                  department={department}
                  onEditLeadership={() => setLeadershipDept(department)}
                  onCalendar={() => {
                    setDetailTab("calendar");
                    setSelected(department);
                  }}
                  onMembers={() => {
                    setDetailTab("members");
                    setSelected(department);
                  }}
                  onBudget={() => setBudgetDept(department)}
                  onCommunicate={() => setCommunicateDept(department)}
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
                  <span className="font-semibold text-moss">Other offices:</span>{" "}
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
          onClose={() => setLeadershipDept(null)}
          onSaved={() => {
            setLeadershipDept(null);
            loadDirectory();
          }}
        />
      )}
      {communicateDept && (
        <CommunicateModal
          departments={[communicateDept]}
          onClose={() => setCommunicateDept(null)}
        />
      )}
      {communicateSet && (
        <CommunicateModal
          departments={communicateSet}
          onClose={() => {
            setCommunicateSet(null);
            setSelectedCodes(new Set());
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
 * Communicate: the announcement composer, opened already addressed to the
 * chosen departments. The audience codes are the departments' own
 * whole-department codes — the roll plus its leaders, exactly that group and
 * nobody else — and several departments at once compose a single post to all
 * of them. The composer's Post-to list carries the same vocabulary, so the
 * preselection renders correctly and the sender can widen it if they choose.
 */
function CommunicateModal({
  departments,
  onClose,
}: {
  departments: DepartmentRow[];
  onClose: () => void;
}) {
  const audienceCodes = [...new Set(departments.map((d) => `dept_${d.code}`))];
  const audienceLabel = departments.map((d) => d.label).join(", ");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Post an announcement to ${audienceLabel}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-sand-line bg-white px-6 py-4">
          <h3 className="text-base font-bold text-bark">Announcement — {audienceLabel}</h3>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <AnnouncementManager
            presetAudience={audienceCodes}
            composerOnly
            onDone={onClose}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Add Department: a new leadership area — a department with its own roll
 * (AMM, Youth…) or a church office body (Eldership-style) — created with
 * the four seeded offices, fillable the moment it exists. Its audience
 * code (`dept_<code>`) rides the same announcement machinery as the
 * original departments.
 */
function AddAreaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"department" | "office">("department");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/create/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), kind, description: description.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.name || data.detail || "Could not create the area.");
      showAlert(
        "Area created",
        `${data.name} now has its own leadership board. Open it to appoint its officers.`,
        "success",
        { toast: true, timer: 4500, showConfirmButton: false }
      );
      onCreated();
      onClose();
    } catch (error) {
      showAlert("Could not create area", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a leadership area"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-bark">Add Department</h3>
            <p className="text-[11px] text-moss">A new leadership area with its own offices and, for departments, a roll.</p>
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
          <div className="text-xs font-semibold text-bark">
            Kind
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("department")}
                className={`rounded-xl border px-3 py-2 text-left text-[11px] transition ${kind === "department" ? "border-ember bg-sand-airy text-bark" : "border-sand-line bg-white text-moss hover:border-ember"}`}
              >
                <span className="block font-bold">Department</span>
                Has its own member roll, calendar and budget.
              </button>
              <button
                type="button"
                onClick={() => setKind("office")}
                className={`rounded-xl border px-3 py-2 text-left text-[11px] transition ${kind === "office" ? "border-ember bg-sand-airy text-bark" : "border-sand-line bg-white text-moss hover:border-ember"}`}
              >
                <span className="block font-bold">Church office</span>
                An office body like Eldership — roles only, no roll.
              </button>
            </div>
          </div>
          <label className="block text-xs font-semibold text-bark">
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line about what this area does (optional)"
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
          </label>
          <p className="text-[11px] text-moss">
            Created with Leader, Assistant, Secretary and Treasurer offices — add or rename offices when editing leadership.
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
              {saving ? "Creating…" : "Create area"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
