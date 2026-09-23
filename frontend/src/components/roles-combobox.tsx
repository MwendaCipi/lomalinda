"use client";

import { useEffect, useRef, useState } from "react";

export type RoleOption = {
  value: string;
  label: string;
  /** Django group carrying this role's permissions. */
  group?: string;
  /** System roles carry every permission and cannot be removed once granted. */
  system?: boolean;
};

/**
 * The hard-coded church roles. This is the single frontend source of truth and
 * mirrors ROLE_DEFINITIONS in backend/members/roles.py.
 */
export const ROLE_OPTIONS: RoleOption[] = [
  { value: "member", label: "Member" },
  { value: "clerk", label: "Church Clerk", group: "Church Leaders" },
  { value: "elder", label: "Elder / First Elder", group: "Church Leaders" },
  { value: "youth_leader", label: "Youth Leader" },
  { value: "choir_director", label: "Choir Director", group: "Choir Director" },
  { value: "children_ministry", label: "Children Leader", group: "Children Ministry" },
  { value: "men_ministry", label: "AMM Leader", group: "Adventist Men Ministries" },
  { value: "women_ministry", label: "AWM Leader", group: "Adventist Women Ministries" },
  { value: "chaplaincy", label: "Chaplain", group: "Chaplaincy" },
  { value: "finance", label: "Finance Team", group: "Finance Team" },
  { value: "treasurer", label: "Treasurer", group: "Finance Team" },
  { value: "admin", label: "Administrator", group: "Administrators", system: true },
];

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
}

/** Single-choice twin of RolesCombobox, for the Type column. */
export function AccountTypeCombobox({ value, onChange, disabled = false }: AccountTypeComboboxProps) {
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
    <div className="relative inline-block" ref={containerRef}>
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
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#dfdbd1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#26352f] transition hover:border-[#b36b3c] focus:border-[#b36b3c] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
  onChange: (roles: string[]) => void;
  disabled?: boolean;
  align?: "left" | "right";
  /** Roles that must stay ticked (e.g. Administrator already held). */
  lockedRoles?: string[];
  /** Roles hidden from this picker when they are account types rather than permissions. */
  hiddenRoles?: string[];
}

export function RolesCombobox({ selected, onChange, disabled = false, align = "left", lockedRoles = [], hiddenRoles = [] }: RolesComboboxProps) {
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

  const toggle = (value: string) => {
    if (lockedRoles.includes(value)) return; // system role, cannot be dropped
    let next: string[];
    if (selected.includes(value)) {
      next = selected.filter((r) => r !== value);
      if (next.length === 0) next = ["member"]; // always keep at least one role
    } else if (value === "member") {
      next = ["member"]; // selecting Member clears leadership roles
    } else {
      next = [...selected.filter((r) => r !== "member"), value];
    }
    // keep canonical order
    onChange(ROLE_OPTIONS.map((r) => r.value).filter((v) => next.includes(v)));
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
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
        className="inline-flex items-center gap-1.5 rounded-xl border border-[#dfdbd1] bg-white px-2.5 py-1.5 text-xs font-medium text-[#26352f] transition hover:border-[#b36b3c] focus:border-[#b36b3c] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
          className={`absolute z-50 max-h-64 w-60 overflow-y-auto rounded-xl border border-[#dfdbd1] bg-white py-1 shadow-lg ${
            dropUp ? "bottom-full mb-1" : "mt-1"
          } ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {ROLE_OPTIONS.filter((r) => !hiddenRoles.includes(r.value)).map((r) => {
            const checked = selected.includes(r.value);
            const locked = checked && lockedRoles.includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                role="option"
                aria-selected={checked}
                aria-disabled={locked}
                disabled={locked}
                title={locked ? SYSTEM_ROLE_LOCKED_HELP : r.group ? `Group: ${r.group}` : undefined}
                onClick={() => toggle(r.value)}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition ${
                  checked ? "bg-[#eef2ed] font-semibold text-[#26352f]" : "text-[#3d5148] hover:bg-[#f7f4ee]"
                } ${locked ? "cursor-not-allowed" : ""}`}
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
                <span className="flex flex-1 items-center gap-1.5">
                  <span>{r.label}</span>
                  {r.system && (
                    <span className="rounded bg-[#f0e6dc] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#96552c]">
                      system
                    </span>
                  )}
                  {locked && <span className="text-[10px]">🔒</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
