"use client";

import { useEffect, useState } from "react";

import { firstDayOfMonth, localDate } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const fundAuthHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * The treasury's views, as one line of toggles.
 *
 * The ledger, the accounts desk, the drives page and the budget all show
 * this same strip — Givings, Summary, Church Accounts, Fund Drives, Church
 * Budget, Expenses, Requests and Failed — so the treasurer meets one
 * navigation wherever in the treasury they stand. Every chip is one step to
 * the view it names: a page answers for the views it draws in place and
 * walks to the page that holds the rest, through the one address table
 * below. Each page renders it into the shell's header band
 * (`usePageHeader().setCustomToggles`), which is what keeps it a single
 * strip: the band shows either this one or the section's own pages, never
 * both.
 */
/**
 * Announced by the ledger whenever a held payment is filed or removed from
 * its row in Individual Givings — so the strip's badge answers on the spot
 * rather than counting a payment that is no longer held.
 */
export const UNASSIGNED_CHANGED_EVENT = "treasury-unassigned-changed";

export type TreasuryView =
  | "givings"
  | "summary"
  | "accounts"
  | "drives"
  | "budget"
  | "expenses"
  | "requests"
  | "failed";

/**
 * Where each view stands — the one table every treasury strip reads.
 *
 * A view is reachable from the ledger, the accounts desk, the drives page and
 * the budget: four surfaces, one navigation. Each of them answers
 * for the views it draws in place and sends the rest through this map, so no
 * strip can offer a toggle that leads somewhere the other strips disagree
 * with.
 */
export const TREASURY_VIEW_HREF: Record<TreasuryView, string> = {
  givings: "/administration/treasury?mode=all_givings",
  summary: "/administration/treasury?mode=summary",
  accounts: "/administration?tab=accounts&view=accounts",
  drives: "/administration/fund-drives",
  budget: "/administration?tab=budget",
  expenses: "/administration?tab=accounts&view=expenditure",
  requests: "/administration?tab=accounts&view=withdrawals",
  failed: "/administration/treasury?mode=failed",
};

const TREASURY_VIEWS: { key: TreasuryView; label: string; short: string }[] = [
  // Givings opens the ledger's Individual view — every gift that actually
  // arrived, one row each. A paybill payment whose reference named no
  // account stands there too, under the name the giver typed, so this is
  // also the cell that wears the count of the ones still waiting to be
  // filed: the treasurer sees the backlog on the very view whose rows carry
  // it, with Assign on the row to clear it.
  { key: "givings", label: "Givings", short: "Givings" },
  // Each purpose is a fund, so a completed gift sits in one place — the fund
  // drive that owns it, not in a shared falling-away ledger; the Summary
  // beside Givings is how those places are read together.
  { key: "summary", label: "Summary", short: "Summary" },
  { key: "accounts", label: "Church Accounts", short: "Accounts" },
  // A fund drive is born from one of those accounts, so it stands beside
  // them: the treasurer reaches the drives without leaving the treasury.
  { key: "drives", label: "Fund Drives", short: "Drives" },
  // The year's plan: what the drives and the accounts are measured against,
  // so it sits beside them rather than in the office console.
  { key: "budget", label: "Church Budget", short: "Budget" },
  { key: "expenses", label: "Expenses", short: "Expenses" },
  { key: "requests", label: "Requests", short: "Requests" },
  // M-Pesa Refunds is not a view of its own anymore: a refund is issued from
  // the ledger, on the line it returns, and asking for one will be an ask
  // through the Requests desk like every other. An old `?tab=refunds` link
  // still opens the desk, and the strip above it underlines Givings.
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
  /** Optional override for the count of payments still held for assignment. */
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
  // The strip's cells: the views themselves, one chip each — no cell opens
  // into a second row of toggles.
  const cells = TREASURY_VIEWS;
  // The strip always says where the treasurer stands: a view the cells do not
  // name — an old link's key, a view retired since it was filed — marks the
  // first toggle, Givings, rather than leaving the strip with no underscore
  // under it at all.
  const shown: TreasuryView = cells.some((cell) => cell.key === active) ? active : "givings";

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
          const withdrawalCount = Array.isArray(withdrawals?.requests) ? withdrawals.requests.filter((r: { status: string }) => ["pending", "treasurer_approved", "elder_approved", "pastor_approved"].includes(r.status)).length : 0;
          const givingCount = Array.isArray(givings?.requests) ? givings.requests.filter((r: { status: string }) => r.status === "pending").length : 0;
          setFetchedCount(withdrawalCount + givingCount);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [requestsCount]);

  // The held-payments badge: paybill payments waiting for an account, worn
  // by the Givings chip — the view whose rows carry them. The strip is drawn
  // on every treasury page, so this is what keeps the count honest wherever
  // the treasurer stands — and the ledger says when a payment has been
  // assigned or removed, because the strip would otherwise keep counting a
  // row that is no longer there.
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
  //
  // It is counted over the window the ledger opens on — the month so far — and
  // not the counter's own default of the last thirty days. That default ran
  // past the first of the month: a strip drawn beside the budget counted the
  // attempts of late last month, and the Failed tab it leads to listed this
  // month's and found none, so the badge read eight with nothing behind it. A
  // badge must never outnumber the rows its tab shows. The ledger itself
  // passes its own count whenever the treasurer has moved the window there.
  useEffect(() => {
    if (typeof failedCount === "number") return;
    let alive = true;
    fetch(
      `${API_URL}/api/members/treasury/failed/?from_date=${firstDayOfMonth()}&to_date=${localDate()}`,
      { headers: fundAuthHeaders() }
    )
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
  // rule rather than a pill button. A phone reads the views in two level rows
  // of four, so the cells are a slice of the strip's width: the padding gives
  // up most of its own and the label steps down a size, because those toggles
  // must read, not merely fit. A count holds the cell's corner without
  // touching the name, and the wider screens keep the natural line.
  const tabClass = (isActive: boolean) =>
    `relative flex h-11 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1 pt-3 text-sm font-semibold tracking-tight transition sm:px-3.5 sm:pt-0 ${
      isActive ? "border-bark text-bark" : "border-transparent text-moss hover:border-ember hover:text-bark"
    }`;

  return (
    // A phone reads the treasury in two level rows — four chips a row — the
    // grid shares the width equally, so the strip has the same shape on
    // every desk and never spends a third row of the screen's height. A
    // screen wide enough keeps the natural line, which wraps when it must.
    <div
      role="group"
      aria-label="Treasury views"
      className={`grid ${cells.length % 4 === 0 ? "grid-cols-4" : "grid-cols-5"} items-stretch gap-1 sm:flex sm:flex-wrap sm:items-center`}
    >
      {cells.map((view) => (
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
          {/* The held-payments count wears the strip's own ember, not a
              signal red: the badge says how many wait, and a colour of its
              own would shout louder than the view it sits on. */}
          {view.key === "givings" && displayUnassigned > 0 && (
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
