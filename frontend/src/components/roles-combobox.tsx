"use client";

import { useEffect, useRef, useState } from "react";

export const ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "clerk", label: "Church Clerk" },
  { value: "elder", label: "Elder / First Elder" },
  { value: "youth_leader", label: "Youth Leader" },
  { value: "choir_director", label: "Choir Director" },
  { value: "children_ministry", label: "Children Leader" },
  { value: "men_ministry", label: "AMM Leader" },
  { value: "women_ministry", label: "AWM Leader" },
  { value: "chaplaincy", label: "Chaplain" },
  { value: "finance", label: "Finance Team" },
  { value: "treasurer", label: "Treasurer" },
  { value: "leader", label: "Church Leader" },
  { value: "admin", label: "Administrator" },
];

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label])
);

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

interface RolesComboboxProps {
  selected: string[];
  onChange: (roles: string[]) => void;
  disabled?: boolean;
  align?: "left" | "right";
}

export function RolesCombobox({ selected, onChange, disabled = false, align = "left" }: RolesComboboxProps) {
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
        <span className="max-w-[10rem] truncate">{formatRoles(selected)}</span>
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
          {ROLE_OPTIONS.map((r) => {
            const checked = selected.includes(r.value);
            return (
              <button
                key={r.value}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggle(r.value)}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition ${
                  checked ? "bg-[#eef2ed] font-semibold text-[#26352f]" : "text-[#3d5148] hover:bg-[#f7f4ee]"
                }`}
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
                {r.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
