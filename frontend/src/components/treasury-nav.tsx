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
 * The ledger, the accounts desk and the drives page all show
 * this same strip — Individual Givings, Summary Contributions, Church
 * Accounts, Fund Drives, Expenses, Requests and Failed — so the treasurer meets one
 * navigation wherever in the treasury they stand. Each page renders it into
 * the shell's header band
 * (`usePageHeader().setCustomToggles`), which is what keeps it a single line:
 * the band shows either this strip or the section's own pages, never both.
 */
/**
 * Announced by the unassigned desk whenever its queue changes — a payment
 * assigned or removed — so the strip's badge answers on the spot rather than
 * counting a row the desk has already dealt with.
 */
export const UNASSIGNED_CHANGED_EVENT = "treasury-unassigned-changed";

export type TreasuryView = "givings" | "summary" | "unassigned" | "accounts" | "drives" | "expenses" | "requests" | "failed";

const TREASURY_VIEWS: { key: TreasuryView; label: string; short: string }[] = [
  { key: "givings", label: "Givings", short: "Givings" },
  // Each purpose is a fund, so a completed gift sits in one place — the fund
  // drive that owns it, not in a shared falling-away ledger.
  { key: "summary", label: "Summary", short: "Summary" },
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
  failedCount,
}: {
  /** Which of the treasury's views the page is showing. */
  active: TreasuryView;
  onSelect: (view: TreasuryView) => void;
  /** Optional override for the badge count. */
  requestsCount?: number;
  /** Optional override for the unassigned badge count. */
  unassignedCount?: number;
  /** Optional override for the failed-givings badge count. */
  failedCount?: number;
}) {
  // Track only the counts fetched from the API; when a prop is provided the
  // parent's value wins and no fetch is needed.
  const [fetchedCount, setFetchedCount] = useState<number>(0);
  const [fetchedUnassigned, setFetchedUnassigned] = useState<number>(0);
  const [fetchedFailed, setFetchedFailed] = useState<number>(0);
  const displayCount = typeof requestsCount === "number" ? requestsCount : fetchedCount;
  const displayUnassigned = typeof unassignedCount === "number" ? unassignedCount : fetchedUnassigned;
  const displayFailed = typeof failedCount === "number" ? failedCount : fetchedFailed;
  // The strip always says where the treasurer stands: a view the list does not
  // name — an old link's key, a view retired since it was filed — marks the
  // first toggle, Individual Givings, rather than leaving the strip with no
  // underscore under it at all.
  const shown: TreasuryView = TREASURY_VIEWS.some((view) => view.key === active) ? active : "givings";

  useEffect(() => {
    // If the parent supplies a count there is nothing to fetch.
    if (typeof requestsCount === "number") return;
    let alive = true;
    Promise.all([
      fetch(`${API_URL}/api/members/department-withdrawals/review/`, { headers: fundAuthHeaders() }).then((res) => (res.ok ? res.json() : null)),
      fetch(`${API_URL}/api/members/treasury/giving-change-requests/`, { headers: fundAuthHeaders() }).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([withdrawals, givings]) => {
        if (alive) {
          const withdrawalCount = Array.isArray(withdrawals?.requests) ? withdrawals.requests.filter((r: { status: string }) => r.status === "pending" || r.status === "elder_approved").length : 0;
          const givingCount = Array.isArray(givings?.requests) ? givings.requests.filter((r: { status: string }) => r.status === "pending").length : 0;
          setFetchedCount(withdrawalCount + givingCount);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [requestsCount]);

  // The unassigned badge: paybill payments waiting for an account. The strip
  // is drawn on every treasury page, so this is what keeps the count honest
  // wherever the treasurer stands — and the desk above it says when a payment
  // has been assigned or removed, because the strip is not on the page that
  // changed and would otherwise keep counting a row that is no longer there.
  useEffect(() => {
    if (typeof unassignedCount === "number") return;
    let alive = true;
    const readCount = () =>
      fetch(`${API_URL}/api/members/treasury/unassigned/`, { headers: fundAuthHeaders() })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (alive && Array.isArray(data)) setFetchedUnassigned(data.length);
        })
        .catch(() => {});
    void readCount();
    window.addEventListener(UNASSIGNED_CHANGED_EVENT, readCount);
    return () => {
      alive = false;
      window.removeEventListener(UNASSIGNED_CHANGED_EVENT, readCount);
    };
  }, [unassignedCount]);

  // The failed badge: attempts that never arrived. The desk clears them off
  // the ledger one by one, and the count says how much noise is left.
  useEffect(() => {
    if (typeof failedCount === "number") return;
    let alive = true;
    fetch(`${API_URL}/api/members/treasury/failed/`, { headers: fundAuthHeaders() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && typeof data?.count === "number") setFetchedFailed(data.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [failedCount]);

  // The same underline tabs the rest of the app uses — a label over the band's
  // rule rather than a pill button. The phone's cells are a quarter of the
  // strip's width, so the padding gives up most of its own on that width and
  // the label sits a little lower: four toggles must read, not merely fit, and
  // a count has to hold the cell's corner without touching it.
  const tabClass = (isActive: boolean) =>
    `relative flex h-11 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1.5 pt-3 text-sm font-semibold transition sm:px-3.5 sm:pt-0 ${
      isActive ? "border-bark text-bark" : "border-transparent text-moss hover:border-ember hover:text-bark"
    }`;

  return (
    // A phone reads the treasury in two level rows of four — the grid shares
    // the width equally, so the strip has the same shape on every desk. A
    // screen wide enough keeps the natural line, which wraps when it must.
    <div
      role="group"
      aria-label="Treasury views"
      className="grid grid-cols-4 items-stretch gap-1 sm:flex sm:flex-wrap sm:items-center"
    >
      {TREASURY_VIEWS.map((view) => (
        <button
          key={view.key}
          type="button"
          onClick={() => onSelect(view.key)}
          aria-pressed={shown === view.key}
          className={tabClass(shown === view.key)}
        >
          <span className="sm:hidden">{view.short}</span>
          <span className="hidden sm:inline">{view.label}</span>
          {view.key === "requests" && displayCount > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold leading-none text-white shadow-2xs sm:static sm:h-5 sm:min-w-5 sm:px-1.5 sm:text-[10px]">
              {displayCount}
            </span>
          )}
          {view.key === "unassigned" && displayUnassigned > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold leading-none text-white shadow-2xs sm:static sm:h-5 sm:min-w-5 sm:px-1.5 sm:text-[10px]">
              {displayUnassigned}
            </span>
          )}
          {view.key === "failed" && displayFailed > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9px] font-bold leading-none text-white shadow-2xs sm:static sm:h-5 sm:min-w-5 sm:px-1.5 sm:text-[10px]">
              {displayFailed}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
