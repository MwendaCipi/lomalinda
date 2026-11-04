"use client";

import { useEffect, useState } from "react";

import { usePendingRequestCounts } from "@/hooks/use-pending-request-counts";
import { isWaiting } from "@/lib/requests";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * What is still waiting, per view a desk offers — the numbers the toggle
 * badges wear.
 *
 * A badge is only worth drawing if it means the same thing on every desk that
 * draws it, so every count here is the count of the view's own queue read the
 * way that view reads it: the treasury's approvals are the withdrawals still
 * holding one of the three signatures, the letters page counts the paper still
 * missing a pen, the school's orders count the lesson guides not yet handed
 * over, the prayer cells their unanswered asks. The church's requests come
 * from `usePendingRequestCounts`, which the console's own badges already read,
 * so a desk and the requests page cannot disagree about how many are waiting.
 *
 * A reader with no right to a queue is handed an empty list by its endpoint,
 * so the badge simply never appears for them.
 */
export type PendingToggleCounts = {
  /** The roll's asks — joins, ministry asks and membership transfers. */
  members: number;
  /** The church's asks — prayer, visitation, dedication and welfare. */
  spiritual: number;
  /** Withdrawals still holding a signature, and givings whose change waits. */
  treasury: number;
  /** Letters still missing a pen: the pastor's, or the clerk's after his. */
  letters: number;
  /** Ministry funding asks no office has answered yet. */
  funding: number;
  /** Lesson guides ordered from the school and not yet handed over. */
  lessonOrders: number;
  /** Members asking to join a prayer cell. */
  prayerCells: number;
  loading: boolean;
};

/** The statuses a withdrawal still waiting holds, as the treasury desk reads them. */
const WITHDRAWAL_WAITING = ["pending", "pastor_approved", "elder_approved"];
/** The two letter statuses that are still waiting on a pen. */
const LETTER_WAITING = ["pending_pastor", "pastor_signed"];

const EMPTY: PendingToggleCounts = {
  members: 0,
  spiritual: 0,
  treasury: 0,
  letters: 0,
  funding: 0,
  lessonOrders: 0,
  prayerCells: 0,
  loading: true,
};

async function readRows(url: string, headers: Record<string, string>): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    // Ledgers answer as a bare array or as rows under the name that fits the
    // desk — `requests`, `orders`. One reader, so a count never has to know
    // which shape it was handed.
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    for (const key of ["requests", "orders", "results"]) {
      const rows = (data as Record<string, unknown> | null)?.[key];
      if (Array.isArray(rows)) return rows as Record<string, unknown>[];
    }
    return [];
  } catch {
    return [];
  }
}

export function usePendingToggleCounts(enabled = true): PendingToggleCounts {
  // The church's asks are already counted in one place for the console's
  // badges; asking the same endpoints twice would let the two drift.
  const requests = usePendingRequestCounts(enabled);
  const [rest, setRest] = useState<PendingToggleCounts>(EMPTY);

  useEffect(() => {
    if (!enabled) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    let alive = true;

    // Every count is settled after an await, so nothing is written to state
    // during the effect's own pass.
    (async () => {
      const [withdrawals, changes, letters, funding, orders, cells] = await Promise.all([
        readRows(`${API_URL}/api/members/department-withdrawals/review/`, headers),
        readRows(`${API_URL}/api/members/treasury/giving-change-requests/`, headers),
        readRows(`${API_URL}/api/members/department-letters/`, headers),
        readRows(`${API_URL}/api/members/deaconate-requests/review/`, headers),
        readRows(`${API_URL}/api/members/lesson-orders/`, headers),
        readRows(`${API_URL}/api/members/prayer-cells/requests/`, headers),
      ]);
      if (!alive) return;

      const status = (row: Record<string, unknown>) => String(row.status ?? "");
      setRest({
        members: 0,
        spiritual: 0,
        treasury:
          withdrawals.filter((row) => WITHDRAWAL_WAITING.includes(status(row))).length +
          changes.filter((row) => status(row) === "pending").length,
        letters: letters.filter((row) => LETTER_WAITING.includes(status(row))).length,
        funding: funding.filter((row) => isWaiting({ status: status(row) })).length,
        // A guide is pending until it is handed over: the panel's own reading
        // of the queue, so the badge and the list cannot differ.
        lessonOrders: orders.filter((row) => !["delivered", "served"].includes(status(row))).length,
        prayerCells: cells.filter((row) => status(row) === "pending").length,
        loading: false,
      });
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return {
    ...rest,
    members: requests.joins + requests.ministry + requests.transfers,
    spiritual: requests.prayer + requests.visitation + requests.dedication + requests.welfare,
    loading: rest.loading || requests.loading,
  };
}
