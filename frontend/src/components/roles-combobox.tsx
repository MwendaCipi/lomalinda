"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Lock } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { ComboboxPopover } from "./combobox-popover";

export type RoleOption = {
  value: string;
  label: string;
  /** Django group carrying this role's permissions. */
  group?: string;
  /** System roles carry every permission and cannot be removed once granted. */
  system?: boolean;
  /** Whether a second person may share the role as the leader's assistant. */
  assistant?: boolean;
};

/**
 * The hard-coded church roles. This is the single frontend source of truth and
 * mirrors the **codes** in backend/members/roles.py. Labels may differ: the
 * backend still calls `member` "Member" for the Django admin, but here it is
 * the stored default for holding no office rather than an office of its own,
 * so the picker names it that way.
 *
 * Roles are **shared** — any number of members may hold the same office. A
 * holder may additionally be marked as an **assistant** where the role takes
 * one (the elder roles take none).
 */
export const ROLE_OPTIONS: RoleOption[] = [
  // What the picker writes back when the last office is dropped. Labelled for
  // what it means, so it never reads as a seat beside Elder and Church Clerk.
  { value: "member", label: "No office" },
  { value: "clerk", label: "Church Clerk", group: "Church Leaders", assistant: true },
  { value: "elder", label: "Elder", group: "Church Leaders" },
  { value: "first_elder", label: "First Elder", group: "Church Leaders" },
  { value: "second_elder", label: "Second Elder", group: "Church Leaders" },
  { value: "third_elder", label: "Third Elder", group: "Church Leaders" },
  // The congregation's shepherd. It was in the backend's role list all along
  // but missing here, which left the picker unable to grant it and every
  // label falling back to a lower-case "pastor".
  { value: "pastor", label: "Church Pastor", group: "Church Leaders" },
  { value: "head_deacon", label: "Head Deacon", group: "Church Leaders", assistant: true },
  { value: "head_deaconess", label: "Head Deaconess", group: "Church Leaders", assistant: true },
  { value: "treasurer", label: "Treasurer", group: "Treasury", assistant: true },
  { value: "pm_leader", label: "PM Leader", assistant: true },
  { value: "apm_leader", label: "APM Leader", group: "Adventist Possibility Ministries", assistant: true },
  { value: "men_ministry", label: "AMM Leader", group: "Adventist Men Ministries", assistant: true },
  { value: "women_ministry", label: "AWM Leader", group: "Adventist Women Ministries", assistant: true },
  { value: "youth_leader", label: "Youth Leader", assistant: true },
  { value: "chaplaincy", label: "Chaplaincy Leader", group: "Chaplaincy", assistant: true },
  { value: "children_ministry", label: "Children Leader", group: "Children Ministry", assistant: true },
  { value: "health_leader", label: "Health Leader", assistant: true },
  { value: "ambassadors_leader", label: "Ambassadors Leader", assistant: true },
  { value: "education_leader", label: "Education Leader", assistant: true },
  { value: "family_life", label: "Family Life", assistant: true },
  { value: "pathfinders_leader", label: "Pathfinders Leader", assistant: true },
  { value: "adventurers_leader", label: "Adventurers Leader", assistant: true },
  { value: "publishing_head", label: "Publishing Head", assistant: true },
  { value: "welfare_leader", label: "Welfare Leader", assistant: true },
  { value: "interest_coordinator", label: "Interest Coordinator", assistant: true },
  { value: "development", label: "Development Leader", assistant: true },
  { value: "dorcas_leader", label: "Dorcas Leader", assistant: true },
  { value: "choir_director", label: "Choir Director", group: "Choir Director", assistant: true },
  { value: "admin", label: "Administrator", group: "Administrators", system: true },
];

/** One role as the church currently holds it. */
export type RoleRegisterRow = {
  code: string;
  label: string;
  system: boolean;
  /** Whether this role may be shared with an assistant at all. */
  assistant: boolean;
  /** The member leading the role, if anyone does. */
  leader: { id: number; name: string } | null;
  assistants: { id: number; name: string }[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// The register is the same for every picker on a page (the users table draws
// one per row), so it is fetched once and shared.
let registerCache: Record<string, RoleRegisterRow> | null = null;
let registerRequest: Promise<Record<string, RoleRegisterRow>> | null = null;

export function loadRoleRegister(): Promise<Record<string, RoleRegisterRow>> {
  if (registerCache) return Promise.resolve(registerCache);
  if (!registerRequest) {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    registerRequest = fetch(`${API_URL}/api/members/roles/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const rows: RoleRegisterRow[] = Array.isArray(data?.roles) ? data.roles : [];
        registerCache = Object.fromEntries(rows.map((row) => [row.code, row]));
        return registerCache;
      })
      .catch(() => {
        registerRequest = null;
        return {} as Record<string, RoleRegisterRow>;
      });
  }
  return registerRequest;
}

/**
 * Drop the cached register and fetch it again. Any screen that changes who
 * holds a role calls this, so the next picker open sees the new holder rather
 * than the leader it replaced — a freed role has to look free.
 */
export function refreshRoleRegister(): Promise<Record<string, RoleRegisterRow>> {
  registerCache = null;
  registerRequest = null;
  return loadRoleRegister();
}

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label])
);

export const SYSTEM_ROLE_CODES = ROLE_OPTIONS.filter((r) => r.system).map((r) => r.value);

export function isSystemRole(code: string): boolean {
  return SYSTEM_ROLE_CODES.includes(code);
}

/** System roles already held by an account — those cannot be dropped here. */
export function heldSystemRoles(...roleSets: (string[] | string | undefined)[]): string[] {
  const held = roleSets.flatMap((set) => (Array.isArray(set) ? set : set ? [set] : []));
  return SYSTEM_ROLE_CODES.filter((code) => held.includes(code));
}

export const SYSTEM_ROLE_HELP =
  "Administrator is a system role with every permission.";
export const SYSTEM_ROLE_LOCKED_HELP =
  "Administrator is a system role: it cannot be removed from this account.";

export type AccountTypeOption = {
  value: "member" | "friend" | "sabbath_school" | "ex_member";
  label: string;
  help: string;
};

/**
 * How the church records a person: a member, a friend of the church, a Sabbath
 * School attendee, or an ex-member. Two stored fields (account_type and
 * is_disfellowshipped) express the four states; this is the one place that
 * reads them back as one answer.
 */
export const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  { value: "member", label: "Member", help: "A member of this church, on the church roll." },
  { value: "friend", label: "Friend", help: "A friend of the church who is not a member." },
  { value: "sabbath_school", label: "Sabbath School", help: "Attends Sabbath School; not yet a baptised member." },
  { value: "ex_member", label: "Ex-member", help: "Has left or been removed; kept on record." },
];

export function accountTypeOf(
  accountType?: string | null,
  isDisfellowshipped?: boolean | null
): AccountTypeOption["value"] {
  if (isDisfellowshipped) return "ex_member";
  if (accountType === "sabbath_school") return "sabbath_school";
  return accountType === "friend" ? "friend" : "member";
}

/** "Ex-member" — the stored state said out loud. */
export function accountTypeLabel(value: string): string {
  return ACCOUNT_TYPE_OPTIONS.find((option) => option.value === value)?.label || "Member";
}

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] || code.replaceAll("_", " ");
}

/** How one role reads out loud: "Choir Director", or "Assistant Choir
    Director" when the holder shares it as the leader's assistant. */
export function roleDisplayLabel(code: string, assistantRoles: string[] = []): string {
  return assistantRoles.includes(code) ? `Assistant ${roleLabel(code)}` : roleLabel(code);
}

/**
 * How someone who holds no office reads.
 *
 * `member` is the stored default for "holds no leadership role" — the picker
 * writes it back when the last office is dropped — not an office in its own
 * right. Calling that state "Member" put it beside Elder and Church Clerk as
 * though it were another seat, so summaries and pickers say "None" instead.
 */
export const NO_ROLE_LABEL = "None";

/** The offices someone holds: their roles with the stored `member` default removed. */
export function leadershipRoles(roles: string[] = []): string[] {
  return (roles || []).filter((code) => code !== "member");
}

/**
 * Church seniority, most senior office first.
 *
 * The register's order is a picker order: it reads well as a list of choices
 * and badly as a hierarchy, so it ends with Administrator and starts with
 * Member — the two worst possible leads. A summary that names one role needs
 * the hierarchy instead, which is this list.
 *
 * The reasoning: the church-wide offices first (the shepherd, then the elders,
 * then the clerk and treasurer, whose briefs cover the whole church), then the
 * department and ministry leads, and `member` last — that is the everyone
 * state, not an office, so it can never be what someone is introduced as.
 */
const ROLE_SENIORITY: string[] = [
  "admin",
  "pastor",
  "first_elder",
  "second_elder",
  "third_elder",
  "elder",
  "clerk",
  "treasurer",
  "head_deacon",
  "head_deaconess",
  "pm_leader",
  "apm_leader",
  "men_ministry",
  "women_ministry",
  "youth_leader",
  "chaplaincy",
  "children_ministry",
  "health_leader",
  "ambassadors_leader",
  "education_leader",
  "family_life",
  "pathfinders_leader",
  "adventurers_leader",
  "publishing_head",
  "welfare_leader",
  "interest_coordinator",
  "development",
  "choir_director",
  "member",
];

/** How senior a role is; anything unrecognised sinks below every known office. */
export function roleSeniorityRank(code: string): number {
  const index = ROLE_SENIORITY.indexOf(code);
  return index === -1 ? ROLE_SENIORITY.length : index;
}

/**
 * The same roles, most senior first.
 *
 * Ties — including unknown codes, which share the lowest standing — keep the
 * order they arrived in, so this never reshuffles what it cannot rank.
 */
export function orderRolesBySeniority(codes: string[]): string[] {
  return (codes || [])
    .map((code, index) => ({ code, index }))
    .sort(
      (a, b) => roleSeniorityRank(a.code) - roleSeniorityRank(b.code) || a.index - b.index
    )
    .map((entry) => entry.code);
}

/** Human summary of the offices someone holds: "Clerk, Treasurer", "Clerk +2"
    or "Assistant Choir Director +1" when assistants are given. The senior
    office leads, so the summary never introduces a first elder as a member,
    and someone holding no office at all reads "None". */
export function formatRoles(roles: string[], assistantRoles: string[] = []): string {
  const offices = leadershipRoles(roles);
  if (offices.length === 0) return NO_ROLE_LABEL;
  const labels = orderRolesBySeniority(offices).map((code) => roleDisplayLabel(code, assistantRoles));
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]} +${labels.length - 1}`;
}

interface AccountTypeComboboxProps {
  value: AccountTypeOption["value"];
  onChange: (value: AccountTypeOption["value"]) => void;
  disabled?: boolean;
  /** Stretch to the width of the cell — see RolesCombobox. */
  fill?: boolean;
}

/** Single-choice twin of RolesCombobox, for the Type column. */
export function AccountTypeCombobox({ value, onChange, disabled = false, fill = false }: AccountTypeComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body (see ComboboxPopover), so outside-click
  // must count it as inside or the first click on it would close the picker.
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const current = ACCOUNT_TYPE_OPTIONS.find((option) => option.value === value) || ACCOUNT_TYPE_OPTIONS[0];

  return (
    <div className={`relative ${fill ? "block w-full" : "inline-block"}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        title={current.help}
        className={`${fill ? "flex w-full justify-between" : "inline-flex"} items-center gap-1.5 rounded-xl border border-sand-line bg-white px-2.5 py-1.5 text-xs font-medium text-bark transition hover:border-ember focus:border-ember focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span>{current.label}</span>
        <svg className={`h-3 w-3 shrink-0 text-moss transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <ComboboxPopover
        anchorRef={containerRef}
        panelRef={panelRef}
        open={isOpen}
        minW={208}
        panelClassName="rounded-xl border border-sand-line bg-white py-1 shadow-lg"
      >
        <div role="listbox">
          {ACCOUNT_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              title={option.help}
              onClick={() => {
                setIsOpen(false);
                if (option.value !== value) onChange(option.value);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
                option.value === value ? "bg-mist-select font-semibold text-bark" : "text-moss-dark hover:bg-sand"
              }`}
            >
              <span className="flex-1">{option.label}</span>
              {option.value === value && <Check size={14} className="text-ember" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </ComboboxPopover>
    </div>
  );
}

interface RolesComboboxProps {
  selected: string[];
  /** The full role set, plus the subset of it held as an assistant. */
  onChange: (roles: string[], assistants: string[]) => void;
  disabled?: boolean;
  align?: "left" | "right";
  /** Roles that must stay ticked (e.g. Administrator already held). */
  lockedRoles?: string[];
  /** Roles hidden from this picker when they are account types rather than permissions. */
  hiddenRoles?: string[];
  /**
   * Stretch to the width of the cell instead of hugging its label. The users
   * table pairs this picker with the account-type one in adjacent columns, and
   * a trigger that hugged short labels left a void between the two.
   */
  fill?: boolean;
  /** Whose roles these are, so a role they already lead never blocks them. */
  memberId?: number;
  /** The roles this member shares as an assistant (a subset of `selected`). */
  assistants?: string[];
  /** Show the Assistant column — only where the caller can record one. */
  showAssistants?: boolean;
}

export function RolesCombobox({
  selected,
  onChange,
  disabled = false,
  align = "left",
  lockedRoles = [],
  hiddenRoles = [],
  fill = false,
  memberId,
  assistants = [],
  showAssistants = false,
}: RolesComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [register, setRegister] = useState<Record<string, RoleRegisterRow>>({});
  // Drafts: ticks and assistant flags made inside the open picker stay local
  // until Done confirms them, so a stray click outside reads as a cancel
  // rather than a surprise change of the member's roles.
  const [draftRoles, setDraftRoles] = useState<string[]>(selected);
  const [draftAssistants, setDraftAssistants] = useState<string[]>(assistants);
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body (see ComboboxPopover), so outside-click
  // must count it as inside or the first click on it would close the picker.
  const panelRef = useRef<HTMLDivElement>(null);

  // Roles read alphabetically in the picker — the definition order is the
  // org chart's, which is nobody's guess when looking for a role.
  const sortedOptions = useMemo(
    () => [...ROLE_OPTIONS].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  useEffect(() => {
    if (isOpen) {
      // Every open starts from the member's actual roles, never a stale draft.
      setDraftRoles(selected);
      setDraftAssistants(assistants);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Who leads each role: a role someone else holds cannot be handed out again,
  // and an assistant can only be named under an existing leader.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    loadRoleRegister().then((rows) => {
      if (alive) setRegister(rows);
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const toggle = (value: string) => {
    if (lockedRoles.includes(value)) return; // system role, cannot be dropped
    let next: string[];
    let nextAssistants = [...draftAssistants];
    if (draftRoles.includes(value)) {
      next = draftRoles.filter((r) => r !== value);
      if (next.length === 0) next = ["member"]; // stored default: no leadership role
      nextAssistants = nextAssistants.filter((code) => code !== value);
    } else if (value === "member") {
      next = ["member"]; // stored default: the plain Member role
      nextAssistants = [];
    } else {
      next = [...draftRoles.filter((r) => r !== "member"), value];
    }
    // keep canonical order
    const ordered = ROLE_OPTIONS.map((r) => r.value).filter((v) => next.includes(v));
    // An assistant assists a role they hold; dropping the role drops the flag.
    setDraftRoles(ordered);
    setDraftAssistants(nextAssistants.filter((code) => ordered.includes(code)));
  };

  const toggleAssistant = (value: string) => {
    if (!draftRoles.includes(value)) return;
    setDraftAssistants(
      draftAssistants.includes(value)
        ? draftAssistants.filter((code) => code !== value)
        : [...draftAssistants, value]
    );
  };

  /** Diff the draft against the member's real roles for the confirm dialog. */
  const applyDraft = async () => {
    const added = draftRoles.filter((code) => !selected.includes(code));
    const removed = selected.filter((code) => !draftRoles.includes(code));
    const assistantsAdded = draftAssistants.filter((code) => !assistants.includes(code));
    const assistantsRemoved = assistants.filter((code) => !draftAssistants.includes(code));
    if (
      added.length === 0 &&
      removed.length === 0 &&
      assistantsAdded.length === 0 &&
      assistantsRemoved.length === 0
    ) {
      setIsOpen(false);
      return;
    }
    const lines: string[] = [];
    if (added.length) lines.push(`Add: ${added.map(roleLabel).join(", ")}`);
    if (removed.length) lines.push(`Remove: ${removed.map(roleLabel).join(", ")}`);
    if (assistantsAdded.length) lines.push(`Mark assistant on: ${assistantsAdded.map(roleLabel).join(", ")}`);
    if (assistantsRemoved.length) lines.push(`Stop assisting: ${assistantsRemoved.map(roleLabel).join(", ")}`);
    const result = await showAlert(
      "Confirm role changes",
      lines.join("\n"),
      "question",
      {
        showCancelButton: true,
        confirmButtonText: "Save changes",
        cancelButtonText: "Keep editing",
        confirmButtonColor: brand.ember,
      }
    );
    if (!result.isConfirmed) return;
    onChange(draftRoles, draftAssistants);
    setIsOpen(false);
  };

  // The offices this account holds, senior first. The stored `member` default
  // means "no office", so it never names the selection — see NO_ROLE_LABEL.
  const offices = orderRolesBySeniority(leadershipRoles(selected));

  return (
    <div className={`relative ${fill ? "block w-full" : "inline-block"}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((o) => !o)}
        className={`${fill ? "flex w-full justify-between" : "inline-flex"} items-center gap-1.5 rounded-xl border border-sand-line bg-white px-2.5 py-1.5 text-xs font-medium text-bark transition hover:border-ember focus:border-ember focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
        title={offices.map((code) => roleDisplayLabel(code, assistants)).join(", ") || NO_ROLE_LABEL}
      >
        {/* Compact on purpose: the senior office plus a count — "Elder +2
            others", "Assistant Choir Director" — keeps the column narrow;
            the full list lives in the tooltip. Display only: what the picker
            hands back is the list as chosen, which the API orders itself. */}
        <span className="min-w-0 truncate">
          {selected.length === 0
            ? "Select access"
            : offices.length === 0
              ? NO_ROLE_LABEL
              : offices.length > 1
                ? `${roleDisplayLabel(offices[0], assistants)} +${offices.length - 1} other${offices.length - 1 === 1 ? "" : "s"}`
                : roleDisplayLabel(offices[0], assistants)}
        </span>
        <svg className={`h-3 w-3 shrink-0 text-moss transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <ComboboxPopover
        anchorRef={containerRef}
        panelRef={panelRef}
        open={isOpen}
        minW={288}
        panelClassName="rounded-xl border border-sand-line bg-white shadow-lg overflow-hidden"
      >
        <div
          role="listbox"
          aria-multiselectable="true"
          className="max-h-72 w-72 overflow-y-auto"
        >
          {/* Roles are shared; the second column marks assistants where the
              role takes one. */}
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-sand-paper bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-moss">
            <span className="flex-1">Role</span>
            {showAssistants && <span className="w-16 shrink-0 text-center">Assistant</span>}
          </div>
          {sortedOptions.filter((r) => !hiddenRoles.includes(r.value)).map((r) => {
            const checked = draftRoles.includes(r.value);
            const locked = checked && lockedRoles.includes(r.value);
            const row = register[r.value];
            const holderCount = row ? (row.leader ? 1 : 0) + (row.assistants?.length || 0) : 0;
            // Shared roles: other holders are context, never a block.
            const heldElsewhere = holderCount > 0 && !(holderCount === 1 && row.leader?.id === memberId);
            // The assistant box is available wherever the role takes one,
            // whether or not the role has its leader yet.
            const canAssist = Boolean(r.assistant) && checked && !locked;
            const roleTitle = locked
              ? SYSTEM_ROLE_LOCKED_HELP
              : r.group
                ? `Group: ${r.group}`
                : undefined;
            const assistantTitle = !r.assistant
              ? `${r.label} does not take an assistant.`
              : !checked
                ? `Tick ${r.label} first — an assistant holds the role too.`
                : undefined;

            return (
              <div
                key={r.value}
                className={`flex items-center gap-2 pr-2 ${checked ? "bg-mist-select" : "hover:bg-sand"}`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  aria-disabled={locked}
                  disabled={locked}
                  title={roleTitle}
                  onClick={() => toggle(r.value)}
                  className={`flex flex-1 items-center gap-2.5 px-3 py-1.5 text-left text-xs transition ${
                    checked ? "font-semibold text-bark" : "text-moss-dark"
                  } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
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
                  <span className="flex flex-1 flex-wrap items-center gap-1.5">
                    <span>{r.label}</span>
                    {r.system && (
                      <span className="rounded bg-gold-blush px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ember-deep">
                        system
                      </span>
                    )}
                    {locked && <Lock size={11} className="text-moss-faint" aria-hidden="true" />}
                    {heldElsewhere && (
                      <span className="text-[10px] font-normal text-moss">
                        · {holderCount} holder{holderCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </button>
                <span className={`w-16 shrink-0 items-center justify-center ${showAssistants ? "flex" : "hidden"}`}>
                  {r.assistant && (
                    <input
                      type="checkbox"
                      aria-label={`${r.label} assistant`}
                      checked={draftAssistants.includes(r.value)}
                      disabled={!canAssist}
                      title={assistantTitle}
                      onChange={() => toggleAssistant(r.value)}
                      className="h-3.5 w-3.5 accent-ember disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  )}
                </span>
              </div>
            );
          })}
          {/* Done confirms the draft — through the confirmation dialog when
              anything actually changed. */}
          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-sand-paper bg-white px-3 py-2">
            <span className="text-[10px] text-moss">
              {draftRoles.length} role{draftRoles.length === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              onClick={applyDraft}
              className="rounded-xl bg-bark px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-ember"
            >
              Done
            </button>
          </div>
        </div>
      </ComboboxPopover>
    </div>
  );
}
