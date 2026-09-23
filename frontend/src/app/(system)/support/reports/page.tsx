"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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

type TreasuryAccount = {
  id: number;
  name: string;
  account_number: string;
  account_type: string;
  account_type_display: string;
  balance: number | string;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const money = (n: number) =>
  `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

// Card accent per treasury account type — the accounts themselves come live
// from admin › Treasury Accounts, nothing about them is hardcoded here.
const ACCOUNT_COLORS: Record<string, string> = {
  bank: "#26352f",
  mobile_money: "#b36b3c",
  cash: "#617068",
  other: "#7a8c56",
};

// Pulse dot for live indicator
function LiveDot({ active = false }: { active?: boolean }) {
  return (
    <span className="relative flex h-3 w-3">
      {active && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b36b3c] opacity-75" />}
      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#b36b3c]" />
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function LiveReportsPage() {
  const [stats, setStats] = useState<LiveStat[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function loadData() {
    try {
      const token = localStorage.getItem("access_token");
      const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [statsRes, recentRes, accountsRes] = await Promise.all([
        fetch(`${API_URL}/api/members/contributions/live-stats/`, { headers: auth }),
        fetch(`${API_URL}/api/members/contributions/recent/`, { headers: auth }),
        fetch(`${API_URL}/api/members/treasury/accounts/`, { headers: auth }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (recentRes.ok) setRecent(await recentRes.json());
      if (accountsRes.ok) setAccounts(await accountsRes.json());
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
  const liquidityTotal = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);

  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Live Reports
            </h1>
            <p className="mt-3 text-base leading-7 text-[#617068]">
              Real-time giving and treasury account liquidity.
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

        {/* Account Liquidity — live balances from admin › Treasury Accounts */}
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Account Liquidity</h2>
              <p className="text-sm text-[#617068]">Live balances of the church&apos;s treasury accounts.</p>
            </div>
            {!loading && accounts.length > 0 && (
              <p className="text-2xl font-bold text-[#26352f]">{money(liquidityTotal)}</p>
            )}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse rounded-2xl border border-[#dfdbd1] bg-white p-6 h-28"
                  />
                ))
              : accounts.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-8 text-center text-sm text-[#617068]">
                    No treasury accounts have been configured yet.
                  </div>
                )
              : accounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="block h-2 w-2 rounded-full"
                        style={{ backgroundColor: ACCOUNT_COLORS[account.account_type] ?? ACCOUNT_COLORS.other }}
                      />
                      <span className="text-xs font-semibold text-[#617068]">
                        {account.account_type_display}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#617068]">{account.name}</p>
                    <p className="mt-1 text-2xl font-bold text-[#26352f]">
                      {money(Number(account.balance || 0))}
                    </p>
                  </div>
                ))}
          </div>
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
      </div>
      </div>
    </main>
  );
}
