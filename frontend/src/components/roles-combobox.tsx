"use client";

import { useEffect, useRef, useState } from "react";

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
 * mirrors ROLE_DEFINITIONS in backend/members/roles.py.
 *
 * Roles are **shared** — any number of members may hold the same role, Member
 * included. A holder may additionally be marked as an **assistant** where the
 * role takes one (the elder roles take none).
 */
export const ROLE_OPTIONS: RoleOption[] = [
  { value: "member", label: "Member" },
  { value: "clerk", label: "Church Clerk", group: "Church Leaders", assistant: true },
  { value: "elder", label: "Elder", group: "Church Leaders" },
  { value: "first_elder", label: "First Elder", group: "Church Leaders" },
  { value: "second_elder", label: "Second Elder", group: "Church Leaders" },
  { value: "third_elder", label: "Third Elder", group: "Church Leaders" },
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
  { value: "development", label: "Development", assistant: true },
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
  value: "member" | "friend" | "ex_member";
  label: string;
  help: string;
};

/**
 * How the church records a person: a member, a friend of the church, or an
 * ex-member. Two stored fields (account_type and is_disfellowshipped) express
 * the three states; this is the one place that reads them back as one answer.
 */
export const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  { value: "member", label: "Member", help: "A member of this church, on the church roll." },
  { value: "friend", label: "Friend", help: "A friend of the church who is not a member." },
  { value: "ex_member", label: "Ex-member", help: "Has left or been removed; kept on record." },
];

export function accountTypeOf(
  accountType?: string | null,
  isDisfellowshipped?: boolean | null
): AccountTypeOption["value"] {
  if (isDisfellowshipped) return "ex_member";
  return accountType === "friend" ? "friend" : "member";
}

/** "Ex-member" — the stored state said out loud. */
export function accountTypeLabel(value: string): string {
  return ACCOUNT_TYPE_OPTIONS.find((option) => option.value === value)?.label || "Member";
}

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] || code.replaceAll("_", " ");
}

/** Human summary of a role list: "Clerk, Treasurer" or "Clerk +2" */
export function formatRoles(roles: string[]): string {
  if (!roles || roles.length === 0) return "Member";
  const labels = roles.map(roleLabel);
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
  const [dropUp, setDropUp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
        onClick={() =>
          setIsOpen((open) => {
            // Open upward near the bottom of the viewport, like the role picker.
            if (!open && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              setDropUp(window.innerHeight - rect.bottom < 220);
            }
            return !open;
          })
        }
        title={current.help}
        className={`${fill ? "flex w-full justify-between" : "inline-flex"} items-center gap-1.5 rounded-xl border border-[#dfdbd1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#26352f] transition hover:border-[#b36b3c] focus:border-[#b36b3c] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span>{current.label}</span>
        <svg className={`h-3 w-3 shrink-0 text-[#617068] transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={`absolute z-50 w-52 rounded-xl border border-[#dfdbd1] bg-white py-1 shadow-lg ${dropUp ? "bottom-full mb-1" : "mt-1"} left-0`}
        >
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
                option.value === value ? "bg-[#eef2ed] font-semibold text-[#26352f]" : "text-[#3d5148] hover:bg-[#f7f4ee]"
              }`}
            >
              <span className="flex-1">{option.label}</span>
              {option.value === value && <span className="text-[#b36b3c]">✓</span>}
            </button>
          ))}
        </div>
      )}
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
  const [dropUp, setDropUp] = useState(false);
  const [register, setRegister] = useState<Record<string, RoleRegisterRow>>({});
  const containerRef = useRef<HTMLDivElement>(null);

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
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
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
    let nextAssistants = [...assistants];
    if (selected.includes(value)) {
      next = selected.filter((r) => r !== value);
      if (next.length === 0) next = ["member"]; // stored default: no leadership role
      nextAssistants = nextAssistants.filter((code) => code !== value);
    } else if (value === "member") {
      next = ["member"]; // stored default: the plain Member role
      nextAssistants = [];
    } else {
      next = [...selected.filter((r) => r !== "member"), value];
    }
    // keep canonical order
    const ordered = ROLE_OPTIONS.map((r) => r.value).filter((v) => next.includes(v));
    // An assistant assists a role they hold; dropping the role drops the flag.
    onChange(ordered, nextAssistants.filter((code) => ordered.includes(code)));
  };

  const toggleAssistant = (value: string) => {
    if (!selected.includes(value)) return;
    const next = assistants.includes(value)
      ? assistants.filter((code) => code !== value)
      : [...assistants, value];
    onChange(selected, next);
  };

  return (
    <div className={`relative ${fill ? "block w-full" : "inline-block"}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          setIsOpen((o) => {
            // Open upward when near the bottom of the viewport so the list
            // is not clipped by the table's scroll area or the bottom bar.
            if (!o && containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              setDropUp(window.innerHeight - rect.bottom < 280);
            }
            return !o;
          })
        }
        className={`${fill ? "flex w-full justify-between" : "inline-flex"} items-center gap-1.5 rounded-xl border border-[#dfdbd1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#26352f] transition hover:border-[#b36b3c] focus:border-[#b36b3c] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
        title={selected.map(roleLabel).join(", ")}
      >
        <span className="max-w-[10rem] truncate">{selected.length ? formatRoles(selected) : "Select access"}</span>
        <svg className={`h-3 w-3 shrink-0 text-[#617068] transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className={`absolute z-50 max-h-72 w-72 overflow-y-auto rounded-xl border border-[#dfdbd1] bg-white shadow-lg ${
            dropUp ? "bottom-full mb-1" : "mt-1"
          } ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {/* Roles are shared; the second column marks assistants where the
              role takes one. */}
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[#f0ece3] bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#617068]">
            <span className="flex-1">Role</span>
            {showAssistants && <span className="w-16 shrink-0 text-center">Assistant</span>}
          </div>
          {ROLE_OPTIONS.filter((r) => !hiddenRoles.includes(r.value)).map((r) => {
            const checked = selected.includes(r.value);
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
                className={`flex items-center gap-2 pr-2 ${checked ? "bg-[#eef2ed]" : "hover:bg-[#f7f4ee]"}`}
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
                    checked ? "font-semibold text-[#26352f]" : "text-[#3d5148]"
                  } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      checked ? "border-[#b36b3c] bg-[#b36b3c] text-white" : "border-[#c9c5bb] bg-white"
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
                      <span className="rounded bg-[#f0e6dc] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#96552c]">
                        system
                      </span>
                    )}
                    {locked && <span className="text-[10px]">🔒</span>}
                    {heldElsewhere && (
                      <span className="text-[10px] font-normal text-[#617068]">
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
                      checked={assistants.includes(r.value)}
                      disabled={!canAssist}
                      title={assistantTitle}
                      onChange={() => toggleAssistant(r.value)}
                      className="h-3.5 w-3.5 accent-[#b36b3c] disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
