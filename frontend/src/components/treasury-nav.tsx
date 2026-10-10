"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const fundAuthHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * The treasury's views, as one line of toggles.
 *
 * The ledger (reconciliation), the accounts desk and the drives page all show
 * this same strip — Completed Givings, Summary Contributions, Church
 * Accounts, Fund Drives, Expenses, Requests and Failed — so the treasurer meets one
 * navigation wherever in the treasury they stand. Each page renders it into
 * the shell's header band
 * (`usePageHeader().setCustomToggles`), which is what keeps it a single line:
 * the band shows either this strip or the section's own pages, never both.
 */
export type TreasuryView = "givings" | "summary" | "unassigned" | "accounts" | "drives" | "expenses" | "requests" | "failed";

const TREASURY_VIEWS: { key: TreasuryView; label: string; short: string }[] = [
  { key: "givings", label: "Completed Givings", short: "Completed" },
  { key: "summary", label: "Summary Contributions", short: "Summary" },
  // Paybill payments whose reference named no account wait here: the money
  // is safely in the ledger, and this is where the treasurer names the
  // account it belongs to.
  { key: "unassigned", label: "Unassigned", short: "Unassigned" },
  { key: "accounts", label: "Church Accounts", short: "Accounts" },
  // A fund drive is born from one of those accounts, so it stands beside
  // them: the treasurer reaches the drives without leaving the treasury.
  { key: "drives", label: "Fund Drives", short: "Drives" },
  { key: "expenses", label: "Expenses", short: "Expenses" },
  { key: "requests", label: "Requests", short: "Requests" },
  // Giving attempts that never completed: recorded so the desk can see what
  // never arrived, credited to nothing, receipted never.
  { key: "failed", label: "Failed", short: "Failed" },
];

export function TreasuryNav({
  active,
  onSelect,
  requestsCount,
  unassignedCount,
}: {
  /** Which of the treasury's views the page is showing. */
  active: TreasuryView;
  onSelect: (view: TreasuryView) => void;
  /** Optional override for the badge count. */
  requestsCount?: number;
  /** Optional override for the unassigned badge count. */
  unassignedCount?: number;
}) {
  // Track only the counts fetched from the API; when a prop is provided the
  // parent's value wins and no fetch is needed.
  const [fetchedCount, setFetchedCount] = useState<number>(0);
  const [fetchedUnassigned, setFetchedUnassigned] = useState<number>(0);
  const displayCount = typeof requestsCount === "number" ? requestsCount : fetchedCount;
  const displayUnassigned = typeof unassignedCount === "number" ? unassignedCount : fetchedUnassigned;

  useEffect(() => {
    // If the parent supplies a count there is nothing to fetch.
    if (typeof requestsCount === "number") return;
    let alive = true;
    fetch(`${API_URL}/api/members/department-withdrawals/review/`, { headers: fundAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && Array.isArray(data?.requests)) {
          const waiting = data.requests.filter(
            (r: { status: string }) => r.status === "pending" || r.status === "elder_approved"
          ).length;
          setFetchedCount(waiting);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [requestsCount]);

  // The unassigned badge: paybill payments waiting for an account. The strip
  // is drawn on every treasury page, so this is what keeps the count honest
  // wherever the treasurer stands.
  useEffect(() => {
    if (typeof unassignedCount === "number") return;
    let alive = true;
    fetch(`${API_URL}/api/members/treasury/unassigned/`, { headers: fundAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && Array.isArray(data)) setFetchedUnassigned(data.length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [unassignedCount]);

  // The same underline tabs the rest of the app uses — a label over the band's
  // rule rather than a pill button.
  const tabClass = (isActive: boolean) =>
    `relative flex h-11 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 text-sm font-semibold transition ${
      isActive ? "border-bark text-bark" : "border-transparent text-moss hover:border-ember hover:text-bark"
    }`;

  return (
    <div role="group" aria-label="Treasury views" className="flex flex-wrap items-center gap-1">
      {TREASURY_VIEWS.map((view) => (
        <button
          key={view.key}
          type="button"
          onClick={() => onSelect(view.key)}
          aria-pressed={active === view.key}
          className={tabClass(active === view.key)}
        >
          <span className="sm:hidden">{view.short}</span>
          <span className="hidden sm:inline">{view.label}</span>
          {view.key === "requests" && displayCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[10px] font-bold text-white shadow-2xs">
              {displayCount}
            </span>
          )}
          {view.key === "unassigned" && displayUnassigned > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[10px] font-bold text-white shadow-2xs">
              {displayUnassigned}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
