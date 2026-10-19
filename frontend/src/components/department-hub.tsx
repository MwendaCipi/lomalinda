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
  ArrowLeft,
  ArrowUpRight,
  Baby,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Church,
  Clock,
  HandHeart,
  Handshake,
  Heart,
  HeartPulse,
  Landmark,
  Droplets,
  Megaphone,
  MessageSquare,
  MicVocal,
  MoreVertical,
  Music,
  PenLine,
  Phone,
  Plus,
  Pencil,
  Search,
  Sparkles,
  Sun,
  Trash2,
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
import {
  areaHasMoments,
  DEPARTMENT_BLURBS,
  deaconateViews,
  departmentDeskCode,
  MINISTRIES_AND_DEPARTMENTS_HEADING,
} from "@/config/navigation";
import { meetingDay, meetingHours, type WeeklyMeeting } from "@/lib/gathering";
import { dayFirst, dayFirstTime } from "@/lib/dates";

import { invalidateDepartments } from "@/hooks/use-departments";
import { useHeaderData } from "@/hooks/use-header-data";
import { FilterPopover, FilterSet } from "./filter-popover";
import { usePageHeader } from "@/components/app-frame";
import { densityCellPad } from "@/lib/table-density";
import { AreaJoinModal } from "./area-modals";
import { RecordList } from "./record-list";
import { SectionNav, SubNav } from "./sub-nav";
import { CampaignManagement } from "./campaign-management";
import { formatOfficeRole, formatRoles, NO_ROLE_LABEL, seatTitle } from "./roles-combobox";
import { ComboboxPopover } from "./combobox-popover";
import { LessonOrdersPanel } from "@/components/lesson-orders-panel";
import { BaptismalClassPanel } from "@/components/baptismal-class-panel";
import { DailyWordPanel } from "@/components/daily-word-panel";
import { AreaMomentsPanel } from "@/components/area-moments-panel";
import { AnnouncementManager } from "@/components/announcement-manager";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { openConversation } from "@/lib/chat";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarViewToggle,
  MonthGrid,
  clockTime,
  monthNames,
  type CalendarView,
} from "@/components/calendar-views";

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
  welfare: { icon: <HandHeart className="h-4 w-4" />, accent: "text-amber-800", chip: "bg-amber-50 text-amber-800" },
  dorcas: { icon: <Sparkles className="h-4 w-4" />, accent: "text-rose-800", chip: "bg-rose-50 text-rose-800" },
  development: { icon: <Landmark className="h-4 w-4" />, accent: "text-emerald-800", chip: "bg-emerald-50 text-emerald-800" },
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

/** One office in a department, as the directory returns it. */
type DepartmentRoleRow = {
  id: number;
  name: string;
  /** The department may appoint assistants of this role beside its leader. */
  has_assistant: boolean;
  /** A seeded catalogue office the area may drop; the base Leader and
      Assistant pair stays with every area. */
  is_optional: boolean;
  /** An office the area's own leader fills; church leadership sets only the
      base pair and the elected offices. */
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
  /** Whether this account leads the area — the one who fills its custom
      offices rather than the church's fixed seats. */
  can_manage_custom?: boolean;
};

type RollMember = {
  membership_id: number | null;
  id: number | string;
  name: string;
  username: string;
  email: string;
  phone_number: string;
  /** The WhatsApp number the roster holds, when it holds one — a second
      door beside the call. */
  whatsapp_number?: string;
  gender: string;
  role?: string;
  unit?: string;
  class?: string;
  child_id?: number;
  is_child?: boolean;
  age?: number | null;
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

/** The members view's filter: the whole list, the people approved onto the
    roll, or the asks still waiting on an answer. */
type MemberFilter = "all" | "approved" | "requests";

/** An ask's state in one word — what its row's badge carries. */
function askStatusWord(status: string) {
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  return "Declined";
}

/** One ask to join an area, as the desk's review feed carries it. */
type JoinRequestRow = {
  id: number;
  member_id: number;
  member_name: string;
  member_email: string;
  member_phone: string;
  kind: string;
  group_name: string;
  note: string;
  status: string;
  reply: string;
  created_at: string;
};

type RollRow = {
  key: string;
  /** The user the row is — the board holder's or the roll entry's id, so
      the row's Actions can act on the person whatever their tie. */
  id: number | string;
  name: string;
  username: string;
  email: string;
  phone_number: string;
  /** The WhatsApp number the roster holds for the person, falling back to
      the phone where it does not — the same read the Ministry map's area
      view gave each roll card. */
  whatsapp_number?: string;
  /** The member's sex, where the roster records it — the age-based desks'
      roll reads it in a column of its own. */
  sex?: string;
  /** The office held on the department's board, when the row is one of them. */
  office: string | null;
  /** Custom or assigned role within this department. */
  role?: string | null;
  /** The class/division the member or child belongs to in the department */
  class?: string | null;
  unit?: string | null;
  child_id?: number | null;
  is_child?: boolean;
  age?: number | null;
  /** Where a unioned roll row came through ("Choir", a group's name) — the
      music desk's way of showing why someone with no membership row is on
      the roll. */
  via: string | null;
  /** The roll entry behind the row, when there is one to take off the roll. */
  member: RollMember | null;
  /** The ask to join behind the row, when the row *is* an ask rather than a
      roll entry — the desk answers it from the row's own Actions. */
  request?: JoinRequestRow | null;
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
  end_date: string;
  end_time: string;
  mode: "physical" | "virtual";
  location: string;
  meeting_link: string;
  program_file: string | null;
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
            Class *
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
              Select the child's class / department. Auto-suggested from age or selectable above.
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
  defaultLocation,
  departments = [],
  onClose,
  onAdd,
}: {
  departmentLabel: string;
  defaultLocation: string;
  /**
   * Every area the church records, offered only to a desk that may file on
   * another's calendar (the personal ministries desk keeps the church's week,
   * and the officers may write anywhere). An empty list means the desk writes
   * its own calendar, and the choice is not offered at all.
   */
  departments?: { code: string; label: string }[];
  onClose: () => void;
  onAdd: (event: {
    title: string;
    date: string;
    time: string;
    end_date: string;
    end_time: string;
    mode: string;
    location: string;
    meeting_link: string;
    /** The area whose calendar holds the event; "" is this desk's own. */
    department: string;
    program_file: File | null;
  }) => void;
}) {
  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "",
    end_date: "",
    end_time: "",
    mode: "physical" as "physical" | "virtual",
    location: defaultLocation,
    meeting_link: "",
    department: "",
  });
  const [programFile, setProgramFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Which area's calendar will hold the event. The desk writing it is the
  // default — the church's own week is filed into the ministry that runs it,
  // so the heading follows the choice.
  const targetLabel = departments.find((row) => row.code === form.department)?.label ?? departmentLabel;
  const valid = form.title.trim() && form.date;
  const inputCls = "mt-1 w-full rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add event to ${targetLabel}`}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <h3 className="text-lg font-bold text-bark">Add event for {targetLabel}</h3>
          <button type="button" onClick={onClose} className="text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onAdd({ ...form, program_file: programFile });
          }}
        >
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-bark">Event title *</label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputCls}
            />
          </div>

          {/* Whose calendar holds it — offered only to a desk that may write
              on another's (the church's week is filed into the ministry that
              will run it, rather than kept as a second list). */}
          {departments.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-bark">Department / ministry</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                aria-label="Which department or ministry runs this event"
                className={inputCls}
              >
                <option value="">{departmentLabel} (this desk)</option>
                {departments.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dates — both on one row */}
          <div>
            <label className="text-xs font-semibold text-bark">Date</label>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-moss">From *</span>
                <input
                  type="date"
                  aria-label="From date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <span className="text-[11px] text-moss">To</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={form.end_date}
                  min={form.date || undefined}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Times — both on one row */}
          <div>
            <label className="text-xs font-semibold text-bark">Time</label>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-moss">From</span>
                <input
                  type="time"
                  aria-label="From time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className={inputCls}
                  placeholder="HH:MM"
                />
              </div>
              <div>
                <span className="text-[11px] text-moss">To</span>
                <input
                  type="time"
                  aria-label="To time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  className={inputCls}
                  placeholder="HH:MM"
                />
              </div>
            </div>
          </div>

          {/* Mode toggle */}
          <div>
            <label className="text-xs font-semibold text-bark">Mode</label>
            <div className="mt-1 flex gap-2">
              {(["physical", "virtual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      mode: m,
                      location: m === "physical" ? defaultLocation : form.location,
                      meeting_link: m === "virtual" ? form.meeting_link : "",
                    })
                  }
                  className={`rounded-xl px-4 py-1.5 text-xs font-semibold capitalize transition ${
                    form.mode === m
                      ? "bg-ember text-white"
                      : "border border-sand-line bg-sand text-bark hover:border-ember"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Physical: location */}
          {form.mode === "physical" && (
            <div>
              <label className="text-xs font-semibold text-bark">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className={inputCls}
              />
            </div>
          )}

          {/* Virtual: meeting link */}
          {form.mode === "virtual" && (
            <div>
              <label className="text-xs font-semibold text-bark">Meeting link <span className="font-normal text-moss">(can be added later)</span></label>
              <input
                type="url"
                value={form.meeting_link}
                onChange={(e) => setForm({ ...form, meeting_link: e.target.value })}
                placeholder="https://meet.google.com/…"
                className={inputCls}
              />
            </div>
          )}

          {/* Program file */}
          <div>
            <label className="text-xs font-semibold text-bark">Upload program</label>
            <div
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-sand-line bg-sand px-3 py-2.5 text-xs text-moss hover:border-ember"
              onClick={() => fileRef.current?.click()}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {programFile ? (
                <span className="truncate text-bark">{programFile.name}</span>
              ) : (
                <span>Choose file (PDF, Word, image…)</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => setProgramFile(e.target.files?.[0] ?? null)}
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
            The groups registered under {departmentLabel}. Each one's singers also count on the department's roll.
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
      showAlert("Singer added", `${member.name} now sings with the church choir.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      setShowAdd(false);
      loadChoir();
      onChanged();
    } else {
      showAlert("Could not add", data.detail || "The member could not be added to the church choir.", "error");
    }
  };

  const removeSinger = async (singer: ChoirMember) => {
    const result = await showAlert(
      "Remove from the church choir",
      `Take ${singer.name} off the church choir's roll? Their membership in the church is not affected.`,
      "question",
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/departments/choir/members/${singer.id}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      showAlert("Removed", `${singer.name} is off the church choir's roll.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      loadChoir();
      onChanged();
    } else {
      showAlert("Could not remove", "The member could not be removed from the church choir.", "error");
    }
  };

  const choirQuery = search.trim().toLowerCase();
  const visibleChoir = choirQuery
    ? members.filter((m) => `${m.name} ${m.username} ${m.phone_number} ${m.email}`.toLowerCase().includes(choirQuery))
    : members;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-line px-4 py-3">
        <h3 className="text-sm font-bold text-bark">Church Choir</h3>
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
          <p className="py-8 text-center text-xs text-moss">Loading the church choir…</p>
        ) : visibleChoir.length === 0 ? (
          <p className="py-8 text-center text-xs text-moss">
            {members.length === 0
              ? canManage
                ? "Nobody is on the church choir's roll yet. Use “Add singer” to build it."
                : "Nobody is on the church choir's roll yet."
              : "No choir member matches that search."}
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
          title="Add singers to the church choir"
          rollIds={new Set<number>()}
          excludeIds={new Set(members.map((m) => m.id))}
          takenLabel="Already in the choir"
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
  is_optional: boolean;
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
      is_optional: role.is_optional,
      is_custom: role.is_custom,
      people: role.holders.map((h) => ({ id: h.id, name: h.name, username: h.username, kind: h.kind })),
    }))
  );
  // Whether this account leads the area — the one seat that fills its custom
  // offices. The directory answers for the whole area; a unit's own read
  // answers again when the modal switches unit.
  const [canManageCustom, setCanManageCustom] = useState<boolean>(department.can_manage_custom ?? true);

  // In a department that runs as units, the board on screen is that unit's —
  // read from the API rather than taken from the directory, which carries the
  // department's board and not each unit's.
  useEffect(() => {
    if (!unit) return;
    // The read is abandoned when the modal switches unit again: the effect's
    // own signal is what stops a slower answer seating the wrong board.
    const controller = new AbortController();
    fetch(`${API_URL}/api/members/departments/${department.code}/leadership/${unitQuery(unit)}`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.roles) return;
        setCanManageCustom(data.can_manage_custom ?? true);
        setDraft(
          data.roles.map((role: DepartmentRoleRow) => ({
            id: role.id,
            name: role.name,
            has_assistant: role.has_assistant,
            is_optional: role.is_optional,
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
    return () => controller.abort();
  }, [department.code, unit]);
  // The two base positions the desk appoints by: the Leader seat every area
  // keeps, and the "Assistant" seat beside it where the area carries one.
  // Eldership sits under its three named offices instead of a generic
  // Leader, so neither is there.
  const leaderRole = draft.find((r) => !r.is_optional && r.name.toLowerCase() === "leader") ?? null;
  const assistantRole = draft.find((r) => !r.is_optional && r.name.toLowerCase() === "assistant") ?? null;
  // The area's own offices — every row that is not the base Leader or
  // Assistant: the seeded catalogue (Secretary, Treasurer, Choir Leader),
  // Eldership's three elders and the deaconate's two head seats.
  // Their seats are set by name, and (on the deaconate) by the member's sex,
  // the way the church reads the office.
  const officeRoles = draft.filter((r) => r.name.toLowerCase() !== "leader" && r.name.toLowerCase() !== "assistant");
  // Split the offices by who fills them. The church's elected seats — the
  // three elders, the deaconate's two heads — are set from this desk wherever
  // it can act; the area's own offices (Secretary, Treasurer, Choir Leader)
  // are its leader's to fill, so a church officer sees them named but not
  // pressable. The server refuses the seat all the same.
  const customRoles = officeRoles.filter((r) => r.is_custom);

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
        staged.push({ roleId: role.id, positionLabel: seatTitle(department.code, role.name, p.kind), person: p });
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
        `The ${seatTitle(department.code, role.name, seat)} is a ${seatSex === "male" ? "man" : "woman"}'s office.`,
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
          `${seatTitle(department.code, role.name, seat)} is ${holder.name}. Appointing ${member.name} replaces them at save.`,
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
            <h3 className="text-lg font-bold text-bark">Leadership: {department.label}</h3>
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
          {/* The area's own offices, named once: a church officer sees what
              the area carries but not the buttons — its leader fills them. */}
          {customRoles.length > 0 && !canManageCustom && (
            <p className="mt-2 text-[11px] text-moss">
              {customRoles.map((role) => role.name).join(", ")}{" "}
              {customRoles.length === 1 ? "is" : "are"} set by {department.label}&apos;s leader.
            </p>
          )}
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
                      {/* The seat's own word for its leader: Sabbath School
                          seats a superintendent, everywhere else a leader. */}
                      Set {seatTitle(department.code, leaderRole.name, "leader").toLowerCase()}
                    </button>
                  )}
                  {officeRoles
                    .filter((role) => canManageCustom || !role.is_custom)
                    .map((role) => {
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
                  {/* Only where the area carries the base Assistant seat
                      beside its Leader — Eldership's three offices are the
                      whole board, so no Set assistant there. */}
                  {assistantRole && (
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
              No appointments set yet. Search above, then set a position.
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
 * Give a roll member one or more of the area's seats — picked in one combo,
 * saved in one call.
 *
 * The roll's Actions popover opens this, and the modal is about the person
 * rather than the place: it names them and the roles they already hold, and
 * the seats they may be seated into ride a single combo with a checkbox
 * each. The offices are still the church's list — the base Leader and
 * Assistant pair and the seeded catalogue beside it (Secretary, Treasurer,
 * Choir Leader) — so nothing is typed here, and the save seats the member
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
  member: { id: number; name: string; sex?: string; office?: string | null };
  /** The unit the roll was reading, for a department that runs as units. */
  unit: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const roles = department.roles;
  // The seats ticked for this save — one person may hold more than one
  // office in the same area (its Treasurer and its Choir Leader, say), so
  // the combo ticks rather than switches.
  const [picked, setPicked] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [openCombo, setOpenCombo] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const comboPanelRef = useRef<HTMLDivElement>(null);
  // What the person already holds, church-wide: read from the same roster
  // the roll's other pickers read, so the modal says who they are before a
  // new seat is given them. ``null`` is "still reading".
  const [heldRoles, setHeldRoles] = useState<string[] | null>(null);
  const [heldAssistants, setHeldAssistants] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/members/users/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (!alive) return;
        const row = (Array.isArray(rows) ? rows : []).find((u: { id: number }) => u.id === member.id);
        setHeldRoles(row ? row.roles ?? (row.role ? [row.role] : []) : []);
        setHeldAssistants(row ? (row.assistant_roles ?? []) : []);
      })
      .catch(() => {
        if (alive) setHeldRoles([]);
      });
    return () => {
      alive = false;
    };
  }, [member.id]);

  // The combo's panel lives in the body (see ComboboxPopover), so a click
  // outside has to count the panel as inside — and Escape closes it from
  // wherever the reader is standing.
  useEffect(() => {
    if (!openCombo) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        comboRef.current && !comboRef.current.contains(target) &&
        !(comboPanelRef.current && comboPanelRef.current.contains(target))
      ) {
        setOpenCombo(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenCombo(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openCombo]);

  const chosen = roles.filter((role) => picked.includes(role.id));
  const toggleSeat = (roleId: number) =>
    setPicked((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );

  // The seats that ask the desk to know better: the deaconate's Head Deacon
  // is a man's office, its Head Deaconess a woman's — the same rule the
  // leadership modal and the server keep. A profile that records no sex
  // leaves the seat open and the desk to know.
  const seatSexOf = (role: DepartmentRoleRow) => SEAT_SEX_BY_OFFICE[role.name.toLowerCase()];
  const offSexSeat = (role: DepartmentRoleRow) => {
    const seatSex = seatSexOf(role);
    return Boolean(seatSex && member.sex && member.sex.toLowerCase() !== seatSex);
  };

  // What they hold, in one line: the seat this area already gave them (a
  // board row carries it), then their church-wide roles. "None" is the
  // roster's own word for holding no office at all.
  const wideRoles = heldRoles === null ? null : formatRoles(heldRoles, heldAssistants);
  const heldLine =
    wideRoles === null
      ? "Reading the roles they hold…"
      : [member.office, wideRoles === NO_ROLE_LABEL ? null : wideRoles].filter(Boolean).join(" · ") ||
        "No role held yet";

  const save = async () => {
    if (chosen.length === 0) return;
    const refused = chosen.find(offSexSeat);
    if (refused) {
      const seatSex = seatSexOf(refused);
      showAlert(
        "Not this office's to hold",
        `The ${refused.name} is a ${seatSex === "male" ? "man" : "woman"}'s office.`,
        "warning"
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/members/departments/${department.code}/leadership/`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: chosen.map((role) => ({ role_id: role.id, member_id: member.id, kind: "leader" })),
          unit: unit ?? "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not assign the role.");
      showAlert(
        "Role assigned",
        `${member.name} now holds ${chosen.map((role) => seatTitle(department.code, role.name, "leader")).join(", ")} in ${department.label}.`,
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
        <div className="flex items-center justify-between gap-3 border-b border-sand-line pb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-bark">Assign role</h3>
            {/* The person, not the place: their name and what they already
                hold. The area's own name rides the heading above the
                toggles, so it is not repeated here. */}
            <p className="truncate text-sm font-semibold text-bark">{member.name}</p>
            <p className="truncate text-[11px] text-moss">{heldLine}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-moss hover:text-bark" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <span className="text-xs font-semibold text-bark">Seats to give</span>
            {/* One combo with a checkbox per seat: the area's offices in a
                list the desk ticks through, rather than a stack of buttons
                that ran the modal the length of the screen. */}
            <div className="relative mt-1.5" ref={comboRef}>
              <button
                type="button"
                onClick={() => setOpenCombo((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={openCombo}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-sand-line bg-white px-3.5 py-2.5 text-left text-xs font-medium text-bark transition hover:border-ember focus:border-ember focus:outline-none"
              >
                <span className="min-w-0 truncate">
                  {chosen.length === 0
                    ? "Choose the seats to give…"
                    : chosen.map((role) => seatTitle(department.code, role.name, "leader")).join(", ")}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 text-moss transition-transform ${openCombo ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              <ComboboxPopover
                anchorRef={comboRef}
                panelRef={comboPanelRef}
                open={openCombo}
                minW={288}
                panelClassName="rounded-xl border border-sand-line bg-white shadow-lg overflow-hidden"
              >
                <div role="listbox" aria-multiselectable="true" className="max-h-72 w-72 overflow-y-auto">
                  {roles.map((role) => {
                    const checked = picked.includes(role.id);
                    const blocked = offSexSeat(role);
                    const seatSex = seatSexOf(role);
                    const seated = role.holders.filter((h) => h.kind === "leader" && h.id !== member.id);
                    return (
                      <button
                        key={role.id}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        aria-disabled={blocked}
                        disabled={blocked}
                        title={blocked ? `The ${role.name} is a ${seatSex === "male" ? "man" : "woman"}'s office.` : undefined}
                        onClick={() => toggleSeat(role.id)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition ${
                          checked ? "bg-mist-select font-semibold text-bark" : "text-moss-dark hover:bg-sand"
                        } ${blocked ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                            checked ? "border-ember bg-ember text-white" : "border-sand-mute bg-white"
                          }`}
                        >
                          {checked && (
                            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{seatTitle(department.code, role.name, "leader")}</span>
                          {seated.length > 0 && (
                            <span className="block truncate text-[10px] font-normal text-moss">
                              {seated.map((h) => h.name).join(", ")}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}

                  {/* The offices are the church's list, not the desk's: every
                      one this area carries is already above, so nothing is
                      added here. */}
                  {roles.length === 0 && (
                    <p className="px-3 py-2 text-[11px] italic text-moss-faint">
                      This area carries no offices yet.
                    </p>
                  )}
                </div>
              </ComboboxPopover>
            </div>
          </div>

          {/* A leader seat replaces its holder — the same rule the
              leadership modal asks about before staging. */}
          {chosen.map((role) => {
            const seated = role.holders.filter((h) => h.kind === "leader" && h.id !== member.id);
            if (seated.length === 0) return null;
            const title = seatTitle(department.code, role.name, "leader");
            return (
              <p key={role.id} className="rounded-xl border border-gold-soft bg-sand-cream px-3 py-2 text-[11px] text-bark">
                {title} is {seated.map((h) => h.name).join(", ")}. Saving gives it to {member.name}.
              </p>
            );
          })}
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
            disabled={saving || chosen.length === 0}
            className="rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-50"
          >
            {saving ? "Assigning…" : chosen.length > 1 ? `Assign ${chosen.length} roles` : "Assign role"}
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
      setError("Give the meeting a name, for example \"Midweek Vespers\" or \"Sabbath Worship\".");
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
          No weekly meetings yet. Add the ones the church keeps.
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
function AccountsFilterButton({
  value,
  onChange,
}: {
  value: "all" | "contributions" | "withdrawals";
  onChange: (v: "all" | "contributions" | "withdrawals") => void;
}) {
  const labels = {
    all: "All",
    contributions: "Contributions",
    withdrawals: "Withdrawals",
  };

  return (
    <FilterPopover
      summary={
        value !== "all"
          ? value === "contributions"
            ? "Contributions"
            : "Withdrawals"
          : "All"
      }
      active={value !== "all"}
      title="Filter transactions"
    >
      {[
        { key: "all" as const, label: "All" },
        { key: "contributions" as const, label: "Contributions" },
        { key: "withdrawals" as const, label: "Withdrawals" },
      ].map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => {
            onChange(item.key);
          }}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${value === item.key ? "bg-sand-linen text-ember" : "text-bark hover:bg-sand"}`}
        >
          <span>{item.label}</span>
          {value === item.key && <span className="text-ember font-bold">✓</span>}
        </button>
      ))}
    </FilterPopover>
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
 * One ledger line as this panel reads it — the description minus what the
 * panel already says.
 *
 * The opened ministry/department is named in the panel's own header, so the
 * account name in brackets goes at every width; a withdrawal's reason goes
 * too — the movement itself is the whole line ("Withdrawal"). A phone reads
 * the shortest form, the giver's name alone, since its row folds the date
 * and status beneath instead of carrying the table's separate columns.
 */
function ledgerLine(item: UnifiedAccountItem, wide: boolean, outflowWord = "Withdrawal"): string {
  const text = (item.description || "").trim();
  if (item.category === "withdrawal") {
    // A request still waiting carries its reason as the description; the
    // movement's own name is the whole line, the reason never being asked.
    if (item.reference === "Withdrawal request" || item.reference === "Funding request") {
      return outflowWord;
    }
    // "Withdrawal for <area>: <reason>" (and the reversal of it) → the kind.
    const head = text.split(":")[0].replace(/\s+for\s+.+$/i, "").trim();
    if (/^withdrawal$/i.test(head)) return outflowWord;
    return head || outflowWord;
  }
  // Contribution lines read "<giver> — <method> (<account>)".
  const dash = text.indexOf(" — ");
  if (dash === -1) return text.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const giver = text.slice(0, dash).trim();
  if (!wide) return giver;
  const tail = text.slice(dash + 3).replace(/\s*\([^)]*\)\s*$/, "").trim();
  return tail ? `${giver} — ${tail}` : giver;
}

/**
 * The department's own fund — the Account Status view of its desk.
 *
 * Displays both financial movements (contributions & debits) and withdrawal requests
 * with real-time status badges (Pending, Elder Approved, Approved, Declined —
 * and a reversal reads here as Rejected, the department never having kept the money).
 */
export function DepartmentAccountsPanel({
  department,
  onChanged,
  search = "",
  typeFilter = "all",
  showInlineControls = false,
  className = "flex min-h-0 flex-1 flex-col rounded-2xl border border-sand-line bg-white shadow-sm h-full sm:overflow-hidden",
}: {
  department: { code: string; label: string };
  onChanged?: () => void;
  /** The fund ledger's search, owned by the desk so it rides the header band. */
  search?: string;
  /** Category filter: all, contributions, or withdrawals. */
  typeFilter?: "all" | "contributions" | "withdrawals";
  showInlineControls?: boolean;
  className?: string;
}) {
  const isDeaconate = department.code === "deaconate";
  const [accounts, setAccounts] = useState<DepartmentAccountInfo[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [movements, setMovements] = useState<FundMovement[]>([]);
  const [withdrawals, setWithdrawals] = useState<FundWithdrawal[]>([]);
  const [canRequest, setCanRequest] = useState(false);
  // A fund drive is the desk's own campaign to raise money — the leadership's
  // to start, unlike the request line, which follows the fund itself.
  const [canStartDrive, setCanStartDrive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showDriveForm, setShowDriveForm] = useState(false);
  const [driveAccount, setDriveAccount] = useState<DepartmentAccountInfo | null>(null);
  const [withdrawAccountId, setWithdrawAccountId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const [internalTypeFilter, setInternalTypeFilter] = useState<"all" | "contributions" | "withdrawals">("all");
  const rowPad = densityCellPad();

  const effectiveSearch = (search && search.trim() !== "") ? search : internalSearch;
  const effectiveTypeFilter = typeFilter !== "all" ? typeFilter : internalTypeFilter;

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
        setCanStartDrive(Boolean(data?.can_start_fund_drive));

        // Initial default account filter:
        // The desks that read more than their own fund — AWM and Development,
        // the Eldership, Deaconate, Clerkship and Education desks, whose strips
        // carry LCB and the welfare and outreach funds beside their own, and
        // the Treasury desk, which keeps every account — are selected by
        // default ("all").
        // For other departments, their primary account is selected by default, or "all".
        if (["awm", "development", "eldership", "deaconate", "clerkship", "education", "treasury"].includes(department.code)) {
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
        setCanStartDrive(false);
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

  // Both buttons open the one form — the footer's and the one the shell
  // draws at the far right of the toggles strip.
  const openWithdraw = useCallback(() => {
    if (withdrawAccountId === null && accounts.length > 0) {
      const primary = accounts.find((a) => a.is_primary) ?? accounts[0];
      setWithdrawAccountId(primary.id);
    }
    setShowWithdrawModal(true);
  }, [withdrawAccountId, accounts]);

  // A second Request Withdrawal at the toggles strip's far right — a PC
  // convenience beside the one in the footer, pointing at the same modal,
  // and never the only way to reach it: the shell draws that slot on large
  // screens only (hidden below lg), so a phone keeps the footer's.
  const { setTogglesRightAction } = usePageHeader();
  useEffect(() => {
    if (!canRequest) return;
    setTogglesRightAction(
      <button
        type="button"
        onClick={openWithdraw}
        className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-ember-deep"
      >
        {isDeaconate ? <Wallet className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
        {isDeaconate ? "Request funding" : "Request withdrawal"}
      </button>
    );
    return () => setTogglesRightAction(null);
  }, [canRequest, openWithdraw, isDeaconate, setTogglesRightAction]);

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
      if (onChanged) onChanged();
    } catch (error) {
      showAlert("Could not send the request", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const movementQuery = effectiveSearch.trim().toLowerCase();

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
    if (effectiveTypeFilter === "contributions") {
      list = list.filter((item) => item.category === "contribution");
    } else if (effectiveTypeFilter === "withdrawals") {
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
  }, [unifiedItems, accountFilter, effectiveTypeFilter, movementQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePageNum = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((safePageNum - 1) * PAGE_SIZE, safePageNum * PAGE_SIZE);

  const selectedAccountInfo = useMemo(() => {
    if (accountFilter === "all") return null;
    return accounts.find((a) => String(a.id) === String(accountFilter)) ?? null;
  }, [accounts, accountFilter]);

  const startableDriveAccount = useMemo(() => {
    const chosen = selectedAccountInfo && !selectedAccountInfo.is_lcb ? selectedAccountInfo : null;
    return chosen ?? accounts.find((a) => !a.is_lcb) ?? null;
  }, [accounts, selectedAccountInfo]);

  const openDriveForm = useCallback(() => {
    if (!startableDriveAccount) return;
    setDriveAccount(startableDriveAccount);
    setShowDriveForm(true);
  }, [startableDriveAccount]);

  const totalBalance = useMemo(() => {
    return accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  }, [accounts]);

  const displayedBalance = selectedAccountInfo ? Number(selectedAccountInfo.balance) : totalBalance;

  const statusBadge = (status: UnifiedAccountItem["status"]) => {
    // The department reads a reversal as a rejection: from its side of the
    // counter the money never stayed released, so the ask was turned down —
    // the treasury's own desk keeps the word "Reversed", which is what its
    // action was called there.
    const map: Record<string, string> = {
      completed: "bg-sand text-moss",
      pending: "bg-amber-50 text-amber-800",
      elder_approved: "bg-mist-select text-bark",
      approved: "bg-green-50 text-green-800",
      declined: "bg-red-50 text-red-700",
      reversed: "bg-red-50 text-red-700",
    };
    const labels: Record<string, string> = {
      completed: "Completed",
      pending: "Pending",
      elder_approved: "Elder Approved",
      approved: "Approved",
      declined: "Declined",
      reversed: "Rejected",
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
    <div className={className}>
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
          {/* Optional inline search and filter row for standalone/mobile views */}
          {showInlineControls && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-sand-line bg-sand/20 px-4 py-2.5">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-moss" />
                <input
                  type="text"
                  value={internalSearch}
                  onChange={(e) => {
                    setInternalSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search transactions, reference…"
                  aria-label="Search transactions"
                  className="w-full rounded-xl border border-sand-mute bg-white pl-8 pr-3 py-1.5 text-xs outline-none focus:border-ember"
                />
              </div>
              <AccountsFilterButton
                value={effectiveTypeFilter}
                onChange={(v) => {
                  setInternalTypeFilter(v);
                  setPage(1);
                }}
              />
            </div>
          )}

          {/* Account Filter Switcher Tabs: when more than 1 account is accessible */}
          {accounts.length > 1 && (
            <div className={`flex shrink-0 items-center gap-1.5 border-b border-sand-line bg-sand/30 px-4 py-2 text-xs overflow-x-auto ${showInlineControls ? "" : "rounded-t-2xl"}`}>
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
                  title={acc.description || acc.name}
                >
                  {acc.name}{" "}
                  <span className={accountFilter === String(acc.id) ? "text-white/80 font-normal" : "text-moss font-normal"}>
                    (KES {Number(acc.balance).toLocaleString("en-KE", { minimumFractionDigits: 0 })})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Contained Scrollable Unified Ledger Table: Only Rows Scroll.

              A phone reads two of these columns: the description, and the
              amount the panel exists to show. The description's own box is
              what carries the width (see the row below), because a table
              column is never narrower than its content and the description's
              is nowrap — a long payee's name would otherwise widen the row and
              carry the amount off the card, where the card's overflow leaves
              it with nowhere to scroll to. From sm the other three columns are
              back and every column sizes itself as before. */}
          <div className={`flex-1 min-h-0 overflow-x-auto overflow-y-auto custom-table-scrollbar ${showInlineControls || accounts.length > 1 ? "" : "rounded-t-2xl"}`}>
            {unifiedItems.length === 0 ? (
              <p className="px-4 py-16 text-center text-xs text-moss">No transactions recorded in this fund yet.</p>
            ) : visibleItems.length === 0 ? (
              <p className="px-4 py-16 text-center text-xs text-moss">No transaction matches that filter or search.</p>
            ) : (
              <table className="w-full text-left text-xs sm:min-w-[520px]">
                <thead className="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-xs">
                  <tr>
                    <th className="hidden px-4 py-3 sm:table-cell">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Reference / Type</th>
                    <th className="px-4 py-3 text-right">Amount (KES)</th>
                    <th className="hidden px-4 py-3 text-center sm:table-cell">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sand-soft bg-white">
                  {visibleItems.map((item) => (
                    <tr key={item.key} className="transition hover:bg-sand-linen/60">
                      <td className={`hidden whitespace-nowrap px-4 ${rowPad} text-moss font-mono text-[11px] sm:table-cell`}>
                        {dayFirstTime(item.date)}
                      </td>
                      <td className={`px-4 ${rowPad} font-medium text-bark`}>
                        <div className="flex items-center gap-1.5">
                          {item.isOutflow ? (
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ember" />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-moss-dark" />
                          )}
                            {/* A phone holds this box to a width of its own: the
                                viewport less the amount column's own room and
                                the two paddings beside it. The column then
                                sizes to that box rather than to the name's own
                                width, so the name ellipsises and the amount
                                keeps its place on screen however long the name
                                is. Written against the viewport because the
                                card's width is the device's; from sm the box is
                                auto again and the cell sizes as it always did. */}
                          <div className="w-[calc(100vw-16rem)] min-w-0 sm:w-auto">
                            {/* The line trimmed to what this panel doesn't
                                already say — see ledgerLine. */}
                            <span className="hidden truncate sm:inline" title={ledgerLine(item, true, isDeaconate ? "Funding" : "Withdrawal")}>
                              {ledgerLine(item, true, isDeaconate ? "Funding" : "Withdrawal")}
                            </span>
                            <span className="block truncate sm:hidden">
                              {ledgerLine(item, false, isDeaconate ? "Funding" : "Withdrawal")}
                            </span>
                            {item.requestedBy && item.status !== "completed" && (
                              <span className="ml-1.5 text-[10px] text-moss-faint">
                                (by {item.requestedBy})
                              </span>
                            )}
                            {item.reply && (item.status === "declined" || item.status === "approved") && (
                              <p className="text-[10px] italic text-moss-faint">{item.reply}</p>
                            )}
                            {/* Phone: the date and status fold under the
                                description — the row's other columns stand
                                aside so nothing is cut off widthwise, and the
                                reference (a receipt number) stays a wide
                                screen's column rather than a phone's noise. */}
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-normal text-moss-faint sm:hidden">
                              <span>{dayFirstTime(item.date)}</span>
                              {statusBadge(item.status)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={`hidden whitespace-nowrap px-4 ${rowPad} text-moss-faint text-[11px] sm:table-cell`}>
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
                      <td className={`hidden whitespace-nowrap px-4 ${rowPad} text-center sm:table-cell`}>
                        {statusBadge(item.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom footer — balance + pagination in middle + request button
              (single row). On a phone it stays put: sticky against the scroll
              it sits in (lifted clear of the bottom tab bar), so the Drive and
              Withdraw buttons never scroll out of reach behind the ledger. */}
          <div className="sticky bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-20 shrink-0 rounded-b-2xl border-t border-sand-line bg-white px-4 py-2.5 md:bottom-0 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left — balance */}
              <div className="flex min-w-0 items-center gap-x-2 text-xs text-moss">
                <span>
                  {selectedAccountInfo ? `${selectedAccountInfo.description || selectedAccountInfo.name} Balance:` : "Total Balance:"}{" "}
                  <strong className="text-ember font-bold">
                    KES {displayedBalance.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </strong>
                </span>
                {isDeaconate && (
                  <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase text-moss">
                    LCB
                  </span>
                )}
              </div>

              {/* Middle — pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 text-xs text-moss">
                  <button
                    type="button"
                    disabled={safePageNum <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-sand-line px-2.5 py-1 font-semibold text-bark transition hover:bg-sand disabled:opacity-30"
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  <span className="px-1 font-medium">
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

              {/* Right — request button */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {canStartDrive && startableDriveAccount && (
                  <button
                    type="button"
                    onClick={openDriveForm}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sage px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sage-deep sm:px-4"
                  >
                    <Megaphone className="h-4 w-4" />
                    <span className="sm:hidden">Fund Drive</span>
                    <span className="hidden sm:inline">Start fund drive</span>
                  </button>
                )}
                {canRequest ? (
                  <button
                    type="button"
                    onClick={openWithdraw}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-ember-deep sm:px-4"
                  >
                    {isDeaconate ? <Wallet className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                    <span className="sm:hidden">{isDeaconate ? "Request" : "Withdraw"}</span>
                    <span className="hidden sm:inline">{isDeaconate ? "Request funding" : "Request withdrawal"}</span>
                  </button>
                ) : (
                  // Reachable only if a fund ever arrives without a door to
                  // it: the button follows the account, not the office.
                  <span className="text-[11px] italic text-moss-faint">No fund to request from</span>
                )}
              </div>
            </div>
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
                        {acc.description || acc.name}: KES {Number(acc.balance).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
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

      {showDriveForm && driveAccount && (
        <CampaignManagement
          mode="admin"
          formOnly
          openCreate
          allowCreateRequest
          approvalRequired
          presetAccount={driveAccount.name}
          presetAccountId={driveAccount.id}
          presetAccountLabel={driveAccount.description || driveAccount.name}
          sourceDepartment={department.code}
          onCreated={() => {
            setShowDriveForm(false);
            setDriveAccount(null);
          }}
          onClosed={() => {
            setShowDriveForm(false);
            setDriveAccount(null);
          }}
        />
      )}
    </div>
  );
}


/**
 * The views a department desk reads: the strip's keys, and what a deep link
 * may name. The elders' three (baptismal class, daily word, announcements)
 * ride here so the area opens the same way whether it was entered from the
 * dashboard, the rail, or the Ministry map — one desk, one set of views.
 */
type DeptSubTab =
  | "members"
  | "calendar"
  | "moments"
  | "meetings"
  | "singing_groups"
  | "choir"
  | "accounts"
  | "lesson-orders"
  | "baptismal-class"
  | "daily-word"
  | "announcements";

function DepartmentDetail({
  department,
  onChanged,
  initialTab = "members",
  onBack,
  embedded = false,
}: {
  department: DepartmentRow;
  onChanged: () => void;
  initialTab?: DeptSubTab;
  /**
   * The way back out of the area, shown as the heading's leading arrow on a
   * phone — where the rail that opened it is out of sight. Left unset the
   * desk falls back to the hub's own directory.
   */
  onBack?: (() => void) | null;
  /**
   * The desk is one view of a larger one — the deaconate's Team page, which
   * the deaconate desk draws under its own strip. It then keeps its views to
   * itself: the strip above names them, so a second one here would trade the
   * desk's pages for the hub's few under the name of the page it opened.
   */
  embedded?: boolean;
}) {
  const units = department.units ?? [];
  // Personal Ministries runs the church's weekly rhythm, so the church's own
  // week is kept on its page — see WeeklyMeetingsPanel.
  const keepsTheWeek = department.code === "personal_ministries";
  // Music is the church's singing, and it sings in groups: the register of
  // singing groups is a music-desk view, not a general department one.
  const isMusic = department.code === "music";
  const isSabbathSchool = department.code === "sabbath_school" || department.code === "sabbath-school";
  // The Deaconate reads as one page *in the console*: its Team view is the
  // roll itself, and the console's own Deaconate strip above already names
  // Team / Inventory / Duty Rota / Calendar. The hub's Members / Calendar /
  // Accounts toggles would only repeat the page under them there, so they are
  // held back — but only while that strip is the one naming the desk (see the
  // toggles effect). Opened from the Ministry map, where no console strip
  // exists, the desk draws its own views as every other area's does: a phone
  // has no rail to offer them, and the desk would otherwise arrive with no way
  // to reach its calendar or its accounts at all.
  const isDeaconate = department.code === "deaconate";
  const onConsole = usePathname().startsWith("/administration");
  // Whether the console's own strip already names the deaconate's pages: it
  // does on every one of them (`?tab=deaconate-*`), and not on the desk opened
  // by department.
  const consoleTab = useSearchParams()?.get("tab") ?? null;
  const onADeaconatePage = deaconateViews.some((page) => page.tab === consoleTab);
  // Which unit's desk is open; null is the whole department.
  const [unit, setUnit] = useState<string | null>(null);
  // The unit's own leadership, when one is selected: the directory's board is
  // the department's, and a unit has its own leader.
  const [unitBoard, setUnitBoard] = useState<{ leader: Holder | null; assistants: Holder[] } | null>(null);
  const [roll, setRoll] = useState<RollMember[]>([]);
  const [events, setEvents] = useState<DeptEvent[]>([]);
  // The areas this desk may file an event into, when it may file beyond its
  // own calendar — the personal ministries desk keeps the church's week, so
  // its events land on the ministry that will run them. The server decides:
  // an empty list means this desk writes its own calendar only.
  const [eventDepartments, setEventDepartments] = useState<{ code: string; label: string }[]>([]);
  const [loadingRoll, setLoadingRoll] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [churchName, setChurchName] = useState("SDA Church Loma Linda, Meru");
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
  // The elders' own three — the register being prepared for the font, the
  // thought the church reads today, and the board of announcements — are
  // office desks of the eldership. They ride this desk's strip so an area
  // opened from the dashboard, the rail or the Ministry map is one view with
  // one set of views behind it, and they stay behind the roles the rail
  // names for them: elder, clerk, admin.
  const viewerRoles = (Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || ""]).map((role) =>
    role.toLowerCase().trim()
  );
  const canOpenOfficeViews =
    department.code === "eldership" && viewerRoles.some((role) => ["elder", "clerk", "admin"].includes(role));
  // May this viewer document a moment from the desk? The same answer the
  // server gives on the POST — administrators, and the deaconate, whose desk
  // holds the pictures of the church's days — so the button never appears
  // where it would come back refused.
  const canDocumentMoments = Boolean(
    me &&
      (me.is_staff ||
        me.is_superuser ||
        viewerRoles.includes("admin") ||
        (isDeaconate && onRoll)),
  );
  const [subTab, setSubTab] = useState<DeptSubTab>(initialTab);
  // A deep link may name a view the reader is not entitled to; the strip
  // withholds it, and the desk says why rather than showing an empty panel.
  const officeViewBlocked =
    (subTab === "baptismal-class" || subTab === "daily-word" || subTab === "announcements") &&
    !canOpenOfficeViews;
  const [accountsFilter, setAccountsFilter] = useState<"all" | "contributions" | "withdrawals">("all");
  // The members view holds the roll *and* the asks to join it, so the desk
  // reads one list and narrows it here rather than opening a second view.
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  // The join asks raised from the rail, answered on this desk.
  const [joinRequests, setJoinRequests] = useState<JoinRequestRow[]>([]);
  // The reply each ask is being answered with, and which ask is in flight.
  const [joinsReplies, setJoinsReplies] = useState<Record<number, string>>({});
  const [busyJoinId, setBusyJoinId] = useState<number | null>(null);

  // The strip names the view, and which unit's roll it reads: All Members and
  // the unit fellowships read their roll, the rest name the view itself. This
  // is what marks the active toggle in the merged strip.
  const activeStripKey = subTab === "members" ? (unit === null ? "unit:null" : `unit:${unit}`) : subTab;
  // The roll's and the calendar's search boxes.
  const [rollSearch, setRollSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  // The calendar reads as the church's does: the list leads (cards on a
  // phone, a table on a desk), and the month wall-grid is one toggle away.
  const [calendarView, setCalendarView] = useState<CalendarView>("table");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [openGridAction, setOpenGridAction] = useState<string | null>(null);
  const shiftCalendarMonth = (amount: number) =>
    setCalendarMonth((selected) => new Date(selected.getFullYear(), selected.getMonth() + amount, 1));
  // The list's rows and the grid's month both honour the desk's search.
  const filteredEvents = useMemo(() => {
    const needle = eventSearch.trim().toLowerCase();
    return events.filter((event) =>
      `${event.title} ${event.date} ${event.location || ""} ${event.notes || ""}`.toLowerCase().includes(needle),
    );
  }, [events, eventSearch]);
  const monthEvents = useMemo(() => {
    const prefix = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-`;
    return filteredEvents.filter((event) => (event.date ?? "").startsWith(prefix));
  }, [filteredEvents, calendarMonth]);
  const [choirSearch, setChoirSearch] = useState("");
  const [groupsSearch, setGroupsSearch] = useState("");
  const [accountsSearch, setAccountsSearch] = useState("");
  const [meetingsSearch, setMeetingsSearch] = useState("");

  const rowPad = densityCellPad();

  const [canManageRoll, setCanManageRoll] = useState(false);

  // Inject the search bar into the AppFrame page header's right slot — the
  // shell draws the title and description; we slot the search beside them.
  const { setHeaderRightAction, setCustomToggles, setTogglesRightAction, setCustomHeader, setHeadingFirst } = usePageHeader();
  const router = useRouter();

  /** A roll row's Chat here: open the DM, then land in it — the roster's
      own flow, so a person is reached the same way from either view of the
      ministry. */
  const chatWith = async (memberId: number) => {
    try {
      await openConversation({ kind: "dm", member_id: memberId });
      router.push(`/chat?dm=${memberId}`);
    } catch (error) {
      showAlert("Could not open chat", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  /** WhatsApp reaches them by whatever number the church holds, digits only
      in the international form wa.me needs (07… becomes 2547…). */
  const waOf = (row: RollRow) => {
    const raw = (row.whatsapp_number || row.phone_number || "").replace(/\D/g, "");
    return raw ? (raw.startsWith("0") ? `254${raw.slice(1)}` : raw) : "";
  };
  useEffect(() => {
    const inputCls = "min-w-0 w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-64";
    if (subTab === "members") {
      setHeaderRightAction(
        // One row on a phone: the roll's filter is already a popover of its
        // own, so the search takes what is left of the line rather than a
        // fixed width that pushed itself off the edge.
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <MembersFilterButton
            value={memberFilter}
            onChange={setMemberFilter}
            pending={joinRequests.filter((row) => row.status === "pending").length}
          />
          <input
            type="text"
            value={rollSearch}
            onChange={(e) => setRollSearch(e.target.value)}
            placeholder="Search members…"
            className="min-w-0 flex-1 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-64 sm:flex-none"
          />
        </div>
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
    } else if (subTab === "choir") {
      // The church choir's roll searches from the same place every other
      // view's does — the shell's header band, beside the page's name.
      setHeaderRightAction(
        <input
          type="text"
          value={choirSearch}
          onChange={(e) => setChoirSearch(e.target.value)}
          placeholder="Search the church choir…"
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
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <input
            type="text"
            value={accountsSearch}
            onChange={(e) => setAccountsSearch(e.target.value)}
            placeholder="Search account…"
            className="min-w-0 flex-1 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-56 sm:flex-none"
            aria-label="Search account"
          />
          <AccountsFilterButton
            value={accountsFilter}
            onChange={setAccountsFilter}
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
    memberFilter,
    joinRequests,
    choirSearch,
    groupsSearch,
    accountsSearch,
    accountsFilter,
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
        ? [{ key: "unit:null", label: "All Members", short: "Members", icon: Users }]
        : []),
      ...names.map((name) => ({ key: `unit:${name}`, label: name, icon: Users })),
      // A desk without units keeps the roll named "All Members".
      ...(names.length === 0 ? [{ key: "members", label: "All Members", short: "Members", icon: Users }] : []),
      // Music sings in more than one voice: the choir's own roll and the
      // groups registered under it each get a view beside the roll.
      ...(isMusic ? [{ key: "choir", label: "Church Choir", icon: Music }] : []),
      ...(isMusic ? [{ key: "singing_groups", label: "Singing Groups", icon: MicVocal }] : []),
      ...(isSabbathSchool ? [{ key: "lesson-orders", label: "Lesson Orders", short: "Orders", icon: BookOpen }] : []),
      // The join asks no longer carry a view of their own: they ride the
      // members list, where the desk filters to them and answers from the
      // row (see MembersFilterButton).
      { key: "calendar", label: "Event Calendar", short: "Events", icon: CalendarDays },
      // Moments — every ministry and department keeps its door to the
      // church's wall of days, except the two office record desks (Treasury
      // and Clerkship), whose work is books rather than the church's days.
      ...(areaHasMoments(department.code)
        ? [{ key: "moments", label: "Moments", short: "Moments", icon: Sparkles }]
        : []),
      // The fund ledger and withdrawal requests unified under one desk.
      { key: "accounts", label: "Account Status", short: "Account", icon: Wallet },
      // Only the ministry that keeps the church's week carries its panel.
      ...(keepsTheWeek ? [{ key: "meetings", label: "Weekly Meetings", short: "Meetings", icon: Clock }] : []),
      // The eldership's own three, gated to the roles that hold them.
      ...(canOpenOfficeViews
        ? [
            { key: "baptismal-class", label: "Baptismal Class", short: "Baptism", icon: Droplets },
            { key: "daily-word", label: "Daily Word", short: "Word", icon: BookOpen },
            { key: "announcements", label: "Announcements", short: "News", icon: Megaphone },
          ]
        : []),
    ];
  }, [unitsKey, isMusic, isSabbathSchool, keepsTheWeek, canOpenOfficeViews, department.code]);

  const handleStripChange = useCallback((key: string) => {
    // A unit key selects the unit and lands the desk on its roll; a plain key
    // is a view of the department as the strip held before.
    if (key.startsWith("unit:")) {
      setUnit(key === "unit:null" ? null : key.slice(5));
      setSubTab("members");
      return;
    }
    setSubTab(key as DeptSubTab);
  }, []);
  // On a phone the area names itself above the strip it answers to: the
  // shell's heading band carries the area's name — with the way back out of
  // it on its own line, where the rail that opened the desk is out of sight —
  // and sits over the toggles rather than under them, so a ministry opened
  // from the map, the rail or a deep link always says where the reader is.
  //
  // The back handler rides a ref: a caller passing an inline arrow would
  // otherwise hand this effect a new dependency on every render and loop it
  // through the shell's header state, exactly as the header warns.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);
  useEffect(() => {
    setHeadingFirst(true);
    setCustomHeader({
      label: department.label,
      description: department.description || DEPARTMENT_BLURBS[department.code],
      leading: onBackRef.current ? (
        <button
          type="button"
          onClick={() => onBackRef.current?.()}
          aria-label="Back"
          className="inline-flex items-center text-moss transition hover:text-bark lg:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : undefined,
    });
    return () => {
      setCustomHeader(null);
      setHeadingFirst(false);
    };
  }, [department.code, department.label, department.description, setCustomHeader, setHeadingFirst]);

  useEffect(() => {
    // A desk that is one view of a larger one leaves the strip to it entirely
    // — it neither draws one nor clears one, because the desk around it owns
    // that state and a writing here would wipe the strip it just drew
    // (a child's effect runs first, and one that runs again on its own data
    // would take the desk's pages down with it).
    if (embedded) return;
    // The deaconate's pages are five console pages, and the console's own strip
    // names them wherever the address bar lands on one of them. A link that
    // opens the desk by department (`?tab=leaders&dept=deaconate`) resolves to
    // no section, so the desk would arrive with a roll and no door to its
    // register, its rota or its funding: there it names the same five itself,
    // in the same order, each opening the page the rail opens.
    if (isDeaconate && onConsole) {
      if (onADeaconatePage) {
        setCustomToggles(null);
        return;
      }
      setCustomToggles(
        <SectionNav
          label="Deaconate pages"
          activeHref={null}
          items={deaconateViews.map((page) => ({
            key: page.tab,
            href: `/administration?tab=${page.tab}`,
            label: page.label,
            short: page.short,
            icon: page.icon,
            help: page.label,
          }))}
        />
      );
      return () => setCustomToggles(null);
    }
    setCustomToggles(
      <SubNav label="Department views" items={stripItems} value={activeStripKey} onChange={handleStripChange} />
    );
    return () => setCustomToggles(null);
  }, [
    setCustomToggles,
    embedded,
    isDeaconate,
    onConsole,
    onADeaconatePage,
    stripItems,
    activeStripKey,
    handleStripChange,
  ]);

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
      .then((data) => {
        setEvents(data.events || []);
        if (data.church_name) setChurchName(data.church_name);
        setEventDepartments(Array.isArray(data.departments) ? data.departments : []);
      })
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

  const removeChild = async (childId: number, childName: string) => {
    const result = await showAlert(
      "Remove child record",
      `Remove ${childName} from the children's ministry record?`,
      "question",
      { showCancelButton: true, confirmButtonText: "Remove", cancelButtonText: "Cancel", confirmButtonColor: brand.ember }
    );
    if (!result.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/children/records/${childId}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      showAlert("Removed", `${childName} has been removed.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
      loadRoll();
      onChanged();
    } else {
      showAlert("Could not remove", "The child record could not be removed.", "error");
    }
  };

  const addEvent = async (event: {
    title: string;
    date: string;
    time: string;
    end_date: string;
    end_time: string;
    mode: string;
    location: string;
    meeting_link: string;
    department: string;
    program_file: File | null;
  }) => {
    const body = new FormData();
    body.append("title", event.title);
    body.append("date", event.date);
    body.append("time", event.time);
    body.append("end_date", event.end_date);
    body.append("end_time", event.end_time);
    body.append("mode", event.mode);
    body.append("location", event.location);
    body.append("meeting_link", event.meeting_link);
    body.append("unit", unit ?? "");
    // Which area's calendar holds it. Left off, the server files it with the
    // desk that wrote it; the personal ministries desk may name another and
    // the server refuses anyone else who tries.
    body.append("department", event.department);
    if (event.program_file) body.append("program_file", event.program_file);
    const res = await fetch(`${API_URL}/api/members/departments/${department.code}/events/`, {
      method: "POST",
      headers: authHeaders(),
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const filedInto = eventDepartments.find((row) => row.code === event.department)?.label ?? department.label;
      showAlert("Event added", `"${event.title}" is on the ${filedInto} calendar.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
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

  /**
   * The desk's answer to an ask to join, taken from the row itself: approve
   * (onto the roll) or decline, with the reply the member reads on their own
   * rail. The asks used to have a view of their own; they now answer here.
   */
  const answerRequest = async (id: number, status: "approved" | "rejected") => {
    setBusyJoinId(id);
    try {
      const res = await fetch(`${API_URL}/api/members/department-join-requests/${id}/`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status, reply: joinsReplies[id] ?? "" }),
      });
      if (res.ok) {
        showAlert(
          status === "approved" ? "Approved" : "Declined",
          status === "approved"
            ? "The member is on the roll and has been told."
            : "The member has been told.",
          "success",
        );
        setOpenMenuKey(null);
        loadJoinRequests();
        loadRoll();
        onChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        showAlert("Not answered", data.detail || "Could not save the answer.", "error");
      }
    } catch {
      showAlert("Error", "Could not reach the server.", "error");
    } finally {
      setBusyJoinId(null);
    }
  };

  const rollIds = new Set<number>(
    roll.map((m) => m.id).filter((id): id is number => typeof id === "number")
  );

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
    const keyOf = (person: { username?: string; id?: number | string }) =>
      (person.username || `id:${person.id ?? ""}`).toLowerCase();
    const seen = new Set<string>();
    const rows: RollRow[] = [];
    const boardPeople: { holder: Holder; office: string }[] = [
      ...(board.leader
        ? [{ holder: board.leader, office: seatTitle(department.code, board.leader.position, "leader") }]
        : []),
      ...board.assistants.map((assistant) => ({
        holder: assistant,
        // A leader-kind row here is the department's second office (the
        // deaconate's Head Deaconess beside its Head Deacon), not someone
        // assisting one — so it keeps its own name rather than reading
        // "Head Deaconess · Assistant" for a seat that takes no assistant.
        office: seatTitle(department.code, assistant.position, assistant.kind),
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
        whatsapp_number: memberMatch?.whatsapp_number ?? "",
        sex: holder.gender || memberMatch?.gender || "",
        office,
        role: office || memberMatch?.role || null,
        class: memberMatch?.class || memberMatch?.unit || null,
        unit: memberMatch?.unit || null,
        child_id: memberMatch?.child_id || null,
        is_child: memberMatch?.is_child || false,
        age: memberMatch?.age ?? null,
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
        whatsapp_number: member.whatsapp_number ?? "",
        sex: member.gender,
        office: null,
        role: member.role || null,
        class: member.class || member.unit || null,
        unit: member.unit || null,
        child_id: member.child_id || null,
        is_child: member.is_child || false,
        age: member.age ?? null,
        via: member.via ?? null,
        member,
      });
    }
    return rows;
  })();

  /**
   * The members view in one list: the roll (its board first), the asks still
   * waiting on an answer — those are never hidden, the desk must be able to
   * answer them — and asks already answered whose member is not on the roll.
   * An ask answered with an approval lands on the roll, so its row is the
   * roll's; keeping a second copy would read as two people.
   */
  const memberRows: RollRow[] = (() => {
    const onRollIds = new Set(rollRows.map((row) => row.id));
    const asks: RollRow[] = joinRequests
      .filter((ask) => ask.status === "pending" || !onRollIds.has(ask.member_id))
      .map((ask) => ({
        key: `ask:${ask.id}`,
        id: ask.member_id,
        name: ask.member_name,
        username: "",
        email: ask.member_email,
        phone_number: ask.member_phone,
        whatsapp_number: "",
        sex: "",
        office: null,
        role: null,
        via: null,
        member: null,
        request: ask,
      }));
    const asked = [...asks].sort((a, b) =>
      (a.request?.created_at ?? "").localeCompare(b.request?.created_at ?? ""),
    );
    return [...rollRows, ...asked];
  })();

  const memberFiltered = memberRows.filter((row) => {
    if (memberFilter === "requests") return row.request?.status === "pending";
    if (memberFilter === "approved") return !row.request || row.request.status === "approved";
    return true;
  });

  const rollQuery = rollSearch.trim().toLowerCase();
  const visibleMembers = rollQuery
    ? memberFiltered.filter((row) =>
        `${row.name} ${row.username} ${row.phone_number} ${row.email} ${row.role || ""} ${row.request?.note || ""} ${row.request?.group_name || ""}`
          .toLowerCase()
          .includes(rollQuery),
      )
    : memberFiltered;

  // The roll is the desk's table, so on a phone it is the whole screen: the
  // card gives up the page's padding and its own frame and fills what is left
  // under the strip, the rows scroll inside it, and the count and Add Member
  // sit pinned at its foot — the way the roster and the treasury read on the
  // same screen. Every other view keeps the page's padding and scrolls it.
  const deskFillsPhone = subTab === "members";

  return (
    <div
      className={`mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col custom-hover-scrollbar ${
        deskFillsPhone
          ? "md:gap-4 md:overflow-hidden md:px-4 lg:px-6"
          : "gap-4 overflow-y-auto px-2 py-3 md:overflow-hidden md:px-4 lg:px-6"
      }`}
    >

      {/* Members tab — a contained table: the page holds still, the rows
          scroll, the way the roster and treasury read. The department's board
          leads the table, so opening a department shows who leads it first. */}
      {subTab === "members" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:rounded-2xl md:border md:border-sand-line md:shadow-sm">
          <div className="min-h-0 flex-1 overflow-y-auto custom-table-scrollbar">
            {loadingRoll ? (
              <p className="py-8 text-center text-xs text-moss">Loading the roll…</p>
            ) : visibleMembers.length === 0 ? (
              <p className="py-8 text-center text-xs text-moss">
                {memberRows.length === 0
                  ? "Nobody is on this roll yet. Use “Add member” to build the department's list."
                  : memberFilter === "requests"
                    ? "No one is waiting to join. Set the filter back to All to read the roll."
                    : "No member matches that search."}
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-white text-[11px] font-bold uppercase tracking-wider text-ember">
                  <tr className="border-b border-sand-line">
                    <th className="px-4 pb-3 pt-3 font-bold">Name</th>
                    {department.code === "children" && (
                      <th className="px-4 pb-3 pt-3 font-bold">Class</th>
                    )}
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
                  {visibleMembers.map((row) => (
                    <tr key={row.key}>
                      <td className={`px-4 ${rowPad} align-middle`}>
                        {/* The badges wrap rather than eat the name: a name
                            squeezed to "Peter Nd…" identifies nobody. */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="font-semibold text-bark">{row.name}</p>
                          {department.code === "children" && (row.class || row.unit) && (
                            <span className="sm:hidden text-[11px] font-medium text-fuchsia-800">
                              · {row.class || row.unit}
                            </span>
                          )}
                          {/* A unioned row: the person sits on the roll through
                              the choir or a singing group, not a roll entry. */}
                          {row.via && !isSabbathSchool && (
                            <span
                              className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss"
                              title={`On the roll through ${row.via}. Remove them there.`}
                            >
                              via {row.via}
                            </span>
                          )}
                          {/* An ask to join, waiting on this desk or already
                              answered: it rides the roll's own list, wearing
                              the ask and the state it is in. */}
                          {row.request && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                row.request.status === "pending"
                                  ? "bg-ember/10 text-ember"
                                  : row.request.status === "approved"
                                    ? "bg-sage/15 text-sage-strong"
                                    : "bg-sand text-moss-faint"
                              }`}
                            >
                              {/* A phone's name column has no room for the
                                  ask's full title: it wears its state alone
                                  there, and says what it is once there is
                                  width for both. */}
                              <span className="sm:hidden">{askStatusWord(row.request.status)}</span>
                              <span className="hidden sm:inline">
                                {row.request.kind === "singing_group" ? "Singing group" : "Join request"} ·{" "}
                                {askStatusWord(row.request.status)}
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      {department.code === "children" && (
                        <td className={`px-4 ${rowPad} align-middle`}>
                          {row.class || row.unit ? (
                            <span className="inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-0.5 text-[11px] font-semibold text-fuchsia-800">
                              {row.class || row.unit}
                            </span>
                          ) : (
                            <span className="text-xs text-moss-mute">—</span>
                          )}
                        </td>
                      )}
                      <td className={`px-4 ${rowPad} align-middle`}>
                        {row.request ? (
                          // The ask speaks for the row where a role would: the
                          // member's own words while it waits, the desk's
                          // answer once it has one. Two lines at most, so one
                          // long note cannot stretch the whole table.
                          <span
                            className="line-clamp-2 text-xs italic text-moss"
                            title={row.request.note || undefined}
                          >
                            {row.request.status === "pending"
                              ? row.request.note || "Asked without a word."
                              : row.request.reply || "Answered without a word."}
                          </span>
                        ) : row.role ? (
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
                            aria-label={
                              row.request ? `Answer ${row.name}'s ask to join` : `Actions for ${row.name}`
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-[11px] font-semibold text-bark transition hover:bg-sand"
                          >
                            {/* An ask is answered, not administered: the row's
                                own button says what the desk does with it. */}
                            {row.request
                              ? row.request.status === "pending"
                                ? "Respond"
                                : "Answer"
                              : "Actions"}
                            <MoreVertical className="h-3 w-3 text-moss" />
                          </button>
                          {openMenuKey === row.key && (
                            <div
                              className={`absolute right-0 top-full z-40 mt-1.5 rounded-2xl border border-sand-line bg-white text-left shadow-2xl ring-1 ring-black/5 ${
                                row.request ? "w-72 p-3" : "w-48 p-1.5"
                              }`}
                            >
                              {row.request ? (
                                <JoinAskAnswer
                                  ask={row.request}
                                  reply={joinsReplies[row.request.id] ?? ""}
                                  busy={busyJoinId === row.request.id}
                                  onReply={(value) =>
                                    setJoinsReplies((current) => ({
                                      ...current,
                                      [row.request!.id]: value,
                                    }))
                                  }
                                  onAnswer={(status) => answerRequest(row.request!.id, status)}
                                />
                              ) : (
                                <>
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
                              {/* The roster's three doors to the person —
                                  chat here, WhatsApp or call — the same set
                                  the Ministry map's area view offered, so
                                  reaching someone does not depend on which
                                  view of the ministry opened. */}
                              {typeof row.id === "number" && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuKey(null);
                                    void chatWith(row.id as number);
                                  }}
                                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
                                >
                                  <MessageSquare className="h-4 w-4 text-sage-strong" /> Chat here
                                </button>
                              )}
                              {waOf(row) && (
                                <a
                                  href={`https://wa.me/${waOf(row)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => setOpenMenuKey(null)}
                                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
                                >
                                  <WhatsAppIcon className="h-4 w-4" /> WhatsApp
                                </a>
                              )}
                              {row.phone_number && (
                                <a
                                  href={`tel:${row.phone_number.replace(/\s+/g, "")}`}
                                  onClick={() => setOpenMenuKey(null)}
                                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
                                >
                                  <Phone className="h-4 w-4 text-sage-strong" /> Call
                                </a>
                              )}
                              {row.is_child && row.child_id ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuKey(null);
                                    removeChild(row.child_id!, row.name);
                                  }}
                                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" /> Remove child
                                </button>
                              ) : row.member ? (
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
                                  {row.via && !isSabbathSchool ? `On the roll through ${row.via}` : "Appointed (no roll entry)"}
                                </p>
                              )}
                                </>
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
              {visibleMembers.length} {visibleMembers.length === 1 ? "person" : "people"}
              {rollQuery ? ` of ${memberRows.length}` : ""} shown · {roll.length} on the roll
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

      {/* Account Status tab */}
      {subTab === "accounts" && (
        <DepartmentAccountsPanel
          department={department}
          onChanged={onChanged}
          search={accountsSearch}
          typeFilter={accountsFilter}
        />
      )}
      {subTab === "calendar" && (
        <div className="rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-bark">Department calendar</h3>
            <div className="flex items-center gap-2">
              <CalendarViewToggle view={calendarView} onChange={setCalendarView} />
              {calendarView === "calendar" && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(-1)}
                    aria-label="Previous month"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sand-line bg-white text-bark hover:border-ember hover:text-ember"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-24 text-center text-xs font-semibold text-bark">
                    {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftCalendarMonth(1)}
                    aria-label="Next month"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sand-line bg-white text-bark hover:border-ember hover:text-ember"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowAddEvent(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
              >
                <CalendarDays className="h-3.5 w-3.5" /> Add event
              </button>
            </div>
          </div>
          {loadingEvents ? (
            <p className="py-8 text-center text-xs text-moss">Loading the calendar…</p>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-xs text-moss">
              Nothing on the calendar yet. Events added here are stored and can be published to the congregation.
            </p>
          ) : calendarView === "calendar" ? (
            <div className="mt-3">
              <MonthGrid
                year={calendarMonth.getFullYear()}
                month={calendarMonth.getMonth()}
                events={monthEvents}
                openActions={openGridAction}
                onToggleActions={(key) => setOpenGridAction(openGridAction === key ? null : key)}
                onCloseActions={() => setOpenGridAction(null)}
                renderMenu={(event, onClose) => (
                  <div className="text-xs">
                    <p className="px-3 py-2 font-semibold text-bark">{event.title}</p>
                    <p className="px-3 pb-2 text-moss">
                      {dayFirst(event.date)}
                      {event.time ? ` · ${clockTime(event.time)}` : ""}
                      {event.location ? ` · ${event.location}` : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => { onClose(); removeEvent(event); }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-sand"
                    >
                      Remove
                    </button>
                  </div>
                )}
              />
            </div>
          ) : (
            <div className="mt-3 divide-y divide-sand-soft">
              {filteredEvents.map((event) => (
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
              {filteredEvents.length === 0 && (
                <p className="py-6 text-center text-xs text-moss">No events match your search.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Moments — the church's photo and video wall, read from the area that
          lived the day. Every ministry and department desk carries this view; the
          Treasury and the Clerkship do not (see `areaHasMoments`). */}
      {subTab === "moments" && areaHasMoments(department.code) && (
        <AreaMomentsPanel departmentLabel={department.label} canManage={canDocumentMoments} />
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

      {/* Sabbath School Lesson Orders */}
      {subTab === "lesson-orders" && isSabbathSchool && <LessonOrdersPanel />}

      {/* The eldership's own three — the same boards the Ministry map's area
          view used to draw, now part of the one desk every door opens, so a
          ministry reads the same whichever route opened it. */}
      {officeViewBlocked && (
        <p className="rounded-2xl border border-sand-line bg-white p-5 text-xs text-moss">
          This desk belongs to the eldership — ask one of the elders to open it for you.
        </p>
      )}
      {/* A deep link may name Moments on a desk that keeps no Moments view:
          the strip withholds it, and the desk says why rather than opening
          on an empty panel. */}
      {subTab === "moments" && !areaHasMoments(department.code) && (
        <p className="rounded-2xl border border-sand-line bg-white p-5 text-xs text-moss">
          Moments rides every ministry and department desk — the Treasury and the Clerkship keep the
          church&apos;s records rather than its days, so the wall is not theirs to keep.
        </p>
      )}
      {subTab === "baptismal-class" && canOpenOfficeViews && (
        <div className="rounded-2xl border border-sand-line bg-white p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
              <Droplets className="h-4 w-4 text-ember" aria-hidden="true" /> Baptismal Class
            </h3>
            <p className="mt-0.5 text-xs text-moss">
              The members being prepared for baptism, their walk from studying to the font, kept by the eldership desk.
            </p>
          </div>
          <BaptismalClassPanel />
        </div>
      )}
      {subTab === "daily-word" && canOpenOfficeViews && (
        <div className="rounded-2xl border border-sand-line bg-white p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
              <BookOpen className="h-4 w-4 text-ember" aria-hidden="true" /> Daily Word
            </h3>
            <p className="mt-0.5 text-xs text-moss">
              A short devotional thought for the day, shared with the church by the eldership.
            </p>
          </div>
          <DailyWordPanel />
        </div>
      )}
      {subTab === "announcements" && canOpenOfficeViews && (
        <div className="rounded-2xl border border-sand-line bg-white p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
              <Megaphone className="h-4 w-4 text-ember" aria-hidden="true" /> Announcements
            </h3>
            <p className="mt-0.5 text-xs text-moss">
              The notices published to the church family, the same board the announcements desk keeps.
            </p>
          </div>
          <AnnouncementManager embedded />
        </div>
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
      {assignFor && typeof assignFor.id === "number" && (
        <AssignRoleModal
          department={department}
          member={{ id: assignFor.id, name: assignFor.name, sex: assignFor.sex, office: assignFor.office }}
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
        <AddEventModal
          departmentLabel={department.label}
          defaultLocation={churchName}
          departments={eventDepartments}
          onClose={() => setShowAddEvent(false)}
          onAdd={addEvent}
        />
      )}
    </div>
  );
}

export function DepartmentHub({
  initialDept = null,
  initialTab = "members",
  onBack,
  embedded = false,
}: {
  initialDept?: string | null;
  /** Which of the opened area's views to land on. */
  initialTab?: "members" | "calendar";
  /**
   * Where the way out of an opened area leads — the ministry map, or the
   * desk the hub sits inside. Left unset it is the hub's own directory: the
   * list the detail was opened from.
   */
  onBack?: (() => void) | null;
  /** One view of a larger desk, which names the views itself (see
      `DepartmentDetail`). */
  embedded?: boolean;
} = {}) {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Which department detail (and which of its tabs) is open; the row's
  // Calendar/Members buttons open the detail directly on that tab.
  const [selected, setSelected] = useState<DepartmentRow | null>(null);
  const [detailTab, setDetailTab] = useState<"members" | "calendar">(initialTab);
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
  const { setHeaderRightAction, setCustomHeader } = usePageHeader();
  useEffect(() => {
    setHeaderRightAction(
      <input
        type="text"
        value={directorySearch}
        onChange={(e) => setDirectorySearch(e.target.value)}
        placeholder="Search ministries and departments, or the people leading them…"
        aria-label="Search the leadership directory"
        className="w-full min-w-0 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-64"
      />
    );
    return () => setHeaderRightAction(null);
  }, [directorySearch, setHeaderRightAction]);

  // One heading and one description for this whole page. The shell used to
  // take its heading from whichever area was open — the directory named the
  // desk, and each ministry or department renamed it as it was opened — so on
  // a wide screen the name and the line under it changed with every toggle
  // through the ministry and department desks. Both are fixed here: the
  // console's leadership tab and the ministry map this desk is also drawn
  // under read the same heading throughout.
  //
  // A desk drawn *inside* another (the deaconate's own pages, under
  // DeaconateManager) leaves the heading to the desk around it — there the
  // area still names itself, exactly as before.
  //
  // `selected` is a dependency so this is rewritten whenever `DepartmentDetail`
  // — the child that draws chrome over this same band — mounts or clears it:
  // a parent's effect runs after its child's, so this text is the one that
  // stands. The back handler rides a ref so a caller's inline arrow does not
  // re-fire the effect on every render, the way the band above warns.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);
  useEffect(() => {
    if (embedded || selected) return;
    setCustomHeader({
      label: MINISTRIES_AND_DEPARTMENTS_HEADING.label,
      description: MINISTRIES_AND_DEPARTMENTS_HEADING.description,
      leading: onBackRef.current ? (
        <button
          type="button"
          onClick={() => onBackRef.current?.()}
          aria-label="Back"
          className="inline-flex items-center text-moss transition hover:text-bark lg:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : undefined,
    });
    return () => setCustomHeader(null);
  }, [embedded, selected, setCustomHeader]);
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
        setSelected(() => {
          const code = departmentDeskCode(initialDept);
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
        onBack={onBack ?? (() => setSelected(null))}
        embedded={embedded}
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
          Every ministry and department, the church&apos;s offices among them, with its leader and assistants.
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
                        {/* An area whose lead seat carries its own word for
                            it — Sabbath School's Superintendent — says so
                            under the name, so the row never reads as a plain
                            "Leader" where the church names it otherwise. */}
                        {seatTitle(department.code, department.leader.position, "leader") !== "Leader" && (
                          <p className="truncate text-[11px] font-semibold text-ember">
                            {seatTitle(department.code, department.leader.position, "leader")}
                          </p>
                        )}
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
            {visibleDepartments.length} of {departments.length}{" "}
            {departments.length === 1 ? "ministry or department" : "ministries and departments"}
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
                  <span className="font-semibold text-moss">{seatTitle(department.code, department.leader?.position, "leader")}:</span>{" "}
                  {department.leader ? (
                    <span className="font-semibold">{department.leader.name}</span>
                  ) : (
                    <span className="italic text-moss-faint">not set</span>
                  )}
                </p>
                <p className="text-bark">
                  <span className="font-semibold text-moss">Assistants:</span>{" "}
                  {department.assistants.length > 0 ? (
                    <span className="font-semibold">
                      {department.assistants
                        .map((a) => `${a.name}${a.position && a.position.toLowerCase() !== "assistant" ? ` (${seatTitle(department.code, a.position, a.kind)})` : ""}`)
                        .join(", ")}
                    </span>
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
            <h3 className="text-lg font-bold text-bark">Budget: {department.label}</h3>
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
            Created with Leader, Secretary and Treasurer roles. Appoint their holders when editing leadership.
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
 * The desk's answer to one ask to join, as the row's own popover: the member's
 * note, a reply, and the two answers that close it. Approving puts the member
 * on the roll (the API does that); declining sends the reply alone.
 */
function JoinAskAnswer({
  ask,
  reply,
  busy,
  onReply,
  onAnswer,
}: {
  ask: JoinRequestRow;
  reply: string;
  busy: boolean;
  onReply: (value: string) => void;
  onAnswer: (status: "approved" | "rejected") => void;
}) {
  return (
    <>
      <p className="text-[10px] font-bold uppercase tracking-wider text-moss-faint">
        {ask.kind === "singing_group" ? "Singing group" : "Join request"}
      </p>
      {ask.note && <p className="mt-1 text-xs italic text-moss">&ldquo;{ask.note}&rdquo;</p>}
      {ask.status === "pending" ? (
        <>
          <input
            type="text"
            value={reply}
            onChange={(e) => onReply(e.target.value)}
            placeholder="Reply to the member…"
            className="mt-2 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAnswer("approved")}
              className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAnswer("rejected")}
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-moss">
          {ask.status === "approved" ? "Approved." : "Declined."} {ask.reply || "No reply was sent."}
        </p>
      )}
    </>
  );
}

/**
 * The members view's filter, riding the page header just before the search
 * box: the whole list, the people approved onto the roll, or the asks still
 * waiting on an answer. The asks used to be a view of their own — the count
 * they wore on the strip now sits on this button.
 */
function MembersFilterButton({
  value,
  onChange,
  pending,
}: {
  value: MemberFilter;
  onChange: (v: MemberFilter) => void;
  pending: number;
}) {
  const labels: Record<MemberFilter, string> = {
    all: "All",
    approved: "Approved",
    requests: "Requests",
  };

  return (
    <FilterPopover
      summary={labels[value]}
      active={value !== "all"}
      title="Show members"
    >
      {(["all", "approved", "requests"] as const).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            onChange(key);
          }}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
            value === key ? "bg-sand-linen text-ember" : "text-bark hover:bg-sand"
          }`}
        >
          <span>
            {labels[key]}
            {key === "requests" && pending > 0 ? ` (${pending})` : ""}
          </span>
          {value === key && <span className="font-bold text-ember">✓</span>}
        </button>
      ))}
      {pending > 0 && (
        <span className="rounded-full bg-ember px-1.5 text-[10px] font-bold text-white">{pending}</span>
      )}
    </FilterPopover>
  );
}
