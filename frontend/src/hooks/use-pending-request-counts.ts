"use client";

import { useEffect, useState } from "react";

import { isWaiting } from "@/lib/requests";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Everything leadership owes someone an answer on, per desk: a join request
 * nobody has approved (email-verified or not yet verified), a prayer request
 * still saying "new", a visitation or dedication not yet dealt with, a
 * membership transfer still pending or under review, and every welfare
 * submission — that desk has no status at all, because each one is an idea,
 * a request for prayer or an offer of partnership that somebody still has to
 * pick up.
 *
 * What "waiting" means is not decided here: it comes from the shared review
 * vocabulary, the same rule the requests desk filters by and the backend
 * counts by, so the badge and the desk cannot answer it differently.
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

export function usePendingRequestCounts(enabled = true): PendingRequestCounts {
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
    // A member with no desk to answer for is not asked: the requests endpoints
    // would refuse every call, and six refused calls per dashboard visit is a
    // cost with nothing to show for it.
    if (!enabled) return;
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

      // Prayer, visitation and dedication requests carry a status too, so the
      // badge counts the ones nobody has answered rather than every one ever
      // made — a prayer already marked "prayed" is not still waiting on anybody.
      const waiting = (rows: unknown[]) => (rows as { status?: string }[]).filter(isWaiting).length;

      const next = {
        joins: waiting(joins),
        prayer: waiting(prayer),
        visitation: waiting(visitations),
        dedication: waiting(dedications),
        welfare: waiting(support),
        transfers: waiting(transfers),
        loading: false,
      };
      setCounts({ ...next, total: next.joins + next.prayer + next.visitation + next.dedication + next.welfare + next.transfers });
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return counts;
}
