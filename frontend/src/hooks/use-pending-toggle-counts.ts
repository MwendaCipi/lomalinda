"use client";

import { useEffect, useState } from "react";

import { useHeaderData } from "@/hooks/use-header-data";
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
 * and a queue nobody's pen can clear is not counted at all, so the badge
 * simply never appears for them.
 */
export type PendingToggleCounts = {
  /** The roll's asks — joins, ministry asks and membership transfers. */
  members: number;
  /** The church's asks — prayer, visitation, dedication and welfare. */
  spiritual: number;
  /** Withdrawals still holding *this reader's* signature, and givings whose
   *  change the treasury desk must answer. */
  treasury: number;
  /** Letters still missing *this reader's* pen: the pastor's, or the clerk's. */
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
/** The two letter statuses that are still waiting on a pen, first then second. */
const LETTER_WAITING = ["pending_pastor", "pastor_signed"];
/** The seats that approve a withdrawal after the pastor has blessed it. */
const ELDER_ROLES = ["elder", "first_elder", "second_elder", "third_elder"];

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
  // A letter badge is only worth drawing when the paper is waiting on *this*
  // reader's pen — the same two pens the signing buttons read, read here. The
  // pastor clears the first line, the clerk countersigns it, an administrator
  // holds both. Counting every letter the church has out told an elder, or a
  // desk that can only look at the register, that something was theirs to
  // sign; it opens on rows they cannot act on, or on none at all.
  const { me } = useHeaderData();
  const viewerRoles = (Array.isArray(me?.roles) && me.roles.length > 0 ? me.roles : [me?.role || "member"]).map(
    (role) => role.toLowerCase().trim()
  );
  const isAdminViewer = viewerRoles.includes("admin") || Boolean(me?.is_superuser);
  const canSignPastor = viewerRoles.includes("pastor") || isAdminViewer;
  const canSignClerk = viewerRoles.includes("clerk") || isAdminViewer;
  // The same question of the money: a withdrawal is cleared three times over —
  // the pastor blesses, an elder approves, the treasury releases — and each
  // desk is offered only its own stamp. Counting all three for every reader
  // put money on a pastor's badge that no button of his could move.
  const clearsPastorStage = viewerRoles.includes("pastor") || isAdminViewer;
  const clearsElderStage = isAdminViewer || viewerRoles.some((role) => ELDER_ROLES.includes(role));
  const clearsRelease = isAdminViewer || viewerRoles.includes("treasurer");
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
          withdrawals.filter((row) => {
            const state = status(row);
            return (
              (state === WITHDRAWAL_WAITING[0] && clearsPastorStage) ||
              (state === WITHDRAWAL_WAITING[1] && clearsElderStage) ||
              (state === WITHDRAWAL_WAITING[2] && clearsRelease)
            );
          }).length +
          // A giver's change of heart on a receipt is the treasury's own desk.
          (clearsRelease ? changes.filter((row) => status(row) === "pending").length : 0),
        letters: letters.filter((row) => {
          const state = status(row);
          return (
            (state === LETTER_WAITING[0] && canSignPastor) ||
            (state === LETTER_WAITING[1] && canSignClerk)
          );
        }).length,
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
  }, [enabled, canSignPastor, canSignClerk, clearsPastorStage, clearsElderStage, clearsRelease]);

  return {
    ...rest,
    members: requests.joins + requests.ministry + requests.transfers,
    spiritual: requests.prayer + requests.visitation + requests.dedication + requests.welfare,
    loading: rest.loading || requests.loading,
  };
}
