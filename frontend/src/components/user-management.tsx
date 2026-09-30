"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Briefcase, Check, ChevronDown, Mail, Pencil, Phone, Printer, SlidersHorizontal, Sparkles, Trash2, Undo2, User, X } from "lucide-react";
import {
  accountTypeOf,
  accountTypeLabel,
  ACCOUNT_TYPE_OPTIONS,
  type AccountTypeOption,
  formatRoles,
  NO_ROLE_LABEL,
  leadershipRoles,
  roleDisplayLabel,
  orderRolesBySeniority,
  RolesCombobox,
  refreshRoleRegister,
} from "./roles-combobox";
import { useTableDensity, densityCellPad, DensityToggle } from "@/lib/table-density";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { ComboboxPopover } from "./combobox-popover";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { RecordList } from "./record-list";
import { SubNav } from "./sub-nav";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The church-wide role codes the Departments & Ministries desk assigns —
    hidden from the roster's role picker so no role ends up assigned in two
    places. Everything else here is editable from this desk. */
const DEPARTMENT_MANAGED_ROLE_CODES = [
  "first_elder", "second_elder", "third_elder", "clerk", "head_deacon", "head_deaconess",
  "men_ministry", "women_ministry", "youth_leader", "children_ministry",
  "ambassadors_leader", "apm_leader", "chaplaincy",
];

/**
 * Column widths, declared once and applied to both the header and the cells.
 *
 * Left to itself the browser handed the surplus width to whichever column sat
 * next to the widest content, so Role and Type drifted apart by a hand's width
 * depending on how long a name or a phone number happened to be. Pinning the
 * columns keeps the same grid for every roster.
 */
const COL_INDEX = "w-8";
// Every column carries a width hint, Name included. Leaving Name flexible let
// it swallow the whole surplus on a wide screen — one enormous gap after the
// name while Role, Type and Sex sat crowded together on the right. With a hint
// on each column the browser spreads the leftover room across all of them, so
// the roster keeps the same even rhythm at any width.
const COL_NAME = "w-[13rem]";
const COL_CONTACT = "w-[12rem]";
const COL_STATUS = "w-[7rem]";
const COL_ROLE = "w-[10rem]";
const COL_TYPE = "w-[8.5rem]";
const COL_SEX = "w-[4.5rem]";
const COL_ACTIONS = "w-[7rem]";


export type MemberUser = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  roles?: string[];
  /** Roles this member shares as an assistant (a subset of ``roles``). */
  assistant_roles?: string[];
  current_church?: string;
  baptismal_status?: string;
  phone_number?: string;
  whatsapp_number?: string;
  account_type?: string;
  profession?: string;
  residence?: string;
  gender?: string;
  date_of_birth?: string;
  gifts?: string;
  disability?: string;
  is_disfellowshipped?: boolean;
  /** False while leadership has not yet approved a friend/Sabbath School joining,
      or after an officer switched the account off. */
  is_active?: boolean;
  /**
   * Set when an officer switched the account off. An inactive account with no
   * stamp is a join request still waiting for approval — the row reads it as
   * "Not approved" — and only a stamped one can be switched back on.
   */
  deactivated_at?: string | null;
  /** True only for the installation's owner account, which is not a member. */
  is_superuser?: boolean;
};

type MemberFilter = "all" | "members" | "friends" | "ex_members";
type InvitationFilter = "confirmed" | "pending";
/** The pending list groups by what the person is joining as, transfers included. */
type PendingKindFilter = "all" | "members" | "friends" | "sabbath_school" | "transfers";
/**
 * Whether an account can sign in, and why not when it cannot.
 *
 * Two different things are stored: an account switched off by an officer, and
 * one nobody has approved yet. Both are inactive and only one of them is the
 * office's to act on, so they are told apart here rather than merged.
 */
type StatusFilter = "all" | "active" | "inactive" | "awaiting";

/**
 * The pending list's grouping tabs — the same shape the confirmed roster
 * filters by account type, so switching between Confirmed and Pending keeps
 * the page's structure. Members/Friends/S. School read the invitation's
 * account type; Transfers are membership transfer requests, which never
 * carry an account type of their own.
 */
const PENDING_KIND_TABS: { key: PendingKindFilter; label: string; help: string }[] = [
  { key: "all", label: "All", help: "Every pending invitation and transfer request" },
  { key: "members", label: "Members", help: "Pending accounts joining as members" },
  { key: "friends", label: "Friends", help: "Pending friend accounts" },
  { key: "sabbath_school", label: "S. School", help: "Pending Sabbath School accounts" },
  { key: "transfers", label: "Transfers", help: "Membership transfer requests awaiting review" },
];

const STATUS_TABS: { key: StatusFilter; label: string; help: string }[] = [
  { key: "all", label: "All", help: "Every confirmed record" },
  { key: "active", label: "Active", help: "These accounts can sign in" },
  {
    key: "inactive",
    label: "Inactive",
    help: "An officer switched these accounts off. The record, roles and giving history are intact, and Actions can switch them back on.",
  },
  {
    key: "awaiting",
    label: "Awaiting",
    help: "Join requests leadership has not approved yet — they cannot sign in until then",
  },
];

/** Which of the three account states a roster row is in. */
function statusOf(member: MemberUser): Exclude<StatusFilter, "all"> {
  if (member.is_active !== false) return "active";
  return member.deactivated_at ? "inactive" : "awaiting";
}

/** One served-in stretch of a role, from the member's role history. */
type RoleHistoryRow = {
  role: string;
  role_label: string;
  started_at: string;
  ended_at: string | null;
};

/**
 * Whether an account can sign in, as the roster's Status column reads it.
 *
 * Three states share the cell, because "inactive" on its own is not enough to
 * act on: a switched-off login is the office's to switch back on, while a
 * join request nobody has approved belongs to the Requests desk. An account
 * that can sign in says so plainly, and the dates ride in the tooltip.
 */
function AccountStatus({ member }: { member: MemberUser }) {
  if (member.is_active !== false) {
    return (
      <span
        title="This account can sign in"
        className="inline-flex items-center gap-1.5 rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss-dark"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
        Active
      </span>
    );
  }
  if (member.deactivated_at) {
    const when = new Date(member.deactivated_at).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric",
    });
    return (
      <span
        title={`An officer switched this account off on ${when}. The record, roles and history are intact, and Actions can switch it back on.`}
        className="inline-flex items-center gap-1.5 rounded-full bg-alert-veil px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-alert-shade"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-alert-soft" aria-hidden="true" />
        Inactive
      </span>
    );
  }
  return (
    <span
      title="Waiting for leadership approval on the Requests desk — they cannot sign in yet"
      className="inline-flex items-center gap-1.5 rounded-full bg-gold-pale px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ember-deep"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-ember" aria-hidden="true" />
      Awaiting
    </span>
  );
}

/**
 * The Role column: one office plus a count.
 *
 * The roster is a glance, not a manifest — an officer scanning it needs to know
 * that someone is an Elder without wading through every office they hold. The
 * full set is on the tooltip and in Assign Leadership, which is where roles are
 * actually decided. A member holding no office reads "None": their being on
 * the roll is the Type column's answer, not a role beside Elder and Clerk.
 */
function roleSummary(roles: string[], assistants: string[] = []): string {
  const offices = leadershipRoles(roles);
  if (offices.length === 0) return NO_ROLE_LABEL;
  // Senior office leads: the stored order is the register's, which would
  // introduce a first elder who also clerks as "Church Clerk" instead.
  const first = roleDisplayLabel(orderRolesBySeniority(offices)[0], assistants);
  const others = offices.length - 1;
  if (others <= 0) return first;
  return `${first} + ${others} other${others === 1 ? "" : "s"}`;
}

function RoleCell({ member }: { member: MemberUser }) {
  const roles = member.roles && member.roles.length > 0 ? member.roles : [member.role || "member"];
  const assistants = member.assistant_roles || [];
  const full = orderRolesBySeniority(leadershipRoles(roles))
    .map((code) => roleDisplayLabel(code, assistants))
    .join(", ") || NO_ROLE_LABEL;
  return (
    <span className="block truncate text-xs text-bark" title={full}>
      {roleSummary(roles, assistants)}
    </span>
  );
}

/**
 * The Type column, read rather than edited.
 *
 * Two stored fields express four states, so the row is answered by one label.
 * Changing it is a decision, not a slider: it lives behind Actions → Account
 * Type, next to the Remove / Restore that already means "on the roll or off it".
 */
function AccountTypeCell({ member }: { member: MemberUser }) {
  const value = accountTypeOf(member.account_type, member.is_disfellowshipped);
  const help = ACCOUNT_TYPE_OPTIONS.find((option) => option.value === value)?.help || "";
  const tone =
    value === "ex_member" ? "text-alert-shade" : value === "member" ? "text-bark" : "text-moss";
  return (
    <span className={`block truncate text-xs font-medium ${tone}`} title={help}>
      {accountTypeLabel(value)}
    </span>
  );
}

/** The read-only payload behind See Profile: roster fields plus history. */
type MemberProfileData = Partial<MemberUser> & {
  date_joined?: string;
  ministry_label?: string;
  baptismal_status_label?: string;
  current_roles?: RoleHistoryRow[];
  past_roles?: RoleHistoryRow[];
};

const fmtDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

/** A label + value line of the profile grid; em-dash when nothing is on file. */
function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-moss-faint">{label}</p>
      <p className="mt-0.5 text-xs text-bark">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

export const AVAILABLE_GIFTS = [
  "Preaching",
  "Ushering",
  "Children Teacher",
  "Lesson Facilitation",
  "Choir Teaching",
  "Singing / Music",
  "Evangelism & Outreach",
  "Prayer Ministry",
  "Visitation & Pastoral Care",
  "Hospitality & Welfare",
  "Health Ministry",
  "Sound & Media Tech",
  "Deaconry & Maintenance",
  "Treasury & Stewardship",
  "Youth Mentorship",
  "Administration & Organizing",
];

interface GiftsComboboxProps {
  selectedGifts: string[];
  onChange: (gifts: string[]) => void;
  placeholder?: string;
}

export function GiftsCombobox({
  selectedGifts,
  onChange,
  placeholder = "Select gifts & talents...",
}: GiftsComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customGift, setCustomGift] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body (see ComboboxPopover), so outside-click
  // must count it as inside or the first click on it would close the picker.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleGift = (gift: string) => {
    if (selectedGifts.includes(gift)) {
      onChange(selectedGifts.filter((g) => g !== gift));
    } else {
      onChange([...selectedGifts, gift]);
    }
  };

  const handleAddCustomGift = () => {
    const trimmed = customGift.trim();
    if (!trimmed) return;
    if (!selectedGifts.includes(trimmed)) {
      onChange([...selectedGifts, trimmed]);
    }
    setCustomGift("");
  };

  const allGifts = Array.from(new Set([...AVAILABLE_GIFTS, ...selectedGifts]));
  const filteredGifts = allGifts.filter((g) =>
    g.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative mt-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2 text-xs text-bark transition hover:bg-white focus:border-ember focus:bg-white focus:outline-none"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden text-left">
          {selectedGifts.length === 0 ? (
            <span className="text-moss">{placeholder}</span>
          ) : (
            <>
              {selectedGifts.slice(0, 2).map((gift) => (
                <span
                  key={gift}
                  className="inline-flex items-center gap-1 rounded-md bg-mist-select px-2 py-0.5 text-[11px] font-semibold text-sage-bright"
                >
                  <span>{gift}</span>
                </span>
              ))}
              {selectedGifts.length > 2 && (
                <span className="rounded-md bg-sand px-1.5 py-0.5 text-[10px] font-bold text-ember border border-sand-line">
                  +{selectedGifts.length - 2} more
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-moss">
          {selectedGifts.length > 0 && (
            <span className="rounded-full bg-sage px-1.5 py-0.5 text-[10px] font-bold text-white">
              {selectedGifts.length}
            </span>
          )}
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            <ChevronDown size={12} aria-hidden="true" />
          </span>
        </div>
      </button>

      <ComboboxPopover anchorRef={containerRef} panelRef={panelRef} open={isOpen}>
          <div className="flex items-center justify-between border-b border-sand-line pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ember">
              Select Member Gifts ({selectedGifts.length})
            </span>
            <div className="flex items-center gap-2">
              {selectedGifts.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-brick hover:underline"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md bg-bark px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ember"
              >
                Done
              </button>
            </div>
          </div>

          <div className="mt-2">
            <input
              type="text"
              placeholder="Search or filter gifts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-sand-line bg-sand-plate px-2.5 py-1.5 text-xs text-bark outline-none focus:border-ember focus:bg-white"
            />
          </div>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {filteredGifts.map((gift) => {
              const isChecked = selectedGifts.includes(gift);
              return (
                <label
                  key={gift}
                  className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs cursor-pointer transition select-none ${
                    isChecked
                      ? "bg-mist-select text-sage-bright font-semibold"
                      : "text-bark hover:bg-sand"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleGift(gift)}
                      className="h-4 w-4 rounded accent-sage cursor-pointer"
                    />
                    <span>{gift}</span>
                  </div>
                  {isChecked && <Check size={12} className="text-xs text-sage" aria-hidden="true" />}
                </label>
              );
            })}
            {filteredGifts.length === 0 && (
              <p className="py-2 text-center text-xs text-moss">No matching gifts found.</p>
            )}
          </div>

          <div className="mt-3 border-t border-sand-line pt-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Add other gift / talent..."
                value={customGift}
                onChange={(e) => setCustomGift(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomGift();
                  }
                }}
                className="flex-1 rounded-lg border border-sand-line bg-sand-plate px-2.5 py-1 text-xs text-bark outline-none focus:border-ember"
              />
              <button
                type="button"
                onClick={handleAddCustomGift}
                className="rounded-lg bg-sage px-2.5 py-1 text-xs font-semibold text-white hover:bg-sage-deep"
              >
                + Add
              </button>
            </div>
          </div>
      </ComboboxPopover>
    </div>
  );
}

export const AVAILABLE_DISABILITIES = [
  "None",
  "Visual Impairment (Blind / Low Vision)",
  "Hearing Impairment (Deaf / Hard of Hearing)",
  "Physical / Mobility Impairment",
  "Speech / Communication Difficulty",
  "Intellectual / Learning Disability",
  "Mental Health / Psychosocial Condition",
  "Autism Spectrum Disorder",
  "Albinism",
  "Chronic Health Condition",
  "Other Special Need",
];

interface DisabilityComboboxProps {
  selectedDisabilities: string[];
  onChange: (disabilities: string[]) => void;
  placeholder?: string;
}

export function DisabilityCombobox({
  selectedDisabilities,
  onChange,
  placeholder = "Select disability (optional)...",
}: DisabilityComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customDisability, setCustomDisability] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body (see ComboboxPopover), so outside-click
  // must count it as inside or the first click on it would close the picker.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleDisability = (item: string) => {
    // "None" is exclusive: picking it clears every real condition, and picking
    // a condition drops "None" — the two states are mutually exclusive.
    if (item === "None") {
      onChange(selectedDisabilities.includes("None") ? [] : ["None"]);
      return;
    }
    if (selectedDisabilities.includes(item)) {
      onChange(selectedDisabilities.filter((d) => d !== item));
    } else {
      onChange([...selectedDisabilities.filter((d) => d !== "None"), item]);
    }
  };

  const handleAddCustom = () => {
    const trimmed = customDisability.trim();
    if (!trimmed) return;
    if (!selectedDisabilities.includes(trimmed)) {
      onChange([...selectedDisabilities, trimmed]);
    }
    setCustomDisability("");
  };

  const allDisabilities = Array.from(new Set([...AVAILABLE_DISABILITIES, ...selectedDisabilities]));
  const filteredDisabilities = allDisabilities.filter((d) =>
    d.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative mt-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2 text-xs text-bark transition hover:bg-white focus:border-ember focus:bg-white focus:outline-none"
      >
        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden text-left">
          {selectedDisabilities.length === 0 || (selectedDisabilities.length === 1 && selectedDisabilities[0] === "None") ? (
            <span className="text-moss">{selectedDisabilities.includes("None") ? "None" : placeholder}</span>
          ) : (
            <>
              {selectedDisabilities.filter((d) => d !== "None").slice(0, 2).map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 rounded-md bg-mist-select px-2 py-0.5 text-[11px] font-semibold text-sage-bright"
                >
                  <span>{item}</span>
                </span>
              ))}
              {selectedDisabilities.length > 2 && (
                <span className="rounded-md bg-sand px-1.5 py-0.5 text-[10px] font-bold text-ember border border-sand-line">
                  +{selectedDisabilities.length - 2} more
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-moss">
          {selectedDisabilities.length > 0 && (
            <span className="rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-bold text-white">
              {selectedDisabilities.length}
            </span>
          )}
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            <ChevronDown size={12} aria-hidden="true" />
          </span>
        </div>
      </button>

      <ComboboxPopover anchorRef={containerRef} panelRef={panelRef} open={isOpen}>
          <div className="flex items-center justify-between border-b border-sand-line pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ember">
              Select Disability ({selectedDisabilities.length})
            </span>
            <div className="flex items-center gap-2">
              {selectedDisabilities.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-brick hover:underline"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-bark px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-ember"
              >
                Done
              </button>
            </div>
          </div>

          <div className="mt-2">
            <input
              type="text"
              placeholder="Search disability..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-sand-line bg-sand-plate px-2.5 py-1.5 text-xs text-bark outline-none focus:border-ember"
            />
          </div>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {filteredDisabilities.length === 0 ? (
              <p className="py-2 text-center text-xs text-moss">No matching categories found</p>
            ) : (
              filteredDisabilities.map((item) => {
                const isChecked = selectedDisabilities.includes(item);
                return (
                  <label
                    key={item}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                      isChecked
                        ? "bg-sand-sheer font-semibold text-ember-shade"
                        : "text-bark hover:bg-sand"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDisability(item)}
                        className="h-4 w-4 rounded accent-ember cursor-pointer"
                      />
                      <span>{item === "None" ? "None (no disability)" : item}</span>
                    </div>
                    {isChecked && <Check size={12} className="text-xs text-ember" aria-hidden="true" />}
                  </label>
                );
              })
            )}
          </div>

          <div className="mt-3 border-t border-sand-line pt-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Add other disability / condition..."
                value={customDisability}
                onChange={(e) => setCustomDisability(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                className="flex-1 rounded-lg border border-sand-line bg-sand-plate px-2.5 py-1 text-xs text-bark outline-none focus:border-ember"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customDisability.trim()}
                className="rounded-lg bg-ember px-2.5 py-1 text-xs font-semibold text-white hover:bg-ember-rust disabled:opacity-50"
              >
                + Add
              </button>
            </div>
          </div>
      </ComboboxPopover>
    </div>
  );
}

export const DEFAULT_PROFESSIONS = [
  "Accountant / Finance / Banking",
  "Architect / Interior Designer",
  "Business Owner / Entrepreneur",
  "Civil Servant / Public Officer",
  "Driver / Logistics / Transport",
  "Electrician / Technician / Artisan",
  "Engineer / IT / Software Developer",
  "Farmer / Agriculture / Agribusiness",
  "Healthcare / Doctor / Clinical Officer",
  "Healthcare / Nurse / Midwife",
  "Homemaker",
  "Human Resources / Administration",
  "Lawyer / Legal Practitioner",
  "Marketing / Sales / PR",
  "Mason / Builder / Contractor",
  "Media / Journalist / Photographer",
  "Pastor / Evangelist / Church Minister",
  "Pharmacist / Lab Technologist",
  "Security Officer / Police / Military",
  "Student / Scholar",
  "Tailor / Fashion Designer",
  "Teacher / Lecturer / Educator",
  "Other",
];

interface ProfessionComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ProfessionCombobox({
  value,
  onChange,
  placeholder = "Select or specify profession...",
}: ProfessionComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customProfession, setCustomProfession] = useState("");
  const [professionsList, setProfessionsList] = useState<string[]>(DEFAULT_PROFESSIONS);
  const [specifyingOther, setSpecifyingOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body (see ComboboxPopover), so outside-click
  // must count it as inside or the first click on it would close the picker.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/members/professions/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Array<{ id: number; name: string }> | null) => {
        if (data && Array.isArray(data) && data.length > 0) {
          const names = data.map((p) => p.name);
          if (!names.includes("Other")) {
            names.push("Other");
          }
          setProfessionsList(names);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setIsOpen(false);
        setSpecifyingOther(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const filteredProfessions = professionsList.filter((item) =>
    item.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (prof: string) => {
    if (prof === "Other") {
      setSpecifyingOther(true);
      onChange("Other");
    } else {
      onChange(prof);
      setSpecifyingOther(false);
      setIsOpen(false);
    }
  };

  const handleSaveOther = () => {
    const trimmed = otherText.trim();
    if (trimmed) {
      onChange(`Other: ${trimmed}`);
    } else {
      onChange("Other");
    }
    setSpecifyingOther(false);
    setIsOpen(false);
    setOtherText("");
  };

  const handleAddCustom = async () => {
    const trimmed = customProfession.trim();
    if (!trimmed) return;
    onChange(trimmed);
    if (!professionsList.includes(trimmed)) {
      setProfessionsList((prev) => [trimmed, ...prev]);
      try {
        await fetch(`${API_URL}/api/members/professions/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        });
      } catch {}
    }
    setCustomProfession("");
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-left text-xs text-bark transition hover:border-ember focus:border-ember focus:bg-white focus:outline-none"
      >
        <div className="flex flex-1 items-center gap-2 truncate">
          {value ? (
            <span className="truncate font-semibold text-bark">
              <Briefcase size={13} className="inline" aria-hidden="true" /> {value}
            </span>
          ) : (
            <span className="text-moss-faint">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-moss">
          {value && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-bark"
              title="Clear profession"
            >
              <X size={12} aria-hidden="true" />
            </span>
          )}
          <span className={`text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            <ChevronDown size={12} aria-hidden="true" />
          </span>
        </div>
      </button>

      <ComboboxPopover anchorRef={containerRef} panelRef={panelRef} open={isOpen}>
          <div className="flex items-center justify-between border-b border-sand-line pb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ember">
              Select Profession / Occupation
            </span>
            <div className="flex items-center gap-2">
              {value && (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  className="text-[11px] text-brick hover:underline"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSpecifyingOther(false);
                }}
                className="rounded-md bg-bark px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ember"
              >
                Done
              </button>
            </div>
          </div>

          <div className="mt-2">
            <input
              type="text"
              placeholder="Search or filter professions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-sand-line bg-sand-plate px-2.5 py-1.5 text-xs text-bark outline-none focus:border-ember focus:bg-white"
            />
          </div>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {filteredProfessions.map((item) => {
              const isSelected = value === item || (item === "Other" && value.startsWith("Other"));
              return (
                <div
                  key={item}
                  onClick={() => handleSelect(item)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs select-none transition ${
                    isSelected
                      ? "bg-sand-sheer font-semibold text-ember-shade"
                      : "text-bark hover:bg-sand"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-sm" aria-hidden="true">{item === "Other" ? <Sparkles size={13} className="inline" /> : <Briefcase size={13} className="inline" />}</span>
                    <span className="truncate">{item}</span>
                  </div>
                  {isSelected && <Check size={12} className="text-xs font-bold text-ember" aria-hidden="true" />}
                </div>
              );
            })}
            {filteredProfessions.length === 0 && (
              <p className="py-2 text-center text-xs text-moss">No matching professions found.</p>
            )}
          </div>

          {specifyingOther && (
            <div className="mt-2.5 rounded-xl border border-ember/40 bg-sand-sheer/60 p-2.5">
              <label className="block text-[11px] font-semibold text-ember-shade">
                Specify &quot;Other&quot; Profession:
              </label>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. Graphic Designer, Plumber, Pilot..."
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveOther();
                    }
                  }}
                  className="flex-1 rounded-lg border border-sand-line bg-white px-2.5 py-1 text-xs text-bark outline-none focus:border-ember"
                />
                <button
                  type="button"
                  onClick={handleSaveOther}
                  className="rounded-lg bg-ember px-3 py-1 text-xs font-semibold text-white hover:bg-ember-rust"
                >
                  Set
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-sand-line pt-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="Or type custom profession..."
                value={customProfession}
                onChange={(e) => setCustomProfession(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                className="flex-1 rounded-lg border border-sand-line bg-sand-plate px-2.5 py-1 text-xs text-bark outline-none focus:border-ember"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customProfession.trim()}
                className="rounded-lg bg-ember px-2.5 py-1 text-xs font-semibold text-white hover:bg-ember-rust disabled:opacity-50"
              >
                + Set
              </button>
            </div>
          </div>
      </ComboboxPopover>
    </div>
  );
}

const MINISTRIES = [
  // Ministry membership, not a role: picking one files the member into that
  // ministry (profile.ministry) without handing them its leader's authority.
  { value: "", label: "-- Select Ministry --" },
  { value: "adventist_men", label: "Adventist Men" },
  { value: "adventist_women", label: "Adventist Women" },
  { value: "young_adults", label: "Young Adults" },
  { value: "ambassadors", label: "Ambassadors" },
];

interface InvitationRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  account_type: string;
  account_type_display: string;
  roles: string;
  role_codes: string[];
  status: "pending" | "accepted" | "revoked" | "expired";
  invited_by_name: string;
  sent_at: string | null;
  expires_at: string;
  created_at: string;
  // The raw link exists only right after create/resend; older rows carry no
  // link because tokens are stored hashed, so the copy button stays hidden.
  invite_url: string | null;
}

const inviteFormInitial = {
  email: "",
  first_name: "",
  last_name: "",
  phone_number: "",
  account_type: "member",
  // Account type determines member/friend status; roles are permission assignments only.
  roles: [] as string[],
};

const DEFAULT_MANUAL_PASSWORD = "Welcome@2026";  const initialForm = {
  name: "",
  username: "",
  password: DEFAULT_MANUAL_PASSWORD,
  gender: "",
  email: "",
  phone_number: "",
  whatsapp_number: "",
  role: "",
  ministry: "",
  gifts: [] as string[],
  disability: ["None"] as string[],
  profession: "",
  date_of_birth: "",
};

function calculateAgeFromDob(dobStr: string): string {
  if (!dobStr) return "";
  const parts = dobStr.split("-");
  if (parts.length !== 3) return "";
  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return "";

  const today = new Date();
  let calculatedAge = today.getFullYear() - year;
  const m = today.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && today.getDate() < day)) {
    calculatedAge--;
  }
  return calculatedAge >= 0 ? String(calculatedAge) : "";
}

function calculateDobFromAge(ageStr: string): string {
  if (ageStr === "" || isNaN(Number(ageStr))) return "";
  const ageNum = parseInt(ageStr, 10);
  if (ageNum < 0 || ageNum > 130) return "";

  const today = new Date();
  const birthYear = today.getFullYear() - ageNum;
  return `${birthYear}-01-01`;
}

/** The link and the code, for the office to pass on when the email failed. */
function invitationCredentials(data: { invite_url?: string; invite_code?: string }): string {
  return [data.invite_url, data.invite_code ? `Code: ${data.invite_code}` : ""]
    .filter(Boolean)
    .join("   ");
}

/** Invitation name with the email as the fallback when no name was captured. */
function invitationName(invitation: InvitationRow): string {
  return [invitation.first_name, invitation.last_name].filter(Boolean).join(" ") || invitation.email;
}

/** A transfer request as the pending list reads it. */
type TransferRow = {
  id: number;
  member_name: string;
  transfer_type: "incoming" | "outgoing";
  other_church: string;
  email?: string;
  phone_number?: string;
  status: string;
  created_at: string;
};

/** One pending-list row: an invitation or a transfer request. */
type PendingRow =
  | { kind: "invitation"; id: number; invitation: InvitationRow }
  | { kind: "transfer"; id: number; transfer: TransferRow };

/** Which pending tab a row belongs to. Transfers never carry an account type, so they group on their own. */
function pendingKindOf(row: PendingRow): PendingKindFilter {
  if (row.kind === "transfer") return "transfers";
  return (row.invitation.account_type as PendingKindFilter) || "members";
}

/** Name, category, status pill and available actions for either pending row kind. */
function pendingRowName(row: PendingRow): string {
  return row.kind === "invitation" ? invitationName(row.invitation) : row.transfer.member_name;
}

function pendingRowCategory(row: PendingRow): string {
  if (row.kind === "transfer") {
    return row.transfer.transfer_type === "outgoing" ? "Transfer · out" : "Transfer · in";
  }
  return row.invitation.account_type_display;
}

function pendingRowBadge(row: PendingRow) {
  if (row.kind === "transfer") {
    const label =
      row.transfer.status === "under_review"
        ? "Under review"
        : row.transfer.status.charAt(0).toUpperCase() + row.transfer.status.slice(1);
    return <span className="rounded-full bg-gold-pale px-2.5 py-1 text-[10px] font-bold text-ember-deep">{label}</span>;
  }
  return invitationStatusBadge(row.invitation);
}

/** One status label + tone, so the table row and the phone card can never disagree. */
function invitationStatusBadge(invitation: InvitationRow) {
  const label =
    invitation.status === "pending"
      ? `Pending · expires ${new Date(invitation.expires_at).toLocaleDateString()}`
      : invitation.status === "accepted"
        ? "Confirmed"
        : invitation.status === "expired"
          ? "Expired"
          : "Withdrawn";
  const tone =
    invitation.status === "pending"
      ? "bg-mist-select text-moss-dark"
      : invitation.status === "accepted"
        ? "bg-bark text-white"
        : "bg-gold-blush text-ember-deep";
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${tone}`}>{label}</span>;
}

/** Cancel — the only action a pending transfer carries, identical in row and card. */
function TransferActions({
  transfer,
  onCancel,
}: {
  transfer: TransferRow;
  onCancel: (transfer: TransferRow) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCancel(transfer)}
      className="rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ember-deep hover:border-ember-deep"
    >
      Cancel
    </button>
  );
}

/** Actions for any pending row: resend/withdraw for invitations, cancel for transfers. */
function PendingRowActions({
  row,
  onInviteAction,
  onCancelTransfer,
}: {
  row: PendingRow;
  onInviteAction: (id: number, action: "resend" | "revoke") => void;
  onCancelTransfer: (transfer: TransferRow) => void;
}) {
  return row.kind === "invitation" ? (
    <InvitationActions invitation={row.invitation} onAction={onInviteAction} />
  ) : (
    <TransferActions transfer={row.transfer} onCancel={onCancelTransfer} />
  );
}

/** Copy link / Resend / Withdraw — identical in the table row and in the phone card. */
function InvitationActions({
  invitation,
  onAction,
}: {
  invitation: InvitationRow;
  onAction: (id: number, action: "resend" | "revoke") => void;
}) {
  return (
    <>
      {invitation.invite_url && (
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(invitation.invite_url ?? "")}
          className="rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-[11px] font-semibold text-bark hover:border-ember"
        >
          Copy link
        </button>
      )}
      <button
        type="button"
        onClick={() => onAction(invitation.id, "resend")}
        className="rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-[11px] font-semibold text-bark hover:border-ember"
      >
        Resend
      </button>
      <button
        type="button"
        onClick={() => onAction(invitation.id, "revoke")}
        className="rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ember-deep hover:border-ember-deep"
      >
        Withdraw
      </button>
    </>
  );
}

export function UserManagement() {
  const [members, setMembers] = useState<MemberUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [invitationFilter, setInvitationFilter] = useState<InvitationFilter>("confirmed");
  // Which kind of pending record is showing. Meaningless while Confirmed is
  // selected; the pending tabs only render there.
  const [pendingKindFilter, setPendingKindFilter] = useState<PendingKindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Comfortable or compact, whichever the officer left it on — one setting
  // shared with every other desk table.
  const { dense, toggleDensity } = useTableDensity();
  const cellPad = densityCellPad(dense);
  const [churchName, setChurchName] = useState("this church");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [addAccountType, setAddAccountType] = useState<"member" | "friend">("member");
  const [editingMember, setEditingMember] = useState<MemberUser | null>(null);
  // Members with a profile edit waiting for their own approval, by user id.
  const [pendingChangeIds, setPendingChangeIds] = useState<number[]>([]);
  const fetchProfileChanges = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/users/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const rows = await res.json();
      setPendingChangeIds(
        (Array.isArray(rows) ? rows : [])
          .filter((row: MemberUser & { pending_profile_change?: boolean }) => row.pending_profile_change)
          .map((row: MemberUser) => row.id),
      );
    } catch {
      // The badge is a nicety; never let it break the roster.
    }
  };

  const [formData, setFormData] = useState(initialForm);
  const [age, setAge] = useState("");
  const [editFormData, setEditFormData] = useState<Partial<MemberUser>>({});
  const [editAge, setEditAge] = useState("");
  const [editGifts, setEditGifts] = useState<string[]>([]);
  const [editDisability, setEditDisability] = useState<string[]>([]);

  // ── See Profile (read-only member record) ───────────────────────────────
  // Opens instantly with the roster row, then the detailed payload (date
  // joined, role history, ministry label…) arrives and replaces it.
  const [profileMemberId, setProfileMemberId] = useState<number | null>(null);
  const [profileData, setProfileData] = useState<MemberProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string; credentials?: string } | null>(null);
  const [updatingTypeId, setUpdatingTypeId] = useState<number | null>(null);
  // The row whose activate/deactivate call is in flight.
  const [showAddFriendForm, setShowAddFriendForm] = useState(false);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  // Transfer requests ride in the pending list — that is where the office
  // looks for everything still waiting on them.
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteFormData, setInviteFormData] = useState(inviteFormInitial);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState("");
  // The code travels with the link: it is what the invitee types when their
  // mail app will not open the link, so the office can read it out.
  const [lastInviteCode, setLastInviteCode] = useState("");

  const friendFormInitial = {
    name: "",
    phone_number: "",
    email: "",
    current_church: "",
    baptismal_status: "baptised",
    gender: "",
    date_of_birth: "",
    disability: "",
  };
  const [friendFormData, setFriendFormData] = useState(friendFormInitial);
  // The account-type chooser behind Actions → Account Type. One row at a time,
  // so the roster columns stay read-only.
  const [typeMember, setTypeMember] = useState<MemberUser | null>(null);
  const [typeChoice, setTypeChoice] = useState<AccountTypeOption["value"]>("member");

  const getFilteredMinistries = (gender: string | undefined) => {
    const lower = (gender || "").toLowerCase();
    return MINISTRIES.filter((m) => {
      if (!m.value) return true;
      if (lower === "male" && m.value === "adventist_women") return false;
      if (lower === "female" && m.value === "adventist_men") return false;
      return true;
    });
  };

  const handleGenderChange = (selectedGender: string) => {
    setFormData((prev) => {
      let ministry = prev.ministry;
      const lower = selectedGender.toLowerCase();
      if (lower === "male" && ministry === "adventist_women") {
        ministry = "";
      } else if (lower === "female" && ministry === "adventist_men") {
        ministry = "";
      }
      return { ...prev, gender: selectedGender, ministry };
    });
  };

  const handleEditGenderChange = (selectedGender: string) => {
    setEditFormData((prev) => {
      let newRole = prev.role;
      const lower = selectedGender.toLowerCase();
      if (lower === "male" && newRole === "women_ministry") {
        newRole = "";
      } else if (lower === "female" && newRole === "men_ministry") {
        newRole = "";
      }
      return { ...prev, gender: selectedGender, role: newRole };
    });
  };

  const handleDobChange = (dob: string) => {
    setFormData((prev) => ({ ...prev, date_of_birth: dob }));
    setAge(calculateAgeFromDob(dob));
  };

  const handleAgeChange = (newAge: string) => {
    setAge(newAge);
    if (newAge === "") {
      setFormData((prev) => ({ ...prev, date_of_birth: "" }));
    } else {
      const calculatedDob = calculateDobFromAge(newAge);
      if (calculatedDob) {
        setFormData((prev) => ({ ...prev, date_of_birth: calculatedDob }));
      }
    }
  };

  const handleEditDobChange = (dob: string) => {
    setEditFormData((prev) => ({ ...prev, date_of_birth: dob }));
    setEditAge(calculateAgeFromDob(dob));
  };

  const handleEditAgeChange = (newAge: string) => {
    setEditAge(newAge);
    if (newAge === "") {
      setEditFormData((prev) => ({ ...prev, date_of_birth: "" }));
    } else {
      const calculatedDob = calculateDobFromAge(newAge);
      if (calculatedDob) {
        setEditFormData((prev) => ({ ...prev, date_of_birth: calculatedDob }));
      }
    }
  };

  const fetchMembers = () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/api/members/users/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMembers(data))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  const fetchInvitations = () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    fetch(`${API_URL}/api/members/invitations/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setInvitations(Array.isArray(data) ? data : data.results ?? []))
      .catch(() => setInvitations([]));
    // Transfers join the same pending list; an elder may not read the
    // transfers endpoint, in which case the list quietly carries only the
    // invitations.
    fetch(`${API_URL}/api/members/transfers/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTransfers(Array.isArray(data) ? data : data.results ?? []))
      .catch(() => setTransfers([]));
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteSubmitting(true);
    setMessage(null);
    setLastInviteLink("");
    setLastInviteCode("");
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/invitations/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteFormData.email.trim(),
          first_name: inviteFormData.first_name.trim(),
          last_name: inviteFormData.last_name.trim(),
          phone_number: (inviteFormData.phone_number || "").replace(/\D/g, "").slice(0, 10),
          account_type: inviteFormData.account_type,
          roles: inviteFormData.roles,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || Object.values(data).flat().join(" ") || "Could not send the invitation.");
      setLastInviteLink(data.invite_url || "");
      setLastInviteCode(data.invite_code || "");
      if (data.email_sent) {
        // The link itself is only a fallback for a failed email — success gets a clean popup.
        showAlert("Invitation sent", `Invitation emailed to ${data.email}.`, "success");
      } else {
        setMessage({
          type: "error",
          text: data.detail || "Invitation created, but the email could not be sent. Share the link and code below instead.",
          credentials: invitationCredentials(data),
        });
      }
      setInviteFormData(inviteFormInitial);
      setShowInviteForm(false);
      fetchInvitations();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not send the invitation." });
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleInviteAction = async (id: number, action: "resend" | "revoke") => {
    const token = localStorage.getItem("access_token");
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/invitations/${id}/`, action === "resend"
        ? { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
        : { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not update the invitation.");
      if (action === "resend") {
        setLastInviteLink(data.invite_url || "");
        setLastInviteCode(data.invite_code || "");
        setMessage({
          type: "success",
          text: data.email_sent ? "Invitation email re-sent." : data.detail || "Email could not be sent. Share the link and code below instead.",
          credentials: invitationCredentials(data),
        });
      } else {
        setMessage({ type: "success", text: data.detail || "Invitation withdrawn." });
      }
      fetchInvitations();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not update the invitation." });
    }
  };

  // Withdraw a transfer request from the pending list, after a confirmation.
  const handleCancelTransfer = async (transfer: TransferRow) => {
    const answer = await showAlert(
      "Cancel this transfer request?",
      `The ${transfer.transfer_type === "outgoing" ? "outgoing" : "incoming"} transfer for ${transfer.member_name} (${transfer.other_church}) will be withdrawn from the Requests desk.`,
      "warning",
      { showCancelButton: true, confirmButtonText: "Yes, cancel it" }
    );
    if (!answer?.isConfirmed) return;
    const token = localStorage.getItem("access_token");
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/transfers/${transfer.id}/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not cancel the transfer request.");
      setMessage({ type: "success", text: `Transfer request for ${transfer.member_name} cancelled.` });
      fetchInvitations();
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Could not cancel the transfer request." });
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchInvitations();
    fetchProfileChanges();
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setChurchName(data?.church_name || "this church"))
      .catch(() => setChurchName("this church"));
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");

    const trimmedName = (formData.name || "").trim();
    const parts = trimmedName.split(/\s+/);
    let first_name = "";
    let last_name = "";
    if (parts.length === 1) {
      first_name = parts[0];
      last_name = "";
    } else if (parts.length === 2) {
      first_name = parts[0];
      last_name = parts[1];
    } else {
      first_name = parts.slice(0, -1).join(" ");
      last_name = parts[parts.length - 1];
    }

    const cleanPhone = (formData.phone_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanPhone && cleanPhone.length !== 10) {
      setMessage({ type: "error", text: "Phone number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    const cleanWhatsApp = (formData.whatsapp_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanWhatsApp && cleanWhatsApp.length !== 10) {
      setMessage({ type: "error", text: "WhatsApp number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/members/users/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          phone_number: cleanPhone,
          whatsapp_number: cleanWhatsApp,
          name: trimmedName,
          first_name,
          last_name,
          role: formData.role || "member",
          username: formData.username.trim(),
          password: formData.password,
          gifts: formData.gifts.join(", "),
          disability: formData.disability.filter((d) => d !== "None").join(", "),
          ministry: formData.ministry || "",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          data.temporary_password
            ? {
                type: "success",
                text: `Member '${data.username}' registered. Share these sign-in details now — the password is shown only once.`,
                credentials: `Username: ${data.username}   Password: ${data.temporary_password}`,
              }
            : { type: "success", text: `Member '${data.username}' registered successfully with full record.` },
        );
        setFormData(initialForm);
        setAge("");
        setShowAddForm(false);
        fetchMembers();
      } else {
        setMessage({ type: "error", text: data.detail || Object.values(data).flat().join(" ") || "Failed to register member." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error creating member." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddPerson = (e: React.FormEvent) => {
    if (addAccountType === "friend") {
      return handleAddFriend(e);
    }
    return handleAddMember(e);
  };

  // ── Add Friend ──────────────────────────────────────────────────────────
  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");

    const trimmedName = (friendFormData.name || "").trim();
    if (!trimmedName) {
      setMessage({ type: "error", text: "Friend's name is required." });
      setSubmitting(false);
      return;
    }
    if (!friendFormData.current_church.trim()) {
      setMessage({ type: "error", text: "Current church is required for friends." });
      setSubmitting(false);
      return;
    }
    const parts = trimmedName.split(/\s+/);
    const first_name = parts[0];
    const last_name = parts.length > 1 ? parts[parts.length - 1] : "";

    const cleanPhone = (friendFormData.phone_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanPhone && cleanPhone.length !== 10) {
      setMessage({ type: "error", text: "Phone number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/members/users/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          first_name,
          last_name,
          email: friendFormData.email.trim(),
          phone_number: cleanPhone,
          account_type: "friend",
          username: formData.username.trim(),
          password: formData.password,
          current_church: friendFormData.current_church.trim(),
          baptismal_status: friendFormData.baptismal_status,
          role: "member",
          roles: ["member"],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(
          data.temporary_password
            ? {
                type: "success",
                text: `Friend '${data.username}' added. Share these sign-in details now — the password is shown only once.`,
                credentials: `Username: ${data.username}   Password: ${data.temporary_password}`,
              }
            : { type: "success", text: `Friend '${data.username}' added successfully.` },
        );
        setFriendFormData(friendFormInitial);
        setShowAddFriendForm(false);
        fetchMembers();
      } else {
        setMessage({ type: "error", text: data.detail || Object.values(data).flat().join(" ") || "Failed to add friend." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error adding friend." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (member: MemberUser) => {
    setEditingMember(member);
    setEditAge(calculateAgeFromDob(member.date_of_birth || ""));
    const memberGifts = member.gifts
      ? member.gifts.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setEditGifts(memberGifts);
    const memberDisability = member.disability
      ? member.disability.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setEditDisability(memberDisability);
    setEditFormData({
      first_name: member.first_name || "",
      last_name: member.last_name || "",
      email: member.email || "",
      phone_number: member.phone_number || "",
      whatsapp_number: member.whatsapp_number || "",
      role: member.role || "member",
      profession: member.profession || "",
      gender: member.gender || "",
      date_of_birth: member.date_of_birth || "",
      gifts: member.gifts || "",
      disability: member.disability || "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setSubmitting(true);
    setMessage(null);
    const token = localStorage.getItem("access_token");

    const cleanPhone = (editFormData.phone_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanPhone && cleanPhone.length !== 10) {
      setMessage({ type: "error", text: "Phone number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    const cleanWhatsApp = (editFormData.whatsapp_number || "").replace(/\D/g, "").slice(0, 10);
    if (cleanWhatsApp && cleanWhatsApp.length !== 10) {
      setMessage({ type: "error", text: "WhatsApp number must be exactly 10 digits (e.g. 07XXXXXXXX)." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/members/users/${editingMember.id}/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...editFormData,
          phone_number: cleanPhone,
          whatsapp_number: cleanWhatsApp,
          gifts: editGifts.join(", "),
          disability: editDisability.join(", "),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // 202 means the edit is now a proposal the member must approve; 200
        // means only role(s) changed, which apply at once.
        setMessage(
          res.status === 202
            ? { type: "success", text: data.detail || `Update proposed for '${editingMember.username}'. They approve it on their dashboard.` }
            : { type: "success", text: `Profile updated for '${editingMember.username}'.` },
        );
        setEditingMember(null);
        setEditAge("");
        setEditGifts([]);
        setEditDisability([]);
        fetchMembers();
        if (typeof fetchProfileChanges === "function") fetchProfileChanges();
      } else {
        setMessage({ type: "error", text: data.detail || "Failed to update member profile." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error updating member." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Actions dropdown state ────────────────────────────────────────────────
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);

  const openProfile = async (member: MemberUser) => {
    setProfileMemberId(member.id);
    setProfileData(member);
    setProfileLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/users/${member.id}/profile/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setProfileData(data);
      } else {
        showAlert("Profile unavailable", data.detail || "Could not load this member's profile.", "error");
        setProfileMemberId(null);
        setProfileData(null);
      }
    } catch {
      showAlert("Profile unavailable", "Network error loading the profile.", "error");
      setProfileMemberId(null);
      setProfileData(null);
    } finally {
      setProfileLoading(false);
    }
  };

  // Transfer modal
  const [transferMember, setTransferMember] = useState<MemberUser | null>(null);
  const [transferChurch, setTransferChurch] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [remainFriend, setRemainFriend] = useState(true);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Roles modal: church-wide roles are edited here. The department-managed
  // codes (elder seats, clerk, deacons, department leads) are hidden from the
  // picker — those appointments live in Departments & Ministries.
  const [leadershipMember, setLeadershipMember] = useState<MemberUser | null>(null);

  // Removal request modal

  // Close the action menu on an outside click.
  //
  // This used to test a single ref, and both the table row's menu and the phone
  // card's menu attach `ref` for the same member — so only the last one
  // rendered was "inside" and a mousedown on the other closed the menu before
  // its click could fire. On a desktop that meant the row's actions did
  // nothing at all, while the phone's cards worked. Identifying the open menu
  // by its own marker recognises either of them.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest?.("[data-action-menu]")) return;
      setOpenActionMenuId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [actionDropUp, setActionDropUp] = useState(false);
  const toggleActionMenu = (id: number, el: HTMLElement | null) => {
    if (openActionMenuId === id) {
      setOpenActionMenuId(null);
      return;
    }
    // Open upward when near the bottom of the viewport so the popup is not
    // hidden behind the bottom buttons bar or clipped by the table scroll area.
    if (el) {
      const rect = el.getBoundingClientRect();
      setActionDropUp(window.innerHeight - rect.bottom < 240);
    }
    setOpenActionMenuId(id);
  };

  // The API already leaves system accounts out of the roster, so this is the
  // render-side half of that rule: an account flagged as the installation's
  // owner is never a member row. (It used to guess from the username being
  // literally "superadmin", which missed the real owner account and put it
  // among the congregation.)
  const visibleMembers = members.filter((member) => !member.is_superuser);

  const matchesMemberFilter = (member: MemberUser) => {
    if (memberFilter === "friends") return member.account_type === "friend" && !member.is_disfellowshipped;
    if (memberFilter === "members") return member.account_type !== "friend" && !member.is_disfellowshipped;
    if (memberFilter === "ex_members") return Boolean(member.is_disfellowshipped);
    return true;
  };

  const matchesStatusFilter = (member: MemberUser) =>
    statusFilter === "all" || statusOf(member) === statusFilter;

  const matchesSearchQuery = (m: MemberUser) => {
    const query = search.toLowerCase();
    return Boolean(
      m.username.toLowerCase().includes(query) ||
        m.email.toLowerCase().includes(query) ||
        (`${m.first_name} ${m.last_name}`).toLowerCase().includes(query) ||
        (m.phone_number && m.phone_number.includes(search)) ||
        (m.whatsapp_number && m.whatsapp_number.includes(search)) ||
        (m.profession && m.profession.toLowerCase().includes(query)) ||
        (m.gifts && m.gifts.toLowerCase().includes(query)) ||
        (m.disability && m.disability.toLowerCase().includes(query))
    );
  };

  const pendingInvitations = invitations.filter((invitation) => invitation.status === "pending");
  // The pending list: invitations awaiting acceptance plus transfer requests
  // awaiting review, newest first, with the transfers only when they came
  // back (an elder without clerk access gets invitations alone).
  const pendingTransfers = transfers.filter(
    (t) => t.status === "pending" || t.status === "under_review"
  );
  const pendingRows: PendingRow[] = [
    ...pendingInvitations.map((invitation) => ({ kind: "invitation" as const, id: invitation.id, invitation })),
    ...pendingTransfers.map((transfer) => ({ kind: "transfer" as const, id: 1_000_000 + transfer.id, transfer })),
  ].sort((a, b) => {
    const aTime = a.kind === "invitation" ? a.invitation.created_at : a.transfer.created_at;
    const bTime = b.kind === "invitation" ? b.invitation.created_at : b.transfer.created_at;
    return (bTime || "").localeCompare(aTime || "");
  });
  // Search and the type dropdown narrow the pending list the same way they
  // narrow the roster, so the tabs count within what those two leave — a tab
  // never looks busy and then opens on nothing.
  const pendingScoped = pendingRows.filter((row) => {
    if (memberFilter !== "all" && pendingKindOf(row) !== memberFilter) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const email = (row.kind === "invitation" ? row.invitation.email : row.transfer.email || "").toLowerCase();
    const extra = row.kind === "transfer" ? row.transfer.other_church.toLowerCase() : "";
    return pendingRowName(row).toLowerCase().includes(query) || email.includes(query) || extra.includes(query);
  });
  const filteredPendingRows =
    pendingKindFilter === "all" ? pendingScoped : pendingScoped.filter((row) => pendingKindOf(row) === pendingKindFilter);

  // The status tabs count within what the type filter and the search leave, so
  // a tab never looks busy and then opens on an empty list.
  const rosterScoped = visibleMembers.filter((m) => matchesMemberFilter(m) && matchesSearchQuery(m));

  const statusCounts = rosterScoped.reduce(
    (counts, member) => {
      counts[statusOf(member)] += 1;
      return counts;
    },
    { active: 0, inactive: 0, awaiting: 0 },
  );

  const filteredMembers = rosterScoped.filter(matchesStatusFilter);

  // ── Transfer handler ─────────────────────────────────────────────────────
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferMember) return;
    setTransferSubmitting(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/transfers/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          member_name: `${transferMember.first_name} ${transferMember.last_name}`.trim() || transferMember.username,
          transfer_type: "outgoing",
          other_church: transferChurch,
          reason: transferReason,
          remain_friend: remainFriend,
          phone_number: transferMember.phone_number || "",
          email: transferMember.email || "",
        }),
      });
      if (res.ok) {
        setMessage({ type: "success", text: `Transfer request created for ${transferMember.first_name || transferMember.username}.` });
        setTransferMember(null);
        setTransferChurch("");
        setTransferReason("");
        setRemainFriend(true);
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.detail || "Failed to create transfer request." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setTransferSubmitting(false);
    }
  };

  /** Open the account-type chooser for one member, starting on their record. */
  const openAccountTypeModal = (member: MemberUser) => {
    setTypeMember(member);
    setTypeChoice(accountTypeOf(member.account_type, member.is_disfellowshipped));
    setOpenActionMenuId(null);
  };

  const handleAccountTypeSubmit = async () => {
    if (!typeMember) return;
    const member = typeMember;
    setTypeMember(null);
    await handleQuickTypeChange(member, typeChoice);
  };

  // ── Account type change (member / friend / sabbath school / ex-member) ──
  const handleQuickTypeChange = async (member: MemberUser, nextType: AccountTypeOption["value"]) => {
    const previous = accountTypeOf(member.account_type, member.is_disfellowshipped);
    if (nextType === "ex_member" && previous !== "ex_member") {
      const proceed = confirm(
        `Record ${member.first_name || member.username} as an ex-member? They stay on the church record but are no longer counted as a member or a friend, and can be restored later.`
      );
      if (!proceed) return;
    }

    setUpdatingTypeId(member.id);
    const optimistic = {
      account_type: nextType === "friend" || nextType === "sabbath_school" ? nextType : "member",
      is_disfellowshipped: nextType === "ex_member",
    };
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...optimistic } : m)));
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/users/${member.id}/account-type/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ account_type: nextType }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        // The API answers with the saved record, so the row cannot drift from it.
        setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, ...optimistic } : m)));
        setMessage({ type: "success", text: d.detail || `Recorded as ${accountTypeLabel(nextType)}.` });
      } else {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id
              ? { ...m, account_type: member.account_type, is_disfellowshipped: member.is_disfellowshipped }
              : m
          )
        );
        setMessage({ type: "error", text: d.detail || d.account_type || "Failed to update the record type." });
      }
    } catch {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id
            ? { ...m, account_type: member.account_type, is_disfellowshipped: member.is_disfellowshipped }
            : m
        )
      );
      setMessage({ type: "error", text: "Network error updating the record type." });
    } finally {
      setUpdatingTypeId(null);
    }
  };

  /**
   * Take someone off the membership roll, or put them back on it.
   *
   * This is the removal the desk lost sight of, and it runs on exactly the
   * logic the Type column uses: the person is recorded as an ex-member (their
   * roles fall away, they stay on the church record and their giving history
   * is untouched) or restored to a member. Removing is not deleting, and it is
   * not the same as deactivating — a removed member can still sign in; a
   * deactivated one cannot.
   */
  const handleMembershipChange = async (member: MemberUser, remove: boolean) => {
    const name = member.first_name || member.last_name
      ? `${member.first_name} ${member.last_name}`.trim()
      : member.username;
    const answer = await showAlert(
      remove ? "Remove this person from membership?" : "Restore this person to membership?",
      remove
        ? `${name} will be recorded as an ex-member: no longer counted as a member, and their church roles fall away. They stay on the church record, keep their giving history, and can be restored at any time.`
        : `${name} will be recorded as a member of the church again, and the office can hand them roles as before.`,
      remove ? "warning" : "question",
      {
        showCancelButton: true,
        confirmButtonText: remove ? "Remove" : "Restore",
        cancelButtonText: "Cancel",
        confirmButtonColor: remove ? brand.alert : brand.bark,
      },
    );
    if (!answer.isConfirmed) return;

    setUpdatingTypeId(member.id);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/users/${member.id}/account-type/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ account_type: remove ? "ex_member" : "member" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === member.id
              ? {
                  ...m,
                  is_disfellowshipped: remove,
                  account_type: remove ? m.account_type : (data.account_type ?? "member"),
                  roles: data.roles ?? m.roles,
                  role: data.role ?? m.role,
                }
              : m
          )
        );
        showAlert(
          remove ? "Removed from membership" : "Restored to membership",
          data.detail || `${name} has been recorded as ${remove ? "an ex-member" : "a member"}.`,
          "success",
          { toast: true, timer: 4500, showConfirmButton: false, position: "top-end" },
        );
      } else {
        showAlert("Could not update", data.detail || data.account_type || "The change was not saved.", "error");
      }
    } catch {
      showAlert("Could not update", "Network error updating the record.", "error");
    } finally {
      setUpdatingTypeId(null);
    }
  };

  const handleContactMember = (member: MemberUser) => {
    if (member.phone_number) {
      window.location.href = `tel:${member.phone_number}`;
      return;
    }
    if (member.email) {
      window.location.href = `mailto:${member.email}`;
    }
  };

  // ── Print handler ────────────────────────────────────────────────────────────
  const handlePrintMemberList = () => {
    const token = localStorage.getItem("access_token");
    // Fetch with the Authorization header and open the blob: putting the JWT
    // in the URL would leak it into browser history and the Referer of any
    // request the PDF viewer tab makes.
    fetch(`${API_URL}/api/members/users/list-pdf/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      })
      .catch(() => setMessage({ type: "error", text: "Failed to generate PDF." }));
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-sand-line px-5 py-4 sm:px-6">
        {/* Top row: heading, record count, density and the list tabs together.
            Wraps on the narrowest phones rather than hanging off the edge. */}
        <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="flex items-center gap-1">
            <BackToOverviewArrow />
            {/* Named by the strip above on a wide screen. */}
            <h2 className="text-xl font-bold text-bark md:hidden">User Management</h2>
          </span>
          <div className="ml-auto flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-2 sm:w-auto sm:justify-end">
            <span className="flex shrink-0 items-center gap-2">
              <p className="text-xs text-moss">
                {visibleMembers.length} records registered
              </p>
              {/* Row density: one setting for every desk table, so it sits with
                  the record count rather than among the filters. */}
              <DensityToggle dense={dense} onToggle={toggleDensity} />
            </span>
            {/* The list tabs ride the top row with the heading and the count.
                Confirmed tabs by account state; Pending tabs by what the
                person is joining as. On a phone the group scrolls rather than
                wraps, keeping the band to one line. */}
            {/* The list tabs, on the shared strip. Confirmed tabs by account
                state; Pending tabs by what the person is joining as. The
                counts ride the tabs, so the same control reads the same way
                here as on every other desk. */}
            <SubNav
              className="w-full sm:w-auto"
              label={invitationFilter === "confirmed" ? "Account status filter" : "Pending record type filter"}
              value={invitationFilter === "confirmed" ? statusFilter : pendingKindFilter}
              onChange={(key) =>
                invitationFilter === "confirmed"
                  ? setStatusFilter(key as StatusFilter)
                  : setPendingKindFilter(key as PendingKindFilter)
              }
              items={(invitationFilter === "confirmed" ? STATUS_TABS : PENDING_KIND_TABS).map((tab) => ({
                key: tab.key,
                label: tab.label,
                help: tab.help,
                count:
                  invitationFilter === "confirmed"
                    ? tab.key === "all"
                      ? rosterScoped.length
                      : statusCounts[tab.key as Exclude<StatusFilter, "all">]
                    : pendingScoped.filter((row) => pendingKindOf(row) === tab.key).length,
              }))}
            />
          </div>
        </div>
        {/* Second row: the list chooser, the type filter and the search box. */}
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {/* Phones keep one compact popover; desktop has room for the two
                status filters as separate controls side by side. */}
            <select
              value={invitationFilter}
              onChange={(e) => {
                const key = e.target.value as InvitationFilter;
                setInvitationFilter(key);
                setMemberFilter((current) => (key === "pending" && current === "ex_members" ? "all" : current));
                setStatusFilter("all");
                setPendingKindFilter("all");
              }}
              className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-3 py-2.5 text-xs font-semibold text-bark focus:border-ember focus:outline-none sm:flex-none md:hidden"
              aria-label="Account confirmation filter"
            >
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
            </select>
            <div
              className="hidden h-[38px] shrink-0 items-center rounded-xl border border-sand-line bg-sand p-0.5 md:flex"
              role="group"
              aria-label="Account confirmation filter"
            >
              {(["confirmed", "pending"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setInvitationFilter(key);
                    // Each list remembers its own narrowed state: switching
                    // lists resets the dependent filters, so neither opens
                    // pre-narrowed by a choice made for the other.
                    setMemberFilter((current) => (key === "pending" && current === "ex_members" ? "all" : current));
                    setStatusFilter("all");
                    setPendingKindFilter("all");
                  }}
                  className={`h-8 rounded-lg px-3 text-xs font-semibold capitalize transition ${
                    invitationFilter === key
                      ? "bg-bark text-white shadow-sm"
                      : "text-moss hover:text-bark"
                  }`}
                >
                  {key}
                  {key === "pending" && pendingRows.length > 0 ? ` (${pendingRows.length})` : ""}
                </button>
              ))}
            </div>
            {/* Account type — every list groups by it: the confirmed roster
                includes ex-members, the pending list offers Sabbath School
                instead, since nobody pending was ever a member here. */}
            <select
              value={invitationFilter === "confirmed" ? memberFilter : memberFilter === "ex_members" ? "all" : memberFilter}
              onChange={(e) => setMemberFilter(e.target.value as MemberFilter)}
              className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-3 py-2.5 text-xs font-semibold text-bark focus:border-ember focus:outline-none sm:flex-none"
              aria-label={invitationFilter === "confirmed" ? "Member type filter" : "Pending record type filter"}
            >
              <option value="all">All types</option>
              <option value="members">Members</option>
              <option value="friends">Friends</option>
              {invitationFilter === "confirmed" ? (
                <option value="ex_members">Ex-members</option>
              ) : (
                <option value="sabbath_school">S. School</option>
              )}
            </select>
          </div>
          <input
            type="text"
            placeholder="Search by name, email, phone, gifts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none sm:min-w-[180px] sm:flex-1"
          />
        </div>
      </div>

      {/* ── Alert message ── */}
      {message && (
        <div className={`mx-6 mt-3 shrink-0 rounded-xl p-3 text-xs font-semibold ${message.type === "success" ? "bg-mist-select text-moss-dark" : "bg-red-50 text-red-700"}`}>
          {message.text}
          <button className="ml-3 opacity-60 hover:opacity-100" onClick={() => setMessage(null)}><X size={12} className="inline" aria-hidden="true" /></button>
          {message.credentials && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] tracking-wide text-bark select-all">
                {message.credentials}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(message.credentials || "")}
                className="rounded-lg border border-moss-dark/30 px-2 py-1 text-[11px] font-semibold hover:bg-white"
              >
                Copy
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Scrollable table area ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 pb-2 custom-table-scrollbar sm:px-6">
        {/* The pending list: invitations and transfer requests together, a
            record list like the confirmed roster, filtered by the same kind of
            tabs the confirmed side shows. */}
        {invitationFilter === "pending" && (
          <RecordList
            rows={filteredPendingRows}
            loading={loading}
            rowKey={(row) => `${row.kind}-${row.id}`}
            headers={[
              { label: "#", className: "w-8" },
              { label: "Name" },
              { label: "Email" },
              { label: "Type" },
              { label: "Status" },
              { label: "Actions", className: "text-right" },
            ]}
            loadingLabel="Loading pending records..."
            tableEmpty="No pending records match these filters."
            cardsEmpty="No pending records match these filters."
            renderRow={(row, idx) => (
              <tr key={`${row.kind}-${row.id}`} className="hover:bg-sand">
                <td className={`${cellPad} text-moss w-8`}>{idx + 1}</td>
                <td className={`${cellPad} font-semibold text-bark`}>{pendingRowName(row)}</td>
                <td className={`${cellPad} text-moss`}>
                  {row.kind === "invitation" ? row.invitation.email : row.transfer.email || "—"}
                </td>
                <td className={`${cellPad} text-moss`}>
                  {row.kind === "invitation"
                    ? `${formatRoles(row.invitation.role_codes)} · ${row.invitation.account_type_display}`
                    : pendingRowCategory(row)
                  }
                </td>
                <td className={cellPad}>{pendingRowBadge(row)}</td>
                <td className={`${cellPad} text-right`}>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <PendingRowActions row={row} onInviteAction={handleInviteAction} onCancelTransfer={handleCancelTransfer} />
                  </div>
                </td>
              </tr>
            )}
            renderCard={(row) => (
              <div key={`${row.kind}-${row.id}`} className={`rounded-2xl border border-sand-line bg-sand-plate ${dense ? "px-3 py-2" : "px-4 py-3"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-bark">{pendingRowName(row)}</p>
                    <p className="truncate text-xs text-moss">
                      {row.kind === "invitation"
                        ? `${row.invitation.email} · ${formatRoles(row.invitation.role_codes)} · ${row.invitation.account_type_display}`
                        : `${row.transfer.email || "no email"} · ${row.transfer.other_church}`
                      }
                    </p>
                  </div>
                  {pendingRowBadge(row)}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <PendingRowActions row={row} onInviteAction={handleInviteAction} onCancelTransfer={handleCancelTransfer} />
                </div>
              </div>
            )}
          />
        )}

        {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */}
        <RecordList
          rows={filteredMembers}
          loading={loading}
          rowKey={(m) => m.id}
          hidden={invitationFilter === "pending"}
          headers={[
            { label: "#", className: COL_INDEX },
            { label: "Name", className: COL_NAME },
            { label: "Contact", className: COL_CONTACT },
            { label: "Status", className: COL_STATUS },
            { label: "Role", className: COL_ROLE },
            { label: "Type", className: COL_TYPE },
            { label: "Sex", className: COL_SEX },
            { label: "Actions", className: `${COL_ACTIONS} text-right` },
          ]}
          cardsClassName={dense ? "grid gap-2" : undefined}
          loadingLabel="Loading members..."
          tableEmpty="No members match these filters."
          cardsEmpty="No members match these filters."
          renderRow={(m, idx) => (
                  <tr key={m.id} className={`hover:bg-sand ${m.is_disfellowshipped ? "opacity-70" : ""} ${pendingChangeIds.includes(m.id) ? "bg-sand-glow" : ""}`}>
                    <td className={`${cellPad} text-moss ${COL_INDEX}`}>{idx + 1}</td>
                    <td className={`${cellPad} font-semibold text-bark ${COL_NAME}`}>
                      <div className="min-w-0">
                        <div className="truncate">{m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : m.username}</div>
                        {/* The compact view drops the second line: it is where
                            most of a row's height goes. */}
                        {!dense && (
                          <div className="truncate text-[11px] font-normal text-moss-faint">@{m.username}</div>
                        )}
                      </div>
                    </td>
                    <td className={`${cellPad} text-moss ${COL_CONTACT}`} title={dense ? m.email : undefined}>
                      <div className="truncate">{m.phone_number || m.email || "—"}</div>
                      {!dense && m.phone_number && m.email && <div className="truncate text-[11px]">{m.email}</div>}
                    </td>
                    <td className={`${cellPad} ${COL_STATUS}`}>
                      <AccountStatus member={m} />
                    </td>
                    <td className={`${cellPad} ${COL_ROLE}`}>
                      <RoleCell member={m} />
                    </td>
                    <td className={`${cellPad} ${COL_TYPE}`}>
                      <AccountTypeCell member={m} />
                    </td>
                    {/* No extra left padding: the value lines up under its own
                        SEX heading rather than sitting a nudge to the right. */}
                    <td className={`${cellPad} text-moss ${COL_SEX}`}>{m.gender || "—"}</td>
                    <td className={`${cellPad} text-right ${COL_ACTIONS}`}>
                      <div className="relative inline-block" data-action-menu>
                        <button
                          onClick={(e) => toggleActionMenu(m.id, e.currentTarget)}
                          className="rounded-lg border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand"
                        >
                          ⋯ Actions
                        </button>
                        {openActionMenuId === m.id && (
                          <div className={`absolute right-0 z-50 w-48 rounded-xl border border-sand-line bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                            <button
                              onClick={() => { openProfile(m); setOpenActionMenuId(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                            >
                              <User size={12} aria-hidden="true" /> See Profile
                            </button>
                            <button
                              onClick={() => { handleContactMember(m); setOpenActionMenuId(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                            >
                              <Phone size={12} aria-hidden="true" /> Contact Member
                            </button>
                            <button
                              onClick={() => { setTransferMember(m); setOpenActionMenuId(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                            >
                              <ArrowLeftRight size={12} aria-hidden="true" /> Transfer Member
                            </button>
                            <button
                              onClick={() => { setLeadershipMember(m); setOpenActionMenuId(null); }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                            >
                              <Check size={12} aria-hidden="true" /> Roles
                            </button>
                            <button
                              onClick={() => openAccountTypeModal(m)}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                            >
                              <SlidersHorizontal size={12} aria-hidden="true" /> Account Type
                            </button>
                            {m.is_disfellowshipped ? (
                              <button
                                onClick={() => { handleMembershipChange(m, false); setOpenActionMenuId(null); }}
                                disabled={updatingTypeId === m.id}
                                className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand disabled:opacity-60"
                              >
                                <Undo2 size={12} aria-hidden="true" /> Restore
                              </button>
                            ) : (
                              <button
                                onClick={() => { handleMembershipChange(m, true); setOpenActionMenuId(null); }}
                                disabled={updatingTypeId === m.id}
                                className="flex w-full items-center gap-2 px-4 py-2 text-xs text-alert hover:bg-alert-wash disabled:opacity-60"
                              >
                                <Trash2 size={12} aria-hidden="true" /> Remove
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
          renderCard={(m) => {
              const name = m.first_name || m.last_name ? `${m.first_name} ${m.last_name}`.trim() : m.username;
              const contact = m.phone_number || m.email || "—";
              return (
                <div key={m.id} className={`rounded-2xl border border-sand-line shadow-sm space-y-2 ${dense ? "p-2.5" : "p-4"} ${m.is_disfellowshipped ? "border-red-200 bg-red-50/30" : ""} ${pendingChangeIds.includes(m.id) ? "bg-sand-glow" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-bark">
                        {name}

                      </h3>
                      {!dense && (
                        <p className="text-[11px] text-moss-faint mt-0.5">@{m.username}</p>
                      )}
                      <p className="text-xs text-moss mt-0.5">{contact}</p>
                      <div className="mt-0.5 truncate text-xs font-semibold text-bark">
                        <RoleCell member={m} />
                      </div>
                    </div>
                    {/* What the row says about them, where the old type combo
                        sat: their record type, read-only — changing it is a
                        decision taken from the Actions menu. */}
                    <div className="shrink-0 text-right">
                      <AccountTypeCell member={m} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-sand-line/60 pt-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <AccountStatus member={m} />
                      {m.gender ? (
                        <p className="min-w-0 truncate text-xs text-moss"><span className="font-semibold text-bark">Sex:</span> {m.gender}</p>
                      ) : null}
                    </div>
                    {/* The card's actions live in one menu, anchored to this
                        button — nothing shows until it is asked for. */}
                    <div className="relative inline-block" data-action-menu>
                      <button
                        onClick={(e) => toggleActionMenu(m.id, e.currentTarget)}
                        aria-expanded={openActionMenuId === m.id}
                        aria-label={`Actions for ${name}`}
                        className="rounded-lg border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand"
                      >
                        ⋯ Actions
                      </button>
                      {openActionMenuId === m.id && (
                        <div className={`absolute right-0 z-50 w-48 rounded-xl border border-sand-line bg-white py-1 shadow-lg ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}>
                          <button
                            onClick={() => { handleStartEdit(m); setOpenActionMenuId(null); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                          >
                            <Pencil size={12} aria-hidden="true" /> Edit Profile
                          </button>
                          <button
                            onClick={() => { handleContactMember(m); setOpenActionMenuId(null); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                          >
                            <Phone size={12} aria-hidden="true" /> Contact Member
                          </button>
                          <button
                            onClick={() => { setTransferMember(m); setOpenActionMenuId(null); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                          >
                            <ArrowLeftRight size={12} aria-hidden="true" /> Transfer Member
                          </button>
                          <button
                            onClick={() => { setLeadershipMember(m); setOpenActionMenuId(null); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                          >
                            <Check size={12} aria-hidden="true" /> Roles
                          </button>
                          <button
                            onClick={() => openAccountTypeModal(m)}
                            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
                          >
                            <SlidersHorizontal size={12} aria-hidden="true" /> Account Type
                          </button>
                          {m.is_disfellowshipped ? (
                            <button
                              onClick={() => { handleMembershipChange(m, false); setOpenActionMenuId(null); }}
                              disabled={updatingTypeId === m.id}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand disabled:opacity-60"
                            >
                              <Undo2 size={12} aria-hidden="true" /> Restore
                            </button>
                          ) : (
                            <button
                              onClick={() => { handleMembershipChange(m, true); setOpenActionMenuId(null); }}
                              disabled={updatingTypeId === m.id}
                              className="flex w-full items-center gap-2 px-4 py-2 text-xs text-alert hover:bg-alert-wash disabled:opacity-60"
                            >
                              <Trash2 size={12} aria-hidden="true" /> Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
      </div>

      {/* ── Bottom bar: Print + Add ── */}
      <div className="shrink-0 border-t border-sand-line bg-white p-4 sm:px-6 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* The count line is a desktop nicety; on phones the buttons need the width. */}
        <p className="hidden text-[11px] text-moss sm:block">
          {invitationFilter === "pending" ? `${filteredPendingRows.length} of ${pendingRows.length} pending record${pendingRows.length === 1 ? "" : "s"} shown` : `${filteredMembers.length} of ${visibleMembers.length} confirmed records shown`}
        </p>
        {/* Large screens get one row of three equal-width buttons under their
            full names; below that the same actions stay a three-column grid of
            compact labels, which is all a phone has room for. */}
        <div className="grid grid-cols-3 gap-2 lg:flex lg:w-auto lg:gap-2">
          <button
            onClick={() => { setInviteFormData(inviteFormInitial); setShowInviteForm(true); setLastInviteLink(""); fetchInvitations(); }}
            className="rounded-xl bg-bark px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember lg:w-44"
          >
            <span className="lg:hidden"><Mail size={12} className="inline" aria-hidden="true" /> Invite</span>
            <span className="hidden lg:inline">Invite via Email</span>
          </button>
          <button
            onClick={() => { setFormData(initialForm); setFriendFormData(friendFormInitial); setAge(""); setAddStep(1); setAddAccountType("member"); setShowAddForm(true); setEditingMember(null); }}
            className="rounded-xl border border-bark bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:bg-sand lg:w-44"
          >
            <span className="lg:hidden">+ Add</span>
            <span className="hidden lg:inline">Add Manually</span>
          </button>
          <button
            onClick={handlePrintMemberList}
            className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand lg:w-44"
          >
            <span className="lg:hidden"><Printer size={12} className="inline" aria-hidden="true" /> Print</span>
            <span className="hidden lg:inline">Print Users List</span>
          </button>
        </div>
      </div>

      {/* The friend fields now live in the shared Add Person modal. */}
      {false && showAddFriendForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="add-friend-title"
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white px-6 py-4 shadow-2xl ring-1 ring-sand-line sm:px-8 sm:py-5">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div>
                <h3 id="add-friend-title" className="text-xl font-bold text-bark">Add New Friend</h3>
                <p className="mt-0.5 text-xs text-moss">Register a friend of the church (no login access).</p>
              </div>
              <button type="button" onClick={() => setShowAddFriendForm(false)} className="text-moss hover:text-bark text-xl leading-none"><X size={18} aria-hidden="true" /></button>
            </div>
            <form onSubmit={handleAddFriend} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-bark">Full Name *</label>
                <input
                  type="text"
                  required
                  value={friendFormData.name}
                  onChange={(e) => setFriendFormData({ ...friendFormData, name: e.target.value })}
                  placeholder="e.g. Grace Achieng"
                  className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-bark">Phone Number</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={friendFormData.phone_number}
                    onChange={(e) => setFriendFormData({ ...friendFormData, phone_number: e.target.value })}
                    placeholder="07XXXXXXXX"
                    className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">Email</label>
                  <input
                    type="email"
                    value={friendFormData.email}
                    onChange={(e) => setFriendFormData({ ...friendFormData, email: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-bark">Sex / Gender</label>
                  <select
                    value={friendFormData.gender || ""}
                    onChange={(e) => setFriendFormData({ ...friendFormData, gender: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                  >
                    <option value="">-- Select Sex --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">Date of Birth</label>
                  <input
                    type="date"
                    value={friendFormData.date_of_birth || ""}
                    onChange={(e) => setFriendFormData({ ...friendFormData, date_of_birth: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-bark">Disability / Special Needs</label>
                <select
                  value={friendFormData.disability || ""}
                  onChange={(e) => setFriendFormData({ ...friendFormData, disability: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                >
                  <option value="">None / None Recorded</option>
                  <option value="Physical / Mobility">Physical / Mobility Impairment</option>
                  <option value="Visual">Visual Impairment / Blindness</option>
                  <option value="Hearing">Hearing Impairment / Deafness</option>
                  <option value="Speech">Speech / Communication Needs</option>
                  <option value="Intellectual">Intellectual / Learning Support</option>
                  <option value="Other">Other Special Need</option>
                </select>
                <p className="mt-1 text-[11px] text-moss">
                  Note: Friends with a recorded disability automatically belong to <span className="font-bold text-ember">Adventist Possibility Ministries (APM)</span>.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-bark">Current Church *</label>
                <input
                  type="text"
                  required
                  value={friendFormData.current_church}
                  onChange={(e) => setFriendFormData({ ...friendFormData, current_church: e.target.value })}
                  placeholder="Church they currently attend"
                  className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                  title="The church this friend currently attends"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-bark">Baptismal Status</label>
                <select
                  value={friendFormData.baptismal_status}
                  onChange={(e) => setFriendFormData({ ...friendFormData, baptismal_status: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
                >
                  <option value="baptised">Baptised</option>
                  <option value="not_baptised">Not Baptised</option>
                  <option value="transfer_pending">Transfer In Progress</option>
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-sand-line pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddFriendForm(false)}
                  className="rounded-xl border border-sand-mute px-5 py-2 text-xs font-semibold text-moss hover:border-ember"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-ember px-5 py-2 text-xs font-semibold text-white disabled:opacity-60 transition hover:bg-ember-deep"
                >
                  {submitting ? "Adding..." : "Add Friend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Add Member Modal ══ */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="add-member-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white px-6 py-4 shadow-2xl ring-1 ring-sand-line sm:px-8 sm:py-5">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div>
                <h3 id="add-member-title" className="text-xl font-bold text-bark">Add User</h3>
                <p className="mt-0.5 text-xs text-moss">Step {addStep} of 2 · {addStep === 1 ? "Basic account details" : "Additional details"}</p>
              </div>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="rounded-full p-2 text-moss hover:bg-sand hover:text-bark transition text-xl leading-none" aria-label="Close modal"><X size={18} aria-hidden="true" /></button>
            </div>

            <form onSubmit={addStep === 1 ? (e) => { e.preventDefault(); setAddStep(2); } : handleAddPerson} className="mt-3.5 space-y-4">
              {addStep === 1 && (
                <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                <label className="block text-xs font-semibold text-bark">Account Type *</label>
                <select
                  value={addAccountType}
                  onChange={(e) => setAddAccountType(e.target.value as "member" | "friend")}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none"
                >
                  <option value="member">Church Member</option>
                  <option value="friend">Friend of the Church</option>
                </select>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-bark">Name *</label>
                  <input type="text" required placeholder="Enter full name" value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      setFriendFormData({ ...friendFormData, name: e.target.value });
                    }}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Sex */}
                <div>
                  <label className="block text-xs font-semibold text-bark">Sex</label>
                  <select value={formData.gender} onChange={(e) => handleGenderChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none">
                    <option value="">-- Select Sex --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-bark">Phone Number</label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="e.g. 07XXXXXXXX"
                    value={formData.phone_number}
                    onChange={(e) => {
                      const phone = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setFormData({ ...formData, phone_number: phone });
                      setFriendFormData({ ...friendFormData, phone_number: phone });
                    }}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="block text-xs font-semibold text-bark">WhatsApp Number</label>
                  <input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="e.g. 07XXXXXXXX"
                    value={formData.whatsapp_number}
                    onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-bark">Email Address {addAccountType === "member" ? "*" : ""}</label>
                  <input type="email" required={addAccountType === "member"} placeholder="member@example.com" value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setFriendFormData({ ...friendFormData, email: e.target.value });
                    }}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>

                {/* Login credentials */}
                <div>
                  <label className="block text-xs font-semibold text-bark">Username *</label>
                  <input type="text" required autoComplete="off" placeholder="e.g. grace.wanjiku" value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">Initial Password *</label>
                  <input type="text" required autoComplete="off" value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                  <p className="mt-1 text-[10px] text-moss">They must change this password at first login.</p>
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-semibold text-bark">Date of Birth</label>
                  <input type="date" value={formData.date_of_birth}
                    onChange={(e) => handleDobChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>

                {/* Age */}
                <div>
                  <label className="block text-xs font-semibold text-bark">Age (Years)</label>
                  <input type="number" min="0" max="130" placeholder="e.g. 25" value={age}
                    onChange={(e) => handleAgeChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>

              </div>
              </>
              )}

              {addStep === 2 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Profession follows age on the second step. */}
                    <div>
                      <label className="block text-xs font-semibold text-bark">Profession / Occupation</label>
                      <ProfessionCombobox value={formData.profession} onChange={(val) => setFormData({ ...formData, profession: val })} />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-bark">Ministry</label>
                      {/* Ministry membership, not a role: roles are handed out in
                          the Role column, so a new member is never secretly made
                          a ministry's leader here. */}
                      <select value={formData.ministry}
                        onChange={(e) => setFormData({ ...formData, ministry: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none">
                        {getFilteredMinistries(formData.gender).map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

              {addAccountType === "friend" && (
                <div className="grid gap-4 sm:grid-cols-2 rounded-2xl border border-sand-line bg-sand-plate p-4">
                  <div>
                    <label className="block text-xs font-semibold text-bark">Current Church *</label>
                    <input type="text" required value={friendFormData.current_church}
                      onChange={(e) => setFriendFormData({ ...friendFormData, current_church: e.target.value })}
                      placeholder="Church they currently attend"
                      className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3.5 py-2.5 text-xs focus:border-ember focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-bark">Baptismal Status</label>
                    <select value={friendFormData.baptismal_status}
                      onChange={(e) => setFriendFormData({ ...friendFormData, baptismal_status: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3.5 py-2.5 text-xs focus:border-ember focus:outline-none">
                      <option value="baptised">Baptised</option>
                      <option value="not_baptised">Not Baptised</option>
                      <option value="transfer_pending">Transfer In Progress</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-bark">Gifts &amp; Talents</label>
                  <GiftsCombobox selectedGifts={formData.gifts} onChange={(gifts) => setFormData({ ...formData, gifts })} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-bark">Disability / Special Needs</label>
                  <DisabilityCombobox selectedDisabilities={formData.disability} onChange={(d) => setFormData({ ...formData, disability: d })} />
                </div>
              </div>

              {message && (
                <div className={`rounded-xl p-3 text-xs font-semibold ${message.type === "success" ? "bg-mist-select text-moss-dark" : "bg-red-50 text-red-700"}`}>{message.text}</div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setAddStep(1)}
                  className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss hover:border-ember">
                  Back
                </button>
                <button type="button" onClick={() => setShowAddForm(false)}
                  className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss hover:border-ember">
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="rounded-full bg-bark px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-ember">
                  {submitting ? "Registering..." : addAccountType === "friend" ? "Add Friend" : "Register Member"}
                </button>
              </div>
                </>
              )}
              {addStep === 1 && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowAddForm(false)} className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss hover:border-ember">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-full bg-bark px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-ember">
                    Next: Additional Details
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ══ Invite by Email Modal ══ */}
      {showInviteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="invite-member-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-sand-line sm:px-8">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div>
                <h3 id="invite-member-title" className="text-xl font-bold text-bark">Invite by Email</h3>
                <p className="mt-0.5 text-xs text-moss">
                  They receive a link, choose their own username and password, then sign in.
                </p>
              </div>
              <button type="button" onClick={() => setShowInviteForm(false)} className="text-moss hover:text-bark text-xl leading-none"><X size={18} aria-hidden="true" /></button>
            </div>

            <form onSubmit={handleSendInvite} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-bark">Email Address *</label>
                  <input type="email" required placeholder="leader@example.com" value={inviteFormData.email}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">First Name *</label>
                  <input type="text" required value={inviteFormData.first_name}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, first_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">Last Name</label>
                  <input type="text" value={inviteFormData.last_name}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, last_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">Phone Number</label>
                  <input type="tel" placeholder="07XXXXXXXX" value={inviteFormData.phone_number}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, phone_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">Account Type</label>
                  <select value={inviteFormData.account_type}
                    onChange={(e) => setInviteFormData({ ...inviteFormData, account_type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-sand-plate px-3.5 py-2.5 text-xs text-bark focus:border-ember focus:bg-white focus:outline-none">
                    <option value="member">Church Member</option>
                    <option value="friend">Friend of the Church</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-bark">Access / Roles</label>
                  <p className="mt-1 rounded-xl border border-sand-line bg-white px-3 py-2.5 text-[11px] text-moss">
                    Roles are given in Departments &amp; Ministries — each area fills its own offices.
                  </p>
                </div>
              </div>

              {message && (
                <div className={`rounded-xl p-3 text-xs font-semibold ${message.type === "success" ? "bg-mist-select text-moss-dark" : "bg-red-50 text-red-700"}`}>
                  {message.text}
                  {lastInviteLink && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-bark select-all">
                        {lastInviteLink}
                      </code>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(lastInviteLink)}
                        className="rounded-lg border border-moss-dark/30 px-2 py-1 text-[11px] font-semibold hover:bg-white">
                        Copy link
                      </button>
                    </div>
                  )}
                  {lastInviteCode && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="rounded-lg bg-white px-2 py-1 font-mono text-[11px] tracking-wider text-bark select-all">
                        {lastInviteCode}
                      </code>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(lastInviteCode)}
                        className="rounded-lg border border-moss-dark/30 px-2 py-1 text-[11px] font-semibold hover:bg-white">
                        Copy code
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowInviteForm(false)}
                  className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss hover:border-ember">
                  Cancel
                </button>
                <button type="submit" disabled={inviteSubmitting}
                  className="rounded-full bg-bark px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-ember disabled:opacity-60">
                  {inviteSubmitting ? "Sending…" : "Send Invitation"}
                </button>
              </div>
            </form>

            {/* Pending, accepted and withdrawn invitations */}
            {false && invitations.length > 0 && (
              <div className="mt-6 border-t border-sand-line pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-moss">Invitations</p>
                <div className="mt-3 space-y-2">
                  {invitations.map((invitation) => (
                    <div key={invitation.id} className="rounded-xl border border-sand-line bg-sand-plate px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-bark">
                            {[invitation.first_name, invitation.last_name].filter(Boolean).join(" ") || invitation.email}
                          </p>
                          <p className="truncate text-[11px] text-moss">
                            {invitation.email} · {formatRoles(invitation.role_codes)} · {invitation.account_type_display}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${invitation.status === "pending" ? "bg-mist-select text-moss-dark" : invitation.status === "accepted" ? "bg-bark text-white" : "bg-gold-blush text-ember-deep"}`}>
                          {invitation.status === "pending" ? `Pending · expires ${new Date(invitation.expires_at).toLocaleDateString()}` : invitation.status === "accepted" ? "Accepted" : invitation.status === "expired" ? "Expired" : "Withdrawn"}
                        </span>
                      </div>
                      {invitation.status !== "accepted" && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {invitation.invite_url && (
                            <button type="button" onClick={() => navigator.clipboard?.writeText(invitation.invite_url ?? "")}
                              className="rounded-lg border border-sand-mute bg-white px-2 py-1 text-[11px] font-semibold text-bark hover:border-ember">
                              Copy link
                            </button>
                          )}
                          <button type="button" onClick={() => handleInviteAction(invitation.id, "resend")}
                            className="rounded-lg border border-sand-mute bg-white px-2 py-1 text-[11px] font-semibold text-bark hover:border-ember">
                            Resend
                          </button>
                          <button type="button" onClick={() => handleInviteAction(invitation.id, "revoke")}
                            className="rounded-lg border border-sand-mute bg-white px-2 py-1 text-[11px] font-semibold text-ember-deep hover:border-ember-deep">
                            Withdraw
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ See Profile (read-only member record) ══ */}
      {profileMemberId && profileData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="profile-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white px-6 py-4 shadow-2xl ring-1 ring-sand-line sm:px-8 sm:py-5">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div>
                <h3 id="profile-title" className="text-xl font-bold text-bark">
                  {profileData.first_name || profileData.last_name
                    ? `${profileData.first_name || ""} ${profileData.last_name || ""}`.trim()
                    : profileData.username}
                </h3>
                <p className="text-[11px] text-moss-faint">
                  @{profileData.username}
                  {profileData.date_joined ? ` · Joined ${fmtDate(profileData.date_joined)}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => { setProfileMemberId(null); setProfileData(null); }}
                className="rounded-full p-2 text-moss hover:bg-sand text-xl leading-none"><X size={18} aria-hidden="true" /></button>
            </div>

            {profileLoading && <p className="mt-3 text-[11px] text-moss">Loading full record…</p>}

            <div className="mt-4 space-y-5">
              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-moss-faint">Basic details</h4>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <ProfileField label="Email" value={profileData.email} />
                  <ProfileField label="Phone" value={profileData.phone_number} />
                  <ProfileField label="WhatsApp" value={profileData.whatsapp_number} />
                  <ProfileField label="Sex" value={profileData.gender} />
                  <ProfileField label="Date of birth" value={profileData.date_of_birth ? fmtDate(profileData.date_of_birth) : ""} />
                  <ProfileField label="Residence" value={profileData.residence} />
                  <ProfileField label="Profession" value={profileData.profession} />
                  <ProfileField label="Type" value={profileData.account_type ? accountTypeLabel(profileData.account_type) : ""} />
                  {/* The account's own state, so a deactivation can be confirmed
                      here and not only in the roster's Status column. */}
                  <ProfileField
                    label="Status"
                    value={
                      profileData.is_active === false
                        ? profileData.deactivated_at
                          ? `Inactive — switched off on ${fmtDate(profileData.deactivated_at)}`
                          : "Inactive — awaiting approval"
                        : "Active"
                    }
                  />
                  <ProfileField label="Ministry" value={profileData.ministry_label} />
                  <ProfileField label="Baptismal status" value={profileData.baptismal_status_label || profileData.baptismal_status} />
                  <ProfileField label="Disability / special needs" value={profileData.disability} />
                </div>
              </section>

              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-moss-faint">Gifts &amp; talents</h4>
                <p className="mt-1 text-xs text-bark">{profileData.gifts?.trim() || "—"}</p>
              </section>

              <section>
                <h4 className="text-xs font-bold uppercase tracking-wide text-moss-faint">Current roles</h4>
                {(profileData.current_roles && profileData.current_roles.length > 0) ? (
                  <ul className="mt-2 space-y-1">
                    {profileData.current_roles.map((r) => (
                      <li key={r.role} className="flex items-center justify-between rounded-lg bg-sand px-3 py-1.5 text-xs text-bark">
                        <span className="font-semibold">{r.role_label}</span>
                        <span className="text-[10px] text-moss">since {fmtDate(r.started_at)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  // No office held: `member` is the default state, not a role.
                  <p className="mt-1 text-xs text-bark">{NO_ROLE_LABEL}</p>
                )}
              </section>

              {(profileData.past_roles && profileData.past_roles.length > 0) && (
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-moss-faint">Roles served</h4>
                  <ul className="mt-2 space-y-1">
                    {profileData.past_roles.map((r) => (
                      <li key={`${r.role}-${r.ended_at}`} className="flex items-center justify-between rounded-lg border border-sand-line px-3 py-1.5 text-xs text-moss">
                        <span className="font-semibold text-bark">{r.role_label}</span>
                        <span className="text-[10px]">{fmtDate(r.started_at)} – {fmtDate(r.ended_at)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="rounded-xl bg-sand-cream px-4 py-3 text-[11px] leading-relaxed text-moss">
                To correct any of these details, use <strong className="text-bark">Assign Leadership</strong> for roles,
                or ask the clerk to propose a change — the member approves it on their dashboard before anything is applied.
              </p>

              {/* Where an officer reviewing a record looks for the roster's own
                  decision, instead of only in the row's menu. Removal is the
                  one account act here: an account is either on the membership
                  roll or off it — there is no separate "switched off" state to
                  reach for. */}
              {(() => {
                const member = members.find((m) => m.id === profileMemberId);
                if (!member || member.is_superuser) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2 border-t border-sand-line pt-3">
                    <button
                      type="button"
                      disabled={updatingTypeId === member.id}
                      onClick={() => handleMembershipChange(member, !member.is_disfellowshipped)}
                      className="rounded-full border border-sand-mute bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember disabled:opacity-50"
                    >
                      {member.is_disfellowshipped ? <><Undo2 size={12} className="inline" aria-hidden="true" /> Restore</> : <><Trash2 size={12} className="inline" aria-hidden="true" /> Remove</>}
                    </button>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 pb-1">
                <button type="button"
                  onClick={() => { const member = members.find((m) => m.id === profileMemberId); if (member) { setProfileMemberId(null); setProfileData(null); handleStartEdit(member); } }}
                  className="rounded-full bg-bark px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-ember">
                  Propose Changes
                </button>
                <button type="button" onClick={() => { setProfileMemberId(null); setProfileData(null); }}
                  className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss hover:border-ember">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Edit Profile Modal ══ */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-member-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white px-6 py-4 shadow-2xl ring-1 ring-sand-line sm:px-8 sm:py-5">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 id="edit-member-title" className="text-xl font-bold text-bark">
                Edit Profile — {editingMember.first_name || editingMember.username}
              </h3>
              <button type="button" onClick={() => setEditingMember(null)} className="rounded-full p-2 text-moss hover:bg-sand text-xl leading-none"><X size={18} aria-hidden="true" /></button>
            </div>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-bark">First Name</label>
                  <input type="text" value={editFormData.first_name || ""} onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Last Name</label>
                  <input type="text" value={editFormData.last_name || ""} onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Email</label>
                  <input type="email" value={editFormData.email || ""} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Phone Number</label>
                  <input type="tel" inputMode="numeric" maxLength={10} value={editFormData.phone_number || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, phone_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">WhatsApp Number</label>
                  <input type="tel" inputMode="numeric" maxLength={10} value={editFormData.whatsapp_number || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, whatsapp_number: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Sex</label>
                  <select value={editFormData.gender || ""} onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none">
                    <option value="">-- Select Sex --</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Date of Birth</label>
                  <input type="date" value={editFormData.date_of_birth || ""} onChange={(e) => handleEditDobChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Age (Years)</label>
                  <input type="number" min="0" max="130" placeholder="e.g. 25" value={editAge} onChange={(e) => handleEditAgeChange(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Profession / Occupation</label>
                  <ProfessionCombobox value={editFormData.profession || ""} onChange={(val) => setEditFormData({ ...editFormData, profession: val })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Residence</label>
                  <input type="text" placeholder="Estate, street or town" value={editFormData.residence || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, residence: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Gifts &amp; Talents</label>
                  <GiftsCombobox selectedGifts={editGifts} onChange={setEditGifts} placeholder="Select spiritual gifts..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-bark">Disability / Special Needs</label>
                  <DisabilityCombobox selectedDisabilities={editDisability} onChange={setEditDisability} placeholder="Select disability (optional)..." />
                </div>
              </div>
              <p className="rounded-xl bg-sand-cream px-4 py-3 text-[11px] leading-relaxed text-moss">
                Profile changes take effect when <strong className="text-bark">{editingMember.first_name || editingMember.username}</strong> approves
                them — they&apos;ll get a notification on their dashboard and can accept or keep their current details. Role changes apply immediately.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="rounded-full bg-bark px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-ember">
                  {submitting ? "Sending…" : "Send Update for Approval"}
                </button>
                <button type="button" onClick={() => setEditingMember(null)}
                  className="rounded-full border border-sand-mute bg-white px-5 py-2.5 text-xs font-semibold text-moss hover:border-ember">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* ══ Transfer Modal ══ */}
      {transferMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-sand-line">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="text-base font-bold text-bark">
                Transfer Member — {transferMember.first_name || transferMember.username}
              </h3>
              <button onClick={() => setTransferMember(null)} className="text-moss hover:text-bark text-xl leading-none"><X size={18} aria-hidden="true" /></button>
            </div>
            <form onSubmit={handleTransferSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-bark">Destination Church *</label>
                <input type="text" required placeholder="e.g. Meru Central SDA" value={transferChurch}
                  onChange={(e) => setTransferChurch(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-bark">Reason (Optional)</label>
                <textarea rows={3} placeholder="Reason for transfer..." value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={transferSubmitting}
                  className="rounded-xl bg-bark px-5 py-2 text-xs font-semibold text-white hover:bg-ember">
                  {transferSubmitting ? "Processing..." : "Submit Transfer"}
                </button>
                <button type="button" onClick={() => setTransferMember(null)}
                  className="rounded-xl border border-sand-mute px-5 py-2 text-xs font-semibold text-moss hover:border-ember">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Account Type Modal ══ */}
      {typeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-sand-line">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="text-base font-bold text-bark">
                Account Type — {typeMember.first_name || typeMember.username}
              </h3>
              <button onClick={() => setTypeMember(null)} className="text-moss hover:text-bark text-xl leading-none"><X size={18} aria-hidden="true" /></button>
            </div>
            {accountTypeOf(typeMember.account_type, typeMember.is_disfellowshipped) === "ex_member" && (
              <p className="mt-3 rounded-xl bg-sand-glow px-3 py-2 text-[11px] text-ember-deep">
                They are recorded as an ex-member. Choosing a type here puts them back on the church roll.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {/* Ex-member is deliberately absent: being on the roll or off it
                  is the Remove / Restore decision, not this one. */}
              {ACCOUNT_TYPE_OPTIONS.filter((option) => option.value !== "ex_member").map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTypeChoice(option.value)}
                  aria-pressed={typeChoice === option.value}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                    typeChoice === option.value
                      ? "border-ember bg-sand-glow"
                      : "border-sand-line bg-white hover:border-ember"
                  }`}
                >
                  <span
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      typeChoice === option.value ? "border-ember bg-ember" : "border-sand-mute"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-bark">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] text-moss">{option.help}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleAccountTypeSubmit}
                disabled={updatingTypeId === typeMember.id || typeChoice === "ex_member"}
                className="rounded-xl bg-bark px-5 py-2 text-xs font-semibold text-white hover:bg-ember disabled:opacity-60"
              >
                {updatingTypeId === typeMember.id ? "Saving..." : "Save Type"}
              </button>
              <button
                type="button"
                onClick={() => setTypeMember(null)}
                className="rounded-xl border border-sand-mute px-5 py-2 text-xs font-semibold text-moss hover:border-ember"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Roles Modal — church-wide roles, editable here ══ */}
      {leadershipMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white px-6 py-5 shadow-2xl ring-1 ring-sand-line">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="text-base font-bold text-bark">
                Roles — {leadershipMember.first_name || leadershipMember.username}
              </h3>
              <button onClick={() => setLeadershipMember(null)} className="text-moss hover:text-bark text-xl leading-none"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-bark">Roles held</label>
                <p className="mt-0.5 text-[10px] text-moss">
                  Church-wide roles are assigned here. Elder seats, the clerk, deacons and department leaders are appointed in Departments &amp; Ministries.
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-sand-line bg-sand-plate px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-bark">
                    {orderRolesBySeniority(
                      leadershipRoles(
                        leadershipMember.roles && leadershipMember.roles.length > 0
                          ? leadershipMember.roles
                          : [leadershipMember.role || "member"]
                      )
                    )
                      .map((code) => roleDisplayLabel(code, leadershipMember.assistant_roles || []))
                      .join(", ") || NO_ROLE_LABEL}
                  </span>
                  <RolesCombobox
                    fill={false}
                    selected={leadershipMember.roles && leadershipMember.roles.length > 0 ? leadershipMember.roles : [leadershipMember.role || "member"]}
                    assistants={leadershipMember.assistant_roles || []}
                    showAssistants
                    memberId={leadershipMember.id}
                    hiddenRoles={DEPARTMENT_MANAGED_ROLE_CODES}
                    onChange={(roles, assistants) => {
                      const token = localStorage.getItem("access_token");
                      fetch(`${API_URL}/api/members/users/${leadershipMember.id}/role/`, {
                        method: "PATCH",
                        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ roles, assistant_roles: assistants }),
                      })
                        .then(async (res) => {
                          if (res.ok) {
                            showAlert("Roles updated", "", "success", { toast: true, timer: 3500, showConfirmButton: false });
                            setLeadershipMember(null);
                            refreshRoleRegister();
                            fetchMembers();
                          } else {
                            const data = await res.json().catch(() => ({}));
                            showAlert("Could not update roles", data.detail || data.roles || "Try again.", "error");
                          }
                        })
                        .catch(() => showAlert("Network error", "Could not reach the server.", "error"));
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setLeadershipMember(null)}
                  className="rounded-xl border border-sand-mute px-5 py-2 text-xs font-semibold text-moss hover:border-ember">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
