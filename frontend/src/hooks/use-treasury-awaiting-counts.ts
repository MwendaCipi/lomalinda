"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type TreasuryAwaitingCounts = {
  withdrawal_requests: number;
  fund_drives: number;
  total: number;
  loading: boolean;
};

type AwaitResponse = {
  withdrawal_requests?: unknown;
  fund_drives?: unknown;
};

async function fetchJson(url: string, headers: Record<string, string>): Promise<AwaitResponse | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as AwaitResponse) : null;
  } catch {
    return null;
  }
}

export function useTreasuryAwaitingCounts(enabled = true): TreasuryAwaitingCounts {
  const [counts, setCounts] = useState<TreasuryAwaitingCounts>({
    withdrawal_requests: 0,
    fund_drives: 0,
    total: 0,
    loading: true,
  });

  useEffect(() => {
    // Only the treasurer and administrators reach this endpoint; everyone else
    // gets 403, so there is no point firing for other roles.
    if (!enabled) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    let alive = true;
    (async () => {
      const data = await fetchJson(`${API_URL}/api/members/treasury/awaiting/`, headers);
      if (!alive) return;
      if (!data) {
        setCounts((prev) => ({ ...prev, loading: false }));
        return;
      }
      const wr = typeof data.withdrawal_requests === "number" ? data.withdrawal_requests : 0;
      const fd = typeof data.fund_drives === "number" ? data.fund_drives : 0;
      setCounts({
        withdrawal_requests: wr,
        fund_drives: fd,
        total: wr + fd,
        loading: false,
      });
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return counts;
}
