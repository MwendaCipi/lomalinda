"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────
type LiveStat = {
  category: string;
  label: string;
  total: number;
  count: number;
  color: string;
};

type RecentEntry = {
  id: number;
  category: string;
  label: string;
  amount: number;
  donor_name: string;
  created_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const money = (n: number) =>
  `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

const FINANCIAL_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "tithe",           label: "Tithes",                 color: "#26352f" },
  { key: "local_budget",    label: "Local Church Budget",    color: "#b36b3c" },
  { key: "offering",        label: "Regular Offerings",      color: "#617068" },
  { key: "building_fund",   label: "Building Fund",          color: "#4a6f62" },
  { key: "welfare",         label: "Welfare Fund",           color: "#7a8c56" },
  { key: "mission",         label: "Mission Fund",           color: "#8f6a3a" },
];

// Pulse dot for live indicator
function LiveDot() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b36b3c] opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#b36b3c]" />
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function LiveReportsPage() {
  const [stats, setStats] = useState<LiveStat[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function loadData() {
    try {
      const [statsRes, recentRes] = await Promise.all([
        fetch(`${API_URL}/api/members/contributions/live-stats/`),
        fetch(`${API_URL}/api/members/contributions/recent/`),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (recentRes.ok) setRecent(await recentRes.json());
      setLastUpdated(new Date());
    } catch {
      // silently retry
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 30_000); // refresh every 30 s
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Totals
  const grandTotal = stats.reduce((s, c) => s + c.total, 0);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Back */}
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Stewardship &amp; Support</span>
        </Link>

        {/* Header */}
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">
              Financial Stewardship
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
              Live Reports
            </h1>
            <p className="mt-3 text-base leading-7 text-[#617068]">
              Real-time contribution tracking across all giving categories.
            </p>
          </div>

          {/* Live badge */}
          <div className="flex items-center gap-2 rounded-full border border-[#b36b3c]/30 bg-white px-4 py-2 text-sm font-semibold text-[#b36b3c] shadow-sm">
            <LiveDot />
            <span>Live</span>
            {lastUpdated && (
              <span className="ml-1 text-xs font-normal text-[#617068]">
                · updated {lastUpdated.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        {/* Grand Total Banner */}
        {!loading && (
          <div className="mt-8 rounded-3xl bg-[#26352f] px-8 py-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
              Total Contributions — All Categories
            </p>
            <p className="mt-2 text-4xl font-bold tracking-tight">{money(grandTotal)}</p>
          </div>
        )}

        {/* Per-Category Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-[#dfdbd1] bg-white p-6 h-28"
                />
              ))
            : FINANCIAL_CATEGORIES.map((cat) => {
                const stat = stats.find((s) => s.category === cat.key);
                return (
                  <div
                    key={cat.key}
                    className="rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="block h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs font-semibold text-[#617068]">
                        {stat?.count ?? 0} contributions
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#617068]">{cat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-[#26352f]">
                      {money(stat?.total ?? 0)}
                    </p>
                  </div>
                );
              })}
        </div>

        {/* Recent Activity Feed */}
        <div className="mt-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <LiveDot />
          </div>

          {loading ? (
            <p className="text-sm text-[#617068]">Loading live data...</p>
          ) : recent.length === 0 ? (
            <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
              No contribution activity yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-2xl border border-[#dfdbd1] bg-white px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#26352f]">
                      {entry.donor_name || "Anonymous"}
                    </p>
                    <p className="text-xs text-[#617068]">
                      {entry.label ?? entry.category} ·{" "}
                      {new Date(entry.created_at).toLocaleDateString("en-KE")}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-[#b36b3c]">{money(entry.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
