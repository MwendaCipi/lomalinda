"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Everything leadership owes someone an answer on, per desk:
 *
 * - Join requests awaiting review (email-verified or not yet verified).
 * - Prayer, visitation, dedication and welfare submissions (they have no
 *   review step yet, so any submission is an open request).
 * - Membership transfers still pending or under review.
 *
 * Removal requests were dropped, so they are not counted.
 *
 * Shared by the administration sidebar badge and the Requests manager itself,
 * so the two can never disagree about what the number means.
 */
export type PendingRequestCounts = {
  joins: number;
  prayer: number;
  visitation: number;
  dedication: number;
  welfare: number;
  transfers: number;
  /** The sidebar badge: everything a leader still owes an answer on. */
  total: number;
  loading: boolean;
};

type ArrayOrError = unknown;

async function fetchJsonArray(url: string, headers: Record<string, string>): Promise<ArrayOrError[]> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data: ArrayOrError = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function usePendingRequestCounts(): PendingRequestCounts {
  const [counts, setCounts] = useState<PendingRequestCounts>({
    joins: 0,
    prayer: 0,
    visitation: 0,
    dedication: 0,
    welfare: 0,
    transfers: 0,
    total: 0,
    loading: true,
  });

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    let alive = true;
    (async () => {
      const [joins, prayer, visitations, dedications, support, transfers] = await Promise.all([
        fetchJsonArray(`${API_URL}/api/members/enrollment-requests/`, headers),
        fetchJsonArray(`${API_URL}/api/members/prayer-requests/`, headers),
        fetchJsonArray(`${API_URL}/api/members/visitations/`, headers),
        fetchJsonArray(`${API_URL}/api/members/child-dedications/`, headers),
        fetchJsonArray(`${API_URL}/api/members/support-submissions/`, headers),
        fetchJsonArray(`${API_URL}/api/members/transfers/`, headers),
      ]);
      if (!alive) return;

      const joinCount = (joins as { status?: string }[]).filter(
        (j) => j.status === "pending" || j.status === "verification_pending"
      ).length;
      const transferCount = (transfers as { status?: string }[]).filter(
        (t) => t.status === "pending" || t.status === "under_review"
      ).length;

      const next = {
        joins: joinCount,
        prayer: prayer.length,
        visitation: visitations.length,
        dedication: dedications.length,
        welfare: support.length,
        transfers: transferCount,
        loading: false,
      };
      setCounts({ ...next, total: next.joins + next.prayer + next.visitation + next.dedication + next.welfare + next.transfers });
    })();

    return () => {
      alive = false;
    };
  }, []);

  return counts;
}
