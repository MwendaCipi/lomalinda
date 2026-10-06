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
 * this same strip — Individual Givings, Summary Contributions, Church
 * Accounts, Fund Drives, Expenses and Requests — so the treasurer meets one
 * navigation wherever in the treasury they stand. Each page renders it into
 * the shell's header band
 * (`usePageHeader().setCustomToggles`), which is what keeps it a single line:
 * the band shows either this strip or the section's own pages, never both.
 */
export type TreasuryView = "givings" | "summary" | "accounts" | "drives" | "expenses" | "requests";

const TREASURY_VIEWS: { key: TreasuryView; label: string }[] = [
  { key: "givings", label: "Individual Givings" },
  { key: "summary", label: "Summary Contributions" },
  { key: "accounts", label: "Church Accounts" },
  // A fund drive is born from one of those accounts, so it stands beside
  // them: the treasurer reaches the drives without leaving the treasury.
  { key: "drives", label: "Fund Drives" },
  { key: "expenses", label: "Expenses" },
  { key: "requests", label: "Requests" },
];

export function TreasuryNav({
  active,
  onSelect,
  requestsCount,
}: {
  /** Which of the treasury's views the page is showing. */
  active: TreasuryView;
  onSelect: (view: TreasuryView) => void;
  /** Optional override for the badge count. */
  requestsCount?: number;
}) {
  // Track only the count fetched from the API; when the prop is provided the
  // parent's value wins and no fetch is needed.
  const [fetchedCount, setFetchedCount] = useState<number>(0);
  const displayCount = typeof requestsCount === "number" ? requestsCount : fetchedCount;

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
          <span>{view.label}</span>
          {view.key === "requests" && displayCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ember px-1.5 text-[10px] font-bold text-white shadow-2xs">
              {displayCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
