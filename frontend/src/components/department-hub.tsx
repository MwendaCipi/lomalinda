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

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import {
  Accessibility,
  ArrowDownLeft,
  ArrowUpRight,
  Baby,
  CalendarDays,
  Church,
  Clock,
  Handshake,
  Heart,
  HeartPulse,
  Landmark,
  Mail,
  MicVocal,
  MoreVertical,
  Music,
  PenLine,
  Plus,
  Pencil,
  Search,
  Sparkles,
  Sun,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { DEPARTMENT_BLURBS, departmentDeskCode } from "@/config/navigation";
import { meetingDay, meetingHours, type WeeklyMeeting } from "@/lib/gathering";
import { dayFirst, dayFirstTime } from "@/lib/dates";

import { invalidateDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { usePageHeader } from "@/components/app-frame";
import { densityCellPad } from "@/lib/table-density";
import { AreaJoinModal } from "./area-modals";
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
  /** The holder's sex where the roster records it — the age-based desks'
      roll reads a sex column, and the board leads that table. */
  gender?: string;
  photo_url?: string;
  /** The holder's full role set, sent along so the picker edits in place. */
  roles?: string[];
  assistant_roles?: string[];
  /** The office this holder fills, e.g. "Leader" or "Secretary". */
  position?: string;
  /** Whether the holder was appointed to the seat ("leader") or beside it.
      A department with two named offices (the deaconate's Head Deacon and
      Head Deaconess) has two leader-kind rows, so the board reads the kind
      to tell an office from an assistant. */
  kind?: string;
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
  role?: string;
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
/** The desks the church files by age read who they are filed by: their
    roll carries a sex column beside the name. */
const SHOW_SEX = new Set(["aym", "ambassadors", "children"]);

type RollRow = {
  key: string;
  /** The user the row is — the board holder's or the roll entry's id, so
      the row's Actions can act on the person whatever their tie. */
  id: number;
  name: string;
  username: string;
  email: string;
  phone_number: string;
  /** The member's sex, where the roster records it — the age-based desks'
      roll reads it in a column of its own. */
  sex?: string;
  /** The office held on the department's board, when the row is one of them. */
  office: string | null;
  /** Custom or assigned role within this department. */
  role?: string | null;
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

const UNIT_AGE_LABELS: Record<string, string> = {
  Beginners: "Beginners (0–3 yrs)",
  Kindergarten: "Kindergarten (4–6 yrs)",
  Primary: "Primary (7–9 yrs)",
  Junior: "Junior (10–12 yrs)",
  Teens: "Teens (13–15 yrs)",
  Pathfinders: "Pathfinders (10–15 yrs)",
};

function AddChildModal({
  onClose,
  onAdded,
  initialUnit,
}: {
  onClose: () => void;
  onAdded: () => void;
  initialUnit?: string | null;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [dob, setDob] = useState("");
  const [age, setAge] = useState<number | "">("");
  const [category, setCategory] = useState<string>(initialUnit || "Beginners");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-detect category from age or DOB
  const handleAgeChange = (enteredAge: number | "") => {
    setAge(enteredAge);
    if (enteredAge !== "") {
      if (enteredAge <= 3) setCategory("Beginners");
      else if (enteredAge <= 6) setCategory("Kindergarten");
      else if (enteredAge <= 9) setCategory("Primary");
      else if (enteredAge <= 12) setCategory(category === "Pathfinders" ? "Pathfinders" : "Junior");
      else setCategory(category === "Pathfinders" ? "Pathfinders" : "Teens");
    }
  };

  const handleDobChange = (enteredDob: string) => {
    setDob(enteredDob);
    if (enteredDob) {
      const birth = new Date(enteredDob);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        calculatedAge--;
      }
      if (calculatedAge >= 0) {
        setAge(calculatedAge);
        handleAgeChange(calculatedAge);
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      showAlert("Missing name", "Please enter the child's first name.", "warning");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/children/records/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          gender,
          date_of_birth: dob || null,
          age: age === "" ? null : Number(age),
          unit: category,
          guardian_name: guardianName.trim(),
          guardian_phone: guardianPhone.trim(),
          notes: notes.trim(),
        }),
      });
      if (res.ok) {
        showAlert(
          "Child Registered",
          `${firstName.trim()} has been registered in Children's Ministry under ${category}.`,
          "success",
          { toast: true, timer: 4500, showConfirmButton: false }
        );
        onAdded();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert("Could not register child", data.detail || "Please verify the information and try again.", "error");
      }
    } catch {
      showAlert("Error", "Could not connect to the server.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add Child to Children Ministry"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-bark">Add Child to Children's Ministry</h3>
            <p className="text-[11px] text-moss">Enter child details, age and assign to their age division.</p>
          </div>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-bark">
              First Name *
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Samuel"
                className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
              />
            </label>
            <label className="block text-xs font-semibold text-bark">
              Last Name
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Mwangi"
                className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block text-xs font-semibold text-bark">
              Date of Birth
              <input
                type="date"
                value={dob}
                onChange={(e) => handleDobChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
              />
            </label>
            <label className="block text-xs font-semibold text-bark">
              Age (Years)
              <input
                type="number"
                min="0"
                max="18"
                value={age}
                onChange={(e) => handleAgeChange(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 5"
                className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
              />
            </label>
            <label className="block text-xs font-semibold text-bark">
              Sex
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "male" | "female" | "other")}
                className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
              >
                <option value="male">Boy (Male)</option>
                <option value="female">Girl (Female)</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>

          <label className="block text-xs font-semibold text-bark">
            Children Division / Category *
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none font-medium"
            >
              <option value="Beginners">Beginners (0–3 yrs / Cradle Roll)</option>
              <option value="Kindergarten">Kindergarten (4–6 yrs)</option>
              <option value="Primary">Primary (7–9 yrs)</option>
              <option value="Junior">Junior (10–12 yrs)</option>
              <option value="Teens">Teens (13–15 yrs)</option>
              <option value="Pathfinders">Pathfinders Club (10–15 yrs)</option>
            </select>
            <span className="mt-1 block text-[11px] font-normal text-moss">
              Auto-selected based on age, or chosen manually.
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-bark">
              Parent / Guardian Name
              <input
                type="text"
                value={guardianName}
                onChange={(e) => setGuardianName(e.target.value)}
                placeholder="e.g. Mary Mwangi"
                className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
              />
            </label>
            <label className="block text-xs font-semibold text-bark">
              Parent / Guardian Phone
              <input
                type="tel"
                value={guardianPhone}
                onChange={(e) => setGuardianPhone(e.target.value)}
                placeholder="e.g. 0712345678"
                className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-bark">
            Notes (Special needs, allergies, medical)
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special notes or care instructions (optional)"
              className="mt-1 w-full rounded-xl border border-sand-line px-3 py-2 text-xs font-normal focus:border-ember focus:outline-none"
            />
          </label>

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
              disabled={saving || !firstName.trim()}
              className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
            >
              {saving ? "Registering…" : "Register Child"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddMemberModal({
  departmentLabel,
  rollIds,
  onClose,
  onAdd,
  onBatchAdd,
  /** When set, the picker fills this instead — one modal serves both the
      roll's Add member and a singing group's add-singer. */
  title,
  takenLabel = "On this roll",
  excludeIds,
  /** Batch mode: picked names gather in a list and one button adds them
      all — a desk builds its roll a Sabbath class at a time, not a name at
      a time. The single-add surfaces (singers, choir) stay as they were. */
  batch = false,
}: {
  departmentLabel: string;
  rollIds: Set<number>;
  onClose: () => void;
  onAdd: (member: { id: number; name: string }) => void;
  /** Sends every picked name at once; resolves false when the send was
      refused, so the modal keeps the picks for a retry. */
  onBatchAdd?: (members: { id: number; name: string }[]) => Promise<boolean | void>;
  title?: string;
  takenLabel?: string;
  excludeIds?: Set<number>;
  batch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; username: string }[]>([]);
  const [searching, setSearching] = useState(false);
  // The batch list: picked names wait here until Add members sends them all.
  const [picked, setPicked] = useState<{ id: number; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const inGroup = excludeIds ?? new Set<number>();
  const pickedIds = new Set(picked.map((p) => p.id));

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
            const onRoll = rollIds.has(member.id) || inGroup.has(member.id) || pickedIds.has(member.id);
            return (
              <button
                key={member.id}
                type="button"
                disabled={onRoll}
                onClick={() => {
                  if (batch) {
                    setPicked((current) => [...current, { id: member.id, name: member.name }]);
                    setQuery("");
                    setResults([]);
                  } else {
                    onAdd(member);
                  }
                }}
                className={`flex w-full items-center justify-between gap-2 py-2.5 text-left text-xs transition ${
                  onRoll ? "cursor-not-allowed opacity-50" : "hover:bg-sand"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-bark">{member.name}</span>
                  <span className="block truncate text-[11px] text-moss-faint">@{member.username}</span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-ember">
                  {onRoll ? takenLabel : batch ? "Pick" : "Add"}
                </span>
              </button>
            );
          })}
        </div>
        {batch && (
          <div className="mt-4 border-t border-sand-line pt-3">
            {picked.length === 0 ? (
              <p className="text-center text-[11px] text-moss">Search and pick everyone to add, then send them to the roll together.</p>
            ) : (
              <ul className="space-y-1.5">
                {picked.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-2 rounded-xl bg-sand px-3 py-2">
                    <span className="min-w-0 truncate text-xs font-semibold text-bark">{member.name}</span>
                    <button
                      type="button"
                      onClick={() => setPicked((current) => current.filter((p) => p.id !== member.id))}
                      aria-label={`Remove ${member.name} from the list`}
                      className="shrink-0 text-[11px] font-semibold text-moss transition hover:text-ember"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={picked.length === 0 || sending}
              onClick={async () => {
                setSending(true);
                try {
                  // Only a successful send empties the list — a refused
                  // batch keeps the picks so the desk can retry as-is.
                  const added = await onBatchAdd?.(picked);
                  if (added !== false) setPicked([]);
                } finally {
                  setSending(false);
                }
              }}
              className="mt-3 w-full rounded-xl bg-ember px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
            >
              {sending ? "Adding…" : `Add ${picked.length > 0 ? picked.length : ""} member${picked.length === 1 ? "" : "s"}`.trim()}
            </button>
          </div>
        )}
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
  search,
}: {
  departmentCode: string;
  departmentLabel: string;
  onChanged: () => void;
  /** The register's search, owned by the desk so it rides the header band. */
  search: string;
}) {
  const [groups, setGroups] = useState<SingingGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  // Members without the desk's keys can still ask: the proposal lands in the
  // requests queue and registers the group when the desk approves it.
  const [showPropose, setShowPropose] = useState(false);
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

/** One singer on the choir's own roll, as the department members read carries. */
type ChoirMember = {
  membership_id: number | null;
  id: number;
  name: string;
  username: string;
  email: string;
  phone_number: string;
};

/**
 * The church choir's own roll, opened from the music desk.
 *
 * The choir files its singers under its own department — the music roll
 * unions them in with a "via Choir" chip — so this view is the desk's way of
 * working that list directly: search it, and add or remove the singers on
 * it. Adding follows the server's own guard (officers and the choir's own
 * leadership), and the button rides the flag the read carries.
 */
function ChoirPanel({
  departmentLabel,
  onChanged,
  search,
}: {
  departmentLabel: string;
  onChanged: () => void;
  /** The roll's search, owned by the desk so it can ride the shell's header
      band beside the page's name, as every other view's search does. */
  search: string;
}) {
  const [members, setMembers] = useState<ChoirMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const rowPad = densityCellPad();

  const loadChoir = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/members/departments/choir/members/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { members: [], can_manage: false }))
      .then((data) => {
        setMembers(data.members || []);
        setCanManage(Boolean(data.can_manage));
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // The fetch starts a microtask late, keeping the effect from writing
    // state synchronously and cascading the render.
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) loadChoir();
    });
    return () => {
      alive = false;
    };
  }, [loadChoir]);

  const addSinger = async (member: { id: number; name: string }) => {
    const res = await fetch(`${API_URL}/api/members/departments/choir/members/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: member.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showAlert("Singer added", `${member.name} now sings with the ensemble.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setShowAdd(false);
      loadChoir();
      onChanged();
    } else {
      showAlert("Could not add", data.detail || "The member could not be added to the ensemble.", "error");
    }
  };

  const removeSinger = async (singer: ChoirMember) => {
    const result = await showAlert(
      "Remove from ensemble",
      `Take ${singer.name} off the ensemble's roll? Their membership in the church is not affected.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/departments/choir/members/${singer.id}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      showAlert("Removed", `${singer.name} is off the ensemble's roll.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      loadChoir();
      onChanged();
    } else {
      showAlert("Could not remove", "The member could not be removed from the ensemble.", "error");
    }
  };

  const choirQuery = search.trim().toLowerCase();
  const visibleChoir = choirQuery
    ? members.filter((m) => `${m.name} ${m.username} ${m.phone_number} ${m.email}`.toLowerCase().includes(choirQuery))
    : members;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        <h3 className="text-sm font-bold text-bark">Ensemble</h3>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add singer
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-table-scrollbar">
        {loading ? (
          <p className="py-8 text-center text-xs text-moss">Loading the ensemble…</p>
        ) : visibleChoir.length === 0 ? (
          <p className="py-8 text-center text-xs text-moss">
            {members.length === 0
              ? canManage
                ? "Nobody is on the ensemble's roll yet. Use “Add singer” to build it."
                : "Nobody is on the ensemble's roll yet."
              : "No ensemble member matches that search."}
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white text-[11px] font-bold uppercase tracking-wider text-ember">
              <tr className="border-b border-sand-line">
                <th className="px-4 pb-3 pt-3 font-bold">Name</th>
                <th className="hidden px-4 pb-3 pt-3 font-bold sm:table-cell">Contact</th>
                {canManage && <th className="px-4 pb-3 pt-3 text-right font-bold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-soft">
              {visibleChoir.map((singer) => (
                <tr key={singer.id}>
                  <td className={`px-4 ${rowPad} align-middle`}>
                    <p className="truncate font-semibold text-bark">{singer.name}</p>
                  </td>
                  <td className={`hidden px-4 ${rowPad} align-middle sm:table-cell`}>
                    <span className="truncate text-moss">{singer.phone_number || singer.email || `@${singer.username}`}</span>
                  </td>
                  {canManage && (
                    <td className={`px-4 ${rowPad} text-right align-middle`}>
                      <button
                        type="button"
                        onClick={() => removeSinger(singer)}
                        className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-red-300 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sand-line px-4 py-3">
        <p className="text-xs text-moss">
          {visibleChoir.length} {visibleChoir.length === 1 ? "singer" : "singers"}
          {choirQuery ? ` of ${members.length}` : ""} on the choir&apos;s roll
        </p>
      </div>
      {showAdd && (
        <AddMemberModal
          departmentLabel={departmentLabel}
          title="Add singers to the ensemble"
          rollIds={new Set<number>()}
          excludeIds={new Set(members.map((m) => m.id))}
          takenLabel="Already in the ensemble"
          onClose={() => setShowAdd(false)}
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

/**
 * Assign a roll member to a role — one person, one seat, one save.
 *
 * The roll's Actions popover opens this: the desk picks the position — the
 * area's own roles, or a custom one it names on the spot (created here by
 * the same POST the leadership modal uses) — and the save seats the member
 * through the leadership endpoint, so the derived flags, audiences and the
 * appointment letters all follow the one path every other seat takes.
 */
function AssignRoleModal({
  department,
  member,
  unit,
  onClose,
  onSaved,
}: {
  department: DepartmentRow;
  member: { id: number; name: string; sex?: string };
  /** The unit the roll was reading, for a department that runs as units. */
  unit: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<DepartmentRoleRow[]>(department.roles);
  const [roleId, setRoleId] = useState<number | "custom">(
    department.roles.find((r) => !r.is_custom)?.id ?? (department.roles[0]?.id as number | undefined) ?? "custom"
  );
  const [customName, setCustomName] = useState("");
  const [hasAssistant, setHasAssistant] = useState(false);
  const [saving, setSaving] = useState(false);
  const chosen = roles.find((r) => r.id === roleId) ?? null;
  const seated = chosen?.holders.filter((h) => h.kind === "leader") ?? [];
  // The same sex rule the leadership modal and the server keep: the
  // deaconate's Head Deacon is a man's office, its Head Deaconess a woman's.
  // A profile that does not record a sex leaves the desk to know.
  const seatSex = chosen ? SEAT_SEX_BY_OFFICE[chosen.name.toLowerCase()] : undefined;
  const offSex = Boolean(seatSex && member.sex && member.sex.toLowerCase() !== seatSex);

  const save = async () => {
    if (offSex) {
      showAlert(
        "Not this office's to hold",
        `The ${chosen?.name} is a ${seatSex === "male" ? "man" : "woman"}'s office.`,
        "warning"
      );
      return;
    }
    setSaving(true);
    try {
      let targetId = roleId;
      if (targetId === "custom") {
        const name = customName.trim();
        if (name.length < 2) {
          showAlert("Name the role", "Give the custom role a name of at least two characters.", "warning");
          setSaving(false);
          return;
        }
        const created = await fetch(`${API_URL}/api/members/departments/${department.code}/leadership/`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ name, has_assistant: hasAssistant }),
        });
        const createdData = await created.json().catch(() => ({}));
        if (!created.ok) throw new Error(createdData.name?.[0] || createdData.detail || "Could not create the role.");
        targetId = createdData.id;
      }
      const res = await fetch(`${API_URL}/api/members/departments/${department.code}/leadership/`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: [{ role_id: targetId, member_id: member.id, kind: "leader" }],
          unit: unit ?? "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not assign the role.");
      showAlert(
        "Role assigned",
        `${member.name} now holds ${chosen ? chosen.name : customName.trim()} in ${department.label}.`,
        "success",
        { toast: true, timer: 4000, showConfirmButton: false },
      );
      invalidateDepartments();
      onSaved();
    } catch (error) {
      showAlert("Could not assign", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Assign a role to ${member.name}`}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <h3 className="text-lg font-bold text-bark">Assign role</h3>
            <p className="text-[11px] text-moss">{member.name} — {department.label}</p>
          </div>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {roles.map((role) => {
            const roleSex = SEAT_SEX_BY_OFFICE[role.name.toLowerCase()];
            const roleOffSex = Boolean(roleSex && member.sex && member.sex.toLowerCase() !== roleSex);
            return (
            <button
              key={role.id}
              type="button"
              disabled={roleOffSex}
              title={roleOffSex ? `The ${role.name} is a ${roleSex === "male" ? "man" : "woman"}'s office.` : undefined}
              onClick={() => setRoleId(role.id)}
              aria-pressed={roleId === role.id}
              className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs transition ${
                roleOffSex
                  ? "cursor-not-allowed border-sand-line bg-sand text-moss-faint"
                  : roleId === role.id
                    ? "border-ember bg-sand"
                    : "border-sand-line bg-white hover:border-ember"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-semibold text-bark">{role.name}</span>
                {role.holders.length > 0 && (
                  <span className="block truncate text-[11px] text-moss">
                    {role.holders.map((h) => h.name).join(", ")}
                  </span>
                )}
              </span>
              {roleId === role.id && <span className="shrink-0 text-[11px] font-bold text-ember">Selected</span>}
            </button>
            );
          })}

          {/* A role the desk names on the spot — created by the same POST
              the leadership modal uses, then seated here. */}
          <button
            type="button"
            onClick={() => setRoleId("custom")}
            aria-pressed={roleId === "custom"}
            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs transition ${
              roleId === "custom"
                ? "border-ember bg-sand"
                : "border-sand-line bg-white hover:border-ember"
            }`}
          >
            <span className="font-semibold text-bark">A role of its own…</span>
            <Plus className={`h-3.5 w-3.5 shrink-0 ${roleId === "custom" ? "text-ember" : "text-moss"}`} />
          </button>
          {roleId === "custom" && (
            <div className="space-y-2 rounded-xl border border-sand-line bg-sand px-3 py-3">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Pianist, Sponsor, Pathfinders Captain"
                maxLength={80}
                className="w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none"
              />
              <label className="flex items-center gap-2 text-[11px] text-moss">
                <input
                  type="checkbox"
                  checked={hasAssistant}
                  onChange={(e) => setHasAssistant(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-sand-mute text-ember focus:ring-ember"
                />
                This role may take assistants beside its holder
              </label>
            </div>
          )}

          {/* A leader seat replaces its holder — the same rule the
              leadership modal asks about before staging. */}
          {chosen && seated.length > 0 && !seated.some((h) => h.id === member.id) && (
            <p className="rounded-xl border border-gold-soft bg-sand-cream px-3 py-2 text-[11px] text-bark">
              {chosen.name} is {seated.map((h) => h.name).join(", ")} — saving gives it to {member.name}.
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
            {saving ? "Assigning…" : "Assign role"}
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
function WeeklyMeetingsPanel({ search }: { search: string }) {
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

  // The strip's search reads the live week: a meeting keeps matching on its
  // name, its place, whether it is online, and the day it keeps.
  const needle = search.trim().toLowerCase();
  const visibleMeetings = (meetings ?? []).filter((meeting) =>
    needle
      ? `${meeting.title} ${meeting.place} ${meeting.online ? "online" : ""} ${meetingDay(meeting)}`
          .toLowerCase()
          .includes(needle)
      : true
  );

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
      ) : visibleMeetings.length === 0 ? (
        <p className="py-8 text-center text-xs text-moss">No meeting matches that search.</p>
      ) : (
        <div className="mt-3 divide-y divide-sand-soft">
          {visibleMeetings.map((meeting) => (
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


/** One ledger line on a department fund: money in, or money the treasurer
 *  paid out. */
type DepartmentAccountInfo = {
  id: number;
  name: string;
  description: string;
  balance: string | number;
  is_primary?: boolean;
  is_lcb?: boolean;
};

/** One ledger line on a department fund: money in, or money the treasurer
 *  paid out. */
type FundMovement = {
  id: number;
  account_id?: number;
  account_name?: string;
  account_description?: string;
  transaction_type: string;
  transaction_type_display: string;
  amount: string;
  description: string;
  reference: string;
  created_at: string;
};

/** A withdrawal ask the desk has raised, and the treasurer's answer. */
type FundWithdrawal = {
  id: number;
  account_id?: number;
  account_name?: string;
  account_description?: string;
  amount: string;
  reason: string;
  status: "pending" | "elder_approved" | "approved" | "declined" | "reversed";
  reply: string;
  requested_by: string;
  created_at: string;
  decided_at?: string | null;
};

/**
 * Popover filter near the search input to toggle between All, Contributions, and Withdrawals.
 */
function AccountsFilterPopover({
  value,
  onChange,
}: {
  value: "all" | "contributions" | "withdrawals";
  onChange: (v: "all" | "contributions" | "withdrawals") => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const labels = {
    all: "All",
    contributions: "Contributions",
    withdrawals: "Withdrawals",
  };

  return (
    <div className="relative inline-block shrink-0" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
          value !== "all"
            ? "border-ember bg-ember/10 text-ember"
            : "border-sand-mute bg-white text-bark hover:bg-sand"
        }`}
        aria-label="Filter transactions"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{labels[value]}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-2xl border border-sand-line bg-white p-1.5 text-left shadow-2xl ring-1 ring-black/5">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-moss-faint">
            Filter by type
          </p>
          {(
            [
              { key: "all", label: "All items" },
              { key: "contributions", label: "Contributions only (+)" },
              { key: "withdrawals", label: "Withdrawals & requests (−)" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onChange(item.key);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                value === item.key
                  ? "bg-sand-linen text-ember"
                  : "text-bark hover:bg-sand"
              }`}
            >
              <span>{item.label}</span>
              {value === item.key && <span className="text-ember font-bold">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type UnifiedAccountItem = {
  key: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  isOutflow: boolean;
  category: "contribution" | "withdrawal";
  status: "completed" | "pending" | "elder_approved" | "approved" | "declined" | "reversed";
  accountId?: number;
  accountName?: string;
  accountDescription?: string;
  requestedBy?: string;
  reply?: string;
};

/**
 * The department's own fund — the Account & Withdrawals view of its desk.
 *
 * Displays both financial movements (contributions & debits) and withdrawal requests
 * with real-time status badges (Pending, Elder Approved, Approved, Declined, Reversed).
 */
export function DepartmentAccountsPanel({
  department,
  onChanged,
  search,
  typeFilter = "all",
}: {
  department: DepartmentRow;
  onChanged: () => void;
  /** The fund ledger's search, owned by the desk so it rides the header band. */
  search: string;
  /** Category filter: all, contributions, or withdrawals. */
  typeFilter?: "all" | "contributions" | "withdrawals";
}) {
  const isDeaconate = department.code === "deaconate";
  const [accounts, setAccounts] = useState<DepartmentAccountInfo[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [movements, setMovements] = useState<FundMovement[]>([]);
  const [withdrawals, setWithdrawals] = useState<FundWithdrawal[]>([]);
  const [canRequest, setCanRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAccountId, setWithdrawAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const rowPad = densityCellPad();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/members/departments/${department.code}/account/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const accList: DepartmentAccountInfo[] = Array.isArray(data?.accounts)
          ? data.accounts
          : data?.account
            ? [data.account]
            : [];
        setAccounts(accList);
        setMovements(Array.isArray(data?.movements) ? data.movements : []);
        setWithdrawals(Array.isArray(data?.withdrawals) ? data.withdrawals : []);
        setCanRequest(Boolean(data?.can_request_withdrawal));

        // Initial default account filter:
        // For AWM, both accounts are selected by default ("all").
        // For other departments, their primary account is selected by default, or "all".
        if (department.code === "awm") {
          setAccountFilter("all");
        } else if (accList.length > 0) {
          const primary = accList.find((a) => a.is_primary) ?? accList[0];
          setAccountFilter(String(primary.id));
        } else {
          setAccountFilter("all");
        }
      })
      .catch(() => {
        setAccounts([]);
        setMovements([]);
        setWithdrawals([]);
        setCanRequest(false);
      })
      .finally(() => setLoading(false));
  }, [department.code]);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) load();
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const selectedWithdrawAccount = useMemo(() => {
    if (withdrawAccountId !== null) {
      const match = accounts.find((a) => a.id === withdrawAccountId);
      if (match) return match;
    }
    if (accountFilter !== "all") {
      const match = accounts.find((a) => String(a.id) === String(accountFilter));
      if (match) return match;
    }
    return accounts.find((a) => a.is_primary) ?? accounts[0] ?? null;
  }, [accounts, withdrawAccountId, accountFilter]);

  const withdrawBalance = Number(selectedWithdrawAccount?.balance ?? 0);

  const requestWithdrawal = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const chosenAccountId = withdrawAccountId ?? selectedWithdrawAccount?.id;
      const res = await fetch(`${API_URL}/api/members/departments/${department.code}/account/`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          reason: reason.trim(),
          account_id: chosenAccountId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.reason || "Could not send the request.");
      setShowWithdrawModal(false);
      setAmount("");
      setReason("");
      showAlert(
        "Request sent",
        data.detail || (isDeaconate ? "The treasurer has your funding request." : "The treasurer has your withdrawal request."),
        "success"
      );
      load();
      onChanged();
    } catch (error) {
      showAlert("Could not send the request", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const movementQuery = search.trim().toLowerCase();

  const unifiedItems = useMemo(() => {
    const items: UnifiedAccountItem[] = [];
    const wdMap = new Map<number, FundWithdrawal>();
    for (const w of withdrawals) {
      wdMap.set(w.id, w);
    }

    const matchedWdIds = new Set<number>();

    for (const mov of movements) {
      const isOutflow = mov.transaction_type === "debit" || mov.transaction_type === "transfer_out";
      const wdMatch = mov.reference ? mov.reference.match(/^WD-(\d+)$/i) : null;
      let status: UnifiedAccountItem["status"] = "completed";
      const category: UnifiedAccountItem["category"] = isOutflow ? "withdrawal" : "contribution";
      let requestedBy: string | undefined;
      let reply: string | undefined;

      if (wdMatch) {
        const wdId = parseInt(wdMatch[1], 10);
        matchedWdIds.add(wdId);
        const wd = wdMap.get(wdId);
        if (wd) {
          status = "approved";
          requestedBy = wd.requested_by;
          reply = wd.reply;
        }
      }

      items.push({
        key: `mov-${mov.id}`,
        date: mov.created_at,
        description: mov.description,
        reference: mov.reference || mov.transaction_type_display,
        amount: Number(mov.amount),
        isOutflow,
        category,
        status,
        accountId: mov.account_id,
        accountName: mov.account_name,
        accountDescription: mov.account_description,
        requestedBy,
        reply,
      });
    }

    for (const wd of withdrawals) {
      if (!matchedWdIds.has(wd.id)) {
        items.push({
          key: `wd-${wd.id}`,
          date: wd.created_at,
          description: wd.reason,
          reference: isDeaconate ? "Funding request" : "Withdrawal request",
          amount: Number(wd.amount),
          isOutflow: true,
          category: "withdrawal",
          status: (wd.status as UnifiedAccountItem["status"]) || "pending",
          accountId: wd.account_id,
          accountName: wd.account_name,
          accountDescription: wd.account_description,
          requestedBy: wd.requested_by,
          reply: wd.reply,
        });
      }
    }

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [movements, withdrawals, isDeaconate]);

  const filteredItems = useMemo(() => {
    let list = unifiedItems;
    if (accountFilter !== "all") {
      list = list.filter((item) => String(item.accountId) === String(accountFilter));
    }
    if (typeFilter === "contributions") {
      list = list.filter((item) => item.category === "contribution");
    } else if (typeFilter === "withdrawals") {
      list = list.filter((item) => item.category === "withdrawal");
    }

    if (movementQuery) {
      list = list.filter((item) =>
        `${item.description} ${item.reference} ${item.status} ${item.accountName || ""} ${item.requestedBy || ""} ${item.reply || ""}`
          .toLowerCase()
          .includes(movementQuery)
      );
    }
    return list;
  }, [unifiedItems, accountFilter, typeFilter, movementQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePageNum = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((safePageNum - 1) * PAGE_SIZE, safePageNum * PAGE_SIZE);

  const selectedAccountInfo = useMemo(() => {
    if (accountFilter === "all") return null;
    return accounts.find((a) => String(a.id) === String(accountFilter)) ?? null;
  }, [accounts, accountFilter]);

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  }, [accounts]);

  const displayedBalance = selectedAccountInfo ? Number(selectedAccountInfo.balance) : totalBalance;

  const statusBadge = (status: UnifiedAccountItem["status"]) => {
    const map: Record<string, string> = {
      completed: "bg-sand text-moss",
      pending: "bg-amber-50 text-amber-800",
      elder_approved: "bg-mist-select text-bark",
      approved: "bg-green-50 text-green-800",
      declined: "bg-red-50 text-red-700",
      reversed: "bg-sand text-moss",
    };
    const labels: Record<string, string> = {
      completed: "Completed",
      pending: "Pending",
      elder_approved: "Elder Approved",
      approved: "Approved",
      declined: "Declined",
      reversed: "Reversed",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
          map[status] ?? "bg-sand text-moss"
        }`}
      >
        {labels[status] ?? status}
      </span>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm h-full">
      {loading ? (
        <p className="py-8 text-center text-xs text-moss">Loading the fund…</p>
      ) : accounts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-semibold text-bark">No account connected yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-moss">
            The treasurer has not linked a church treasury account for {department.label} yet. Accounts can be linked at the Treasury Accounts desk.
          </p>
        </div>
      ) : (
        <>
          {/* Account Filter Switcher Tabs: when more than 1 account is accessible */}
          {accounts.length > 1 && (
            <div className="flex shrink-0 items-center gap-1.5 border-b border-sand-line bg-sand/30 px-4 py-2 text-xs overflow-x-auto">
              <span className="text-[11px] font-bold uppercase tracking-wider text-moss mr-1 shrink-0">
                Account:
              </span>
              <button
                type="button"
                onClick={() => {
                  setAccountFilter("all");
                  setPage(1);
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  accountFilter === "all"
                    ? "bg-ember text-white shadow-2xs"
                    : "bg-white text-bark border border-sand-line hover:bg-sand"
                }`}
              >
                All Accounts
              </button>
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setAccountFilter(String(acc.id));
                    setPage(1);
                  }}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    accountFilter === String(acc.id)
                      ? "bg-ember text-white shadow-2xs"
                      : "bg-white text-bark border border-sand-line hover:bg-sand"
                  }`}
                >
                  {acc.description || acc.name}{" "}
                  <span className={accountFilter === String(acc.id) ? "text-white/80 font-normal" : "text-moss font-normal"}>
                    (KES {Number(acc.balance).toLocaleString("en-KE", { minimumFractionDigits: 0 })})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Contained Scrollable Unified Ledger Table: Only Rows Scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-table-scrollbar">
            {unifiedItems.length === 0 ? (
              <p className="px-4 py-16 text-center text-xs text-moss">No transactions recorded in this fund yet.</p>
            ) : visibleItems.length === 0 ? (
              <p className="px-4 py-16 text-center text-xs text-moss">No transaction matches that filter or search.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-xs">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Reference / Type</th>
                    <th className="px-4 py-3 text-right">Amount (KES)</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-soft bg-white">
                  {visibleItems.map((item) => (
                    <tr key={item.key} className="transition hover:bg-sand-linen/60">
                      <td className={`whitespace-nowrap px-4 ${rowPad} text-moss font-mono text-[11px]`}>
                        {dayFirstTime(item.date)}
                      </td>
                      <td className={`px-4 ${rowPad} font-medium text-bark`}>
                        <div className="flex items-center gap-1.5">
                          {item.isOutflow ? (
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ember" />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-moss-dark" />
                          )}
                          <div className="min-w-0">
                            <span className="truncate">{item.description}</span>
                            {item.requestedBy && item.status !== "completed" && (
                              <span className="ml-1.5 text-[10px] text-moss-faint">
                                (by {item.requestedBy})
                              </span>
                            )}
                            {item.reply && (item.status === "declined" || item.status === "approved") && (
                              <p className="text-[10px] italic text-moss-faint">{item.reply}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-4 ${rowPad} text-moss-faint text-[11px]`}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono">{item.reference}</span>
                          {accounts.length > 1 && item.accountName && (
                            <span className="inline-block w-fit rounded-sm bg-sand px-1.5 py-0.5 text-[10px] font-bold uppercase text-moss">
                              {item.accountName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-4 ${rowPad} text-right font-bold ${item.isOutflow ? "text-ember" : "text-moss-dark"}`}>
                        {item.isOutflow ? "−" : "+"}KES{" "}
                        {item.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`whitespace-nowrap px-4 ${rowPad} text-center`}>
                        {statusBadge(item.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom footer — balance + request button + pagination */}
          <div className="shrink-0 border-t border-sand-line bg-white px-4 py-3 sm:px-6">
            {/* Row 1 — balance + action */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-moss">
                <span>
                  {selectedAccountInfo ? `${selectedAccountInfo.description || selectedAccountInfo.name} Balance:` : "Total Balance:"}{" "}
                  <strong className="text-ember font-bold">
                    KES {displayedBalance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </strong>
                </span>
                {accounts.length > 1 && accountFilter === "all" && (
                  <span className="hidden sm:inline text-[11px] text-moss-faint">
                    ({accounts.map((a) => `${a.name}: KES ${Number(a.balance).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`).join(" · ")})
                  </span>
                )}
                {isDeaconate && (
                  <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase text-moss">
                    LCB
                  </span>
                )}
              </div>
              <div className="shrink-0">
                {canRequest ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (withdrawAccountId === null && accounts.length > 0) {
                        const primary = accounts.find((a) => a.is_primary) ?? accounts[0];
                        setWithdrawAccountId(primary.id);
                      }
                      setShowWithdrawModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-ember-deep sm:px-4"
                  >
                    {isDeaconate ? <Wallet className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                    <span className="sm:hidden">{isDeaconate ? "Request" : "Withdraw"}</span>
                    <span className="hidden sm:inline">{isDeaconate ? "Request funding" : "Request withdrawal"}</span>
                  </button>
                ) : (
                  <span className="text-[11px] italic text-moss-faint">Leaders only</span>
                )}
              </div>
            </div>

            {/* Row 2 — pagination, only when there is more than one page */}
            {totalPages > 1 && (
              <div className="mt-2 flex items-center justify-center gap-1 text-xs text-moss">
                <button
                  type="button"
                  disabled={safePageNum <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-sand-line px-2.5 py-1 font-semibold text-bark transition hover:bg-sand disabled:opacity-30"
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <span className="px-1">
                  {safePageNum} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePageNum >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-sand-line px-2.5 py-1 font-semibold text-bark transition hover:bg-sand disabled:opacity-30"
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            )}
            {totalPages <= 1 && filteredItems.length > 0 && (
              <p className="mt-0.5 text-center text-[11px] text-moss-faint">
                {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
              </p>
            )}
          </div>
        </>
      )}

      {/* Withdrawal / Funding Request Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label={isDeaconate ? "Request funding" : "Request a withdrawal"} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl ring-1 ring-sand-line">
            <div className="flex items-start justify-between border-b border-sand-line pb-3">
              <div>
                <h3 className="text-lg font-bold text-bark">
                  {isDeaconate ? "Request Funding" : "Request a withdrawal"}
                </h3>
                <p className="mt-0.5 text-xs text-moss">
                  {isDeaconate
                    ? "The treasurer reviews funding requests for church budget allocations."
                    : "The treasurer answers it at the accounts desk."}
                </p>
              </div>
              <button type="button" onClick={() => setShowWithdrawModal(false)} aria-label="Close" className="rounded-lg p-1 text-moss hover:bg-sand hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={requestWithdrawal} className="mt-4 space-y-4">
              {/* Account selection combo if multiple accounts are accessible */}
              {accounts.length > 1 && (
                <label className="block text-sm font-medium text-bark">
                  Withdraw from Account *
                  <select
                    value={selectedWithdrawAccount?.id ?? ""}
                    onChange={(e) => setWithdrawAccountId(Number(e.target.value))}
                    className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.description || acc.name} — KES {Number(acc.balance).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-sm font-medium text-bark">
                Amount (KES) *
                <input
                  type="number"
                  required
                  min="1"
                  max={withdrawBalance > 0 ? withdrawBalance : undefined}
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000.00"
                  className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                  autoFocus
                />
                <span className="mt-1 block text-xs text-moss">
                  Available in {selectedWithdrawAccount?.description || selectedWithdrawAccount?.name || "account"}: KES{" "}
                  {withdrawBalance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                </span>
              </label>
              <label className="block text-sm font-medium text-bark">
                What is it for? *
                <textarea
                  required
                  rows={3}
                  maxLength={255}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    isDeaconate
                      ? "Explain what the funding will be used for (e.g. communion bread/wine, sanctuary maintenance, ordinance supplies)..."
                      : "Explain what the money will pay for..."
                  }
                  className="mt-1 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-sand-line pt-4">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:text-bark"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !amount || !reason.trim()}
                  className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
                >
                  {submitting ? "Sending…" : isDeaconate ? "Send funding request" : "Send request"}
                </button>
              </div>
            </form>
          </div>
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
  // The Deaconate reads as one page: its Team view is the roll itself, and the
  // desk's own strip above already names Team / Inventory / Duty Rota /
  // Calendar. The hub's Members / Calendar / Accounts toggles would only repeat
  // the page under them, so they are held back here.
  const isDeaconate = department.code === "deaconate";
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
  const [showAddChild, setShowAddChild] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showLeadership, setShowLeadership] = useState(false);
  // A member reading the area who is not on its roll can ask to join from
  // right here — the request goes to the desk, not to the street.
  const [showJoin, setShowJoin] = useState(false);
  // Who is reading: on the roll, or holding an office at the desk. A viewer
  // who is neither is a member looking in — the desk reads, and the ask to
  // join rides the strip.
  const { me } = useHeaderData();
  const myUsername = me?.username ?? "";
  const onRoll = Boolean(myUsername) && roll.some((m) => m.username === myUsername);
  const holdsOffice = Boolean(
    myUsername &&
      (department.leader?.username === myUsername || department.assistants.some((a) => a.username === myUsername))
  );
  const [subTab, setSubTab] = useState<"members" | "calendar" | "meetings" | "singing_groups" | "choir" | "accounts" | "requests">(initialTab);
  const [accountsTypeFilter, setAccountsTypeFilter] = useState<"all" | "contributions" | "withdrawals">("all");
  // How many asks are waiting on this desk. The strip carries the count and
  // The join asks raised from the rail, answered on this desk.
  const [joinRequests, setJoinRequests] = useState<
    { id: number; member_name: string; note: string; status: string; created_at: string }[]
  >([]);

  // The strip names the view, and which unit's roll it reads: All Members and
  // the unit fellowships read their roll, the rest name the view itself. This
  // is what marks the active toggle in the merged strip.
  const activeStripKey = subTab === "members" ? (unit === null ? "unit:null" : `unit:${unit}`) : subTab;
  // The roll's and the calendar's search boxes.
  const [rollSearch, setRollSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [choirSearch, setChoirSearch] = useState("");
  const [groupsSearch, setGroupsSearch] = useState("");
  const [accountsSearch, setAccountsSearch] = useState("");
  const [meetingsSearch, setMeetingsSearch] = useState("");

  const rowPad = densityCellPad();

  const [canManageRoll, setCanManageRoll] = useState(false);

  // Inject the search bar into the AppFrame page header's right slot — the
  // shell draws the title and description; we slot the search beside them.
  const { setHeaderRightAction, setCustomToggles, setTogglesRightAction } = usePageHeader();
  useEffect(() => {
    const inputCls = "rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember w-56 sm:w-64";
    if (subTab === "members") {
      setHeaderRightAction(
        <input
          type="text"
          value={rollSearch}
          onChange={(e) => setRollSearch(e.target.value)}
          placeholder="Search the roll…"
          className={inputCls}
        />
      );
    } else if (subTab === "calendar") {
      setHeaderRightAction(
        <input
          type="text"
          value={eventSearch}
          onChange={(e) => setEventSearch(e.target.value)}
          placeholder="Search the calendar…"
          className={inputCls}
        />
      );
    } else if (subTab === "requests") {
      setHeaderRightAction(
        <input
          type="text"
          value={requestSearch}
          onChange={(e) => setRequestSearch(e.target.value)}
          placeholder="Search join requests…"
          className={inputCls}
        />
      );
    } else if (subTab === "choir") {
      // The ensemble's roll searches from the same place every other view's
      // does — the shell's header band, beside the page's name.
      setHeaderRightAction(
        <input
          type="text"
          value={choirSearch}
          onChange={(e) => setChoirSearch(e.target.value)}
          placeholder="Search the ensemble…"
          className={inputCls}
        />
      );
    } else if (subTab === "singing_groups") {
      setHeaderRightAction(
        <input
          type="text"
          value={groupsSearch}
          onChange={(e) => setGroupsSearch(e.target.value)}
          placeholder="Search groups…"
          className={inputCls}
        />
      );
    } else if (subTab === "accounts") {
      setHeaderRightAction(
        <div className="flex items-center gap-1.5 sm:gap-2">
          <input
            type="text"
            value={accountsSearch}
            onChange={(e) => setAccountsSearch(e.target.value)}
            placeholder="Search account…"
            className="w-36 sm:w-56 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
          />
          <AccountsFilterPopover
            value={accountsTypeFilter}
            onChange={setAccountsTypeFilter}
          />
        </div>
      );
    } else if (subTab === "meetings") {
      setHeaderRightAction(
        <input
          type="text"
          value={meetingsSearch}
          onChange={(e) => setMeetingsSearch(e.target.value)}
          placeholder="Search meetings…"
          className={inputCls}
        />
      );
    } else {
      setHeaderRightAction(null);
    }
    return () => setHeaderRightAction(null);
  }, [
    subTab,
    rollSearch,
    eventSearch,
    requestSearch,
    choirSearch,
    groupsSearch,
    accountsSearch,
    accountsTypeFilter,
    meetingsSearch,
    setHeaderRightAction,
  ]);

  // The deaconate's Team view rides the *section's* strip, not a strip of its
  // own, so the roll's second Add Member takes that strip's right edge — a PC
  // convenience beside the one in the footer, pointing at the same modal, and
  // never the only way to reach it (a phone keeps the footer's).
  useEffect(() => {
    if (department.code !== "deaconate" || subTab !== "members" || !canManageRoll) return;
    setTogglesRightAction(
      <button
        type="button"
        onClick={() => setShowAddMember(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-ember-deep"
      >
        <UserPlus className="h-3.5 w-3.5" /> Add Member
      </button>
    );
    return () => setTogglesRightAction(null);
  }, [department.code, subTab, canManageRoll, setTogglesRightAction]);

  // The desk's own views — the roll (and its fellowships), the calendar, the
  // fund, the week — ride the shell's header band, exactly as the console's
  // other desks place their toggles, so every desk reads one strip in one
  // place. The band draws it instead of the section's pages.
  const unitsKey = units.join("|");
  const stripItems = useMemo(() => {
    // Ambassadors is its own separate department; remove it from the AYM
    // unit strip so it no longer appears as a sub-section of AYM.
    const names = (unitsKey ? unitsKey.split("|") : []).filter(
      (n) => n.toLowerCase() !== "ambassadors"
    );
    return [
      // A department that runs as units reads one at a time — the roll and
      // the calendar follow the toggle — so the units ride the strip beside
      // the views: All Members, then the desk's own fellowships.
      ...(names.length > 0
        ? [{ key: "unit:null", label: "All Members", icon: Users }]
        : []),
      ...names.map((name) => ({ key: `unit:${name}`, label: name, icon: Users })),
      // A desk without units keeps the roll named "All Members".
      ...(names.length === 0 ? [{ key: "members", label: "All Members", icon: Users }] : []),
      // Music sings in more than one voice: the choir's own roll and the
      // groups registered under it each get a view beside the roll.
      ...(isMusic ? [{ key: "choir", label: "Ensemble", icon: Music }] : []),
      ...(isMusic ? [{ key: "singing_groups", label: "Singing Groups", icon: MicVocal }] : []),
      // The join asks raised from the rail — always shown so the desk can
      // see at a glance whether anything is waiting; a count badge appears
      // when there are pending asks.
      {
        key: "requests",
        label: "Join Requests",
        icon: UserPlus,
        ...(joinRequests.filter((row) => row.status === "pending").length > 0
          ? { count: joinRequests.filter((row) => row.status === "pending").length }
          : {}),
      },
      { key: "calendar", label: "Calendar", icon: CalendarDays },
      // The fund ledger and withdrawal requests unified under one desk.
      { key: "accounts", label: "Account & Withdrawals", icon: Wallet },
      // Only the ministry that keeps the church's week carries its panel.
      ...(keepsTheWeek ? [{ key: "meetings", label: "Weekly Meetings", icon: Clock }] : []),
    ];
  }, [unitsKey, isMusic, keepsTheWeek, department.code, joinRequests]);

  const handleStripChange = useCallback((key: string) => {
    // A unit key selects the unit and lands the desk on its roll; a plain key
    // is a view of the department as the strip held before.
    if (key.startsWith("unit:")) {
      setUnit(key === "unit:null" ? null : key.slice(5));
      setSubTab("members");
      return;
    }
    setSubTab(key as "members" | "calendar" | "meetings" | "singing_groups" | "choir" | "accounts" | "requests");
  }, []);
  useEffect(() => {
    if (isDeaconate) {
      setCustomToggles(null);
      return;
    }
    setCustomToggles(
      <SubNav label="Department views" items={stripItems} value={activeStripKey} onChange={handleStripChange} />
    );
    return () => setCustomToggles(null);
  }, [setCustomToggles, isDeaconate, stripItems, activeStripKey, handleStripChange]);

  const loadRoll = useCallback(() => {
    setLoadingRoll(true);
    fetch(`${API_URL}/api/members/departments/${department.code}/members/${unitQuery(unit)}`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((data) => {
        setRoll(data.members || []);
        setCanManageRoll(Boolean(data.can_manage));
      })
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

  // The asks raised from the rail, answered on this desk. Loaded with the
  // roll so the strip can carry the waiting count before the view is opened.
  const loadJoinRequests = useCallback(() => {
    fetch(`${API_URL}/api/members/department-join-requests/review/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data) =>
        setJoinRequests(
          (data?.requests ?? []).filter(
            (row: { department: string }) => row.department === department.code,
          ),
        ),
      )
      .catch(() => setJoinRequests([]));
  }, [department.code]);

  useEffect(() => {
    // Every department carries a roll — Eldership, Clerkship and Deaconate
    // included; the church itself is not a department.
    loadRoll();
    loadEvents();
    loadJoinRequests();
  }, [loadRoll, loadEvents, loadJoinRequests]);

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
      showAlert("Added to roll", `${member.name} now belongs to ${department.label}.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setShowAddMember(false);
      loadRoll();
      onChanged();
    } else {
      showAlert("Could not add", data.detail || "The member could not be added to the roll.", "error");
    }
  };

  // The batch add: one request carries every picked name, so a roll of a
  // Sabbath class costs one modal and one button, not one per person.
  const addMembers = async (members: { id: number; name: string }[]) => {
    if (members.length === 0) return;
    const res = await fetch(`${API_URL}/api/members/departments/${department.code}/members/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: members.map((m) => m.id), unit: unit ?? "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const names = members.map((m) => m.name);
      const detail =
        names.length === 1
          ? `${names[0]} now belongs to ${department.label}.`
          : names.length <= 3
          ? `${names.join(", ")} now belong to ${department.label}.`
          : `${names.length} members now belong to ${department.label}.`;
      showAlert("Added to roll", detail, "success", { toast: true, timer: 5000, showConfirmButton: false });
      setShowAddMember(false);
      loadRoll();
      onChanged();
    } else {
      showAlert("Could not add", data.detail || "The members could not be added to the roll.", "error");
      return false;
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

  // The roll's per-row Actions popover — one open at a time, found by a
  // marker on its own wrapper (a ref would only attach to whichever row
  // mounted last; see the treasury desk's handler for the fuller note).
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-action-menu]")) return;
      setOpenMenuKey(null);
    }
    if (openMenuKey) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuKey]);

  // Assign Role: the desk seats a member into one of the area's roles —
  // its own seeded ones or a custom one it creates on the spot.
  const [assignFor, setAssignFor] = useState<RollRow | null>(null);

  /** Quiet contact lines for the popover: only what the account carries. */
  const contactOf = (row: RollRow) => [row.email, row.phone_number].filter(Boolean);

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
        // A leader-kind row here is the department's second office (the
        // deaconate's Head Deaconess beside its Head Deacon), not someone
        // assisting one — so it keeps its own name rather than reading
        // "Head Deaconess · Assistant" for a seat that takes no assistant.
        office:
          assistant.kind === "leader"
            ? assistant.position || "Leader"
            : assistant.position
              ? `${assistant.position} · Assistant`
              : "Assistant",
      })),
    ];
    for (const { holder, office } of boardPeople) {
      const key = keyOf(holder);
      if (seen.has(key)) continue;
      seen.add(key);
      const memberMatch = roll.find((m) => keyOf(m) === key);
      rows.push({
        key,
        id: holder.id,
        name: holder.name,
        username: holder.username,
        email: holder.email,
        phone_number: holder.phone_number,
        sex: holder.gender || memberMatch?.gender || "",
        office,
        role: office || memberMatch?.role || null,
        via: null,
        member: memberMatch ?? null,
      });
    }
    for (const member of roll) {
      const key = keyOf(member);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        id: member.id,
        name: member.name,
        username: member.username,
        email: member.email,
        phone_number: member.phone_number,
        sex: member.gender,
        office: null,
        role: member.role || null,
        via: member.via ?? null,
        member,
      });
    }
    return rows;
  })();

  const rollQuery = rollSearch.trim().toLowerCase();
  const visibleRoll = rollQuery
    ? rollRows.filter((row) => `${row.name} ${row.username} ${row.phone_number} ${row.email} ${row.role || ""}`.toLowerCase().includes(rollQuery))
    : rollRows;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 overflow-y-auto px-2 py-3 custom-hover-scrollbar md:overflow-hidden md:px-4 lg:px-6">

      {/* Members tab — a contained table: the page holds still, the rows
          scroll, the way the roster and treasury read. The department's board
          leads the table, so opening a department shows who leads it first. */}
      {subTab === "members" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
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
                    <th className="px-4 pb-3 pt-3 font-bold">Role</th>
                    {/* The desks the church files by age read who they are
                        filed by: Young Adults, Ambassadors and Children's
                        roll carries a sex column. */}
                    {SHOW_SEX.has(department.code) && (
                      <th className="hidden px-4 pb-3 pt-3 font-bold sm:table-cell">Sex</th>
                    )}
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
                      <td className={`px-4 ${rowPad} align-middle`}>
                        {row.role ? (
                          <span className="inline-flex rounded-full bg-mist-select px-2.5 py-0.5 text-[11px] font-semibold text-bark">
                            {row.role}
                          </span>
                        ) : (
                          <span className="text-xs text-moss-mute">None</span>
                        )}
                      </td>
                      {SHOW_SEX.has(department.code) && (
                        <td className={`hidden px-4 ${rowPad} align-middle sm:table-cell`}>
                          <span className="text-moss">{row.sex ? (row.sex.toLowerCase() === "female" ? "Female" : "Male") : "—"}</span>
                        </td>
                      )}
                      <td className={`hidden px-4 ${rowPad} align-middle sm:table-cell`}>
                        <span className="truncate text-moss">{row.phone_number || row.email || `@${row.username}`}</span>
                      </td>
                      <td className={`px-4 ${rowPad} text-right align-middle`}>
                        <div className="relative inline-block" data-action-menu>
                          <button
                            type="button"
                            onClick={() => setOpenMenuKey(openMenuKey === row.key ? null : row.key)}
                            aria-expanded={openMenuKey === row.key}
                            aria-label={`Actions for ${row.name}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-[11px] font-semibold text-bark transition hover:bg-sand"
                          >
                            Actions
                            <MoreVertical className="h-3 w-3 text-moss" />
                          </button>
                          {openMenuKey === row.key && (
                            <div className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-2xl border border-sand-line bg-white p-1.5 text-left shadow-2xl ring-1 ring-black/5">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuKey(null);
                                  setAssignFor(row);
                                }}
                                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
                              >
                                <UserCog className="h-4 w-4 text-ember" /> Assign role
                              </button>
                              {contactOf(row).length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuKey(null);
                                    const [email, phone] = contactOf(row);
                                    window.open(
                                      email
                                        ? `mailto:${email}?subject=${encodeURIComponent(`${department.label} — a word from your department`)}`
                                        : `tel:${(phone ?? "").replace(/\s+/g, "")}`,
                                      "_self",
                                    );
                                  }}
                                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
                                >
                                  <Mail className="h-4 w-4 text-sage-strong" /> Contact member
                                </button>
                              )}
                              {row.member ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuKey(null);
                                    removeMember(row.member!);
                                  }}
                                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                >
                                  <UserMinus className="h-4 w-4" /> Remove
                                </button>
                              ) : (
                                <p className="px-3 py-2 text-[11px] italic text-moss-faint">
                                  {row.via ? `On the roll through ${row.via}` : "Appointed — no roll entry"}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {/* The bottom row: count on the left, Add Member on the right — and
              the ask to join beneath the table, where a member reading an
              area they are not on the roll of meets it at the end of the
              list, not as chrome above it. */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-sand-line px-4 py-3">
            <p className="text-xs text-moss">
              {visibleRoll.length} {visibleRoll.length === 1 ? "person" : "people"}
              {rollQuery ? ` of ${rollRows.length}` : ""} shown · {roll.length} on the roll
            </p>
            {canManageRoll ? (
              <div className="flex items-center gap-2">
                {department.code === "children" && (
                  <button
                    type="button"
                    onClick={() => setShowAddChild(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-700 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-fuchsia-800"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Child
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddMember(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add Member
                </button>
              </div>
            ) : !onRoll && !holdsOffice ? (
              <button
                type="button"
                onClick={() => setShowJoin(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-bark px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember"
              >
                <UserPlus className="h-3.5 w-3.5" /> Request to join
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Account & Withdrawals tab */}
      {subTab === "accounts" && (
        <DepartmentAccountsPanel
          department={department}
          onChanged={onChanged}
          search={accountsSearch}
          typeFilter={accountsTypeFilter}
        />
      )}
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
              {events.filter((event) => `${event.title} ${event.date} ${event.location || ""} ${event.notes || ""}`.toLowerCase().includes(eventSearch.trim().toLowerCase())).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-bark">{event.title}</p>
                    <p className="text-[11px] text-moss">
                      {dayFirst(event.date)}
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
      {subTab === "choir" && isMusic && (
        <ChoirPanel departmentLabel={department.label} onChanged={onChanged} search={choirSearch} />
      )}
      {subTab === "singing_groups" && isMusic && (
        <SingingGroupsPanel
          departmentCode={department.code}
          departmentLabel={department.label}
          onChanged={onChanged}
          search={groupsSearch}
        />
      )}

      {/* Weekly meetings — the church's own week, on the ministry that keeps
          it. Church-wide, so it is its own view rather than a calendar entry. */}
      {subTab === "meetings" && keepsTheWeek && <WeeklyMeetingsPanel search={meetingsSearch} />}

      {/* Join requests — the asks raised from the rail, answered here by the
          desk's own leadership or the office. Approving puts the member on
          the roll the same way Add member does. Its own view, not a table
          beneath the roll. */}
      {subTab === "requests" && (
        <JoinRequestsPanel
          departmentCode={department.code}
          requests={joinRequests}
          search={requestSearch}
          onChanged={() => {
            loadJoinRequests();
            onChanged();
          }}
        />
      )}

      {showAddChild && (
        <AddChildModal
          initialUnit={unit}
          onClose={() => setShowAddChild(false)}
          onAdded={() => {
            setShowAddChild(false);
            loadRoll();
            onChanged();
          }}
        />
      )}
      {showAddMember && (
        <AddMemberModal
          departmentLabel={department.label}
          rollIds={rollIds}
          batch
          onClose={() => setShowAddMember(false)}
          onAdd={addMember}
          onBatchAdd={addMembers}
        />
      )}
      {assignFor && (
        <AssignRoleModal
          department={department}
          member={{ id: assignFor.id, name: assignFor.name, sex: assignFor.sex }}
          unit={unit}
          onClose={() => setAssignFor(null)}
          onSaved={() => {
            setAssignFor(null);
            loadUnitBoard();
            onChanged();
          }}
        />
      )}
      {showJoin && (
        <AreaJoinModal
          open
          area={department.group === "ministry" ? "Ministries" : "Departments"}
          initialCode={department.code}
          onClose={() => {
            setShowJoin(false);
            loadRoll();
          }}
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
  // The directory search: narrows by area or by any name seated at it. It
  // rides the shell's header beside the page's name, the way every other
  // desk places its own — one row for the heading and the search, at both
  // widths. A single department's desk draws its own search there instead
  // (see `DepartmentDetail`), so opening a row takes the slot over.
  const [directorySearch, setDirectorySearch] = useState("");
  const { setHeaderRightAction } = usePageHeader();
  useEffect(() => {
    setHeaderRightAction(
      <input
        type="text"
        value={directorySearch}
        onChange={(e) => setDirectorySearch(e.target.value)}
        placeholder="Search areas or the people leading them…"
        aria-label="Search the leadership directory"
        className="w-full min-w-0 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-64"
      />
    );
    return () => setHeaderRightAction(null);
  }, [directorySearch, setHeaderRightAction]);
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
          // An older row named AMM's desk `amo`; links saved then still land there.
          const code = departmentDeskCode(initialDept) ?? current?.code;
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
function JoinRequestsPanel({
  departmentCode,
  requests,
  search,
  onChanged,
}: {
  departmentCode: string;
  requests: { id: number; member_name: string; note: string; status: string; created_at: string }[];
  search: string;
  onChanged: () => void;
}) {
  const [replies, setReplies] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

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

  const query = search.trim().toLowerCase();
  const matching = query
    ? requests.filter((row) => `${row.member_name} ${row.note}`.toLowerCase().includes(query))
    : requests;
  const open = matching.filter((row) => row.status === "pending");
  const answered = matching.filter((row) => row.status !== "pending");

  if (requests.length === 0) {
    return (
      <div className="rounded-2xl border border-sand-line bg-white p-8 text-center text-xs text-moss shadow-sm">
        No one has asked to join {departmentCode.replace("_", " ")} yet.
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-bark">Join requests</h3>
      <p className="mt-0.5 text-xs text-moss">
        Members asking to join {departmentCode.replace("_", " ")} — approve to add them to the roll, with a reply they will read.
      </p>
      {query && open.length === 0 && answered.length === 0 && (
        <p className="mt-4 text-center text-xs text-moss">No join request matches that search.</p>
      )}
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
