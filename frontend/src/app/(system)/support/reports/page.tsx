"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HandHeart } from "lucide-react";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// ── Types ──────────────────────────────────────────────────────────────────
type TreasuryAccount = {
  id: number;
  name: string;
  description?: string;
  account_number: string;
  account_type: string;
  account_type_display: string;
  balance: number | string;
};

type FundDrive = {
  id: number;
  name: string;
  title?: string;
  account_name?: string;
  target_amount: number | string;
  total_raised: number | string;
  percentage_raised: number | string;
  donor_count: number;
  is_active: boolean;
  start_date: string;
  end_date?: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const money = (n: number) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

/** The giving form a member reaches to support one account directly. */
const supportHref = (accountName: string) => `/give?purpose=${encodeURIComponent(accountName)}`;

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

const VIEWS = [
  { key: "liquidity" as const, label: "Account Liquidity" },
  { key: "drives" as const, label: "Fund Drives" },
];

// ── Main Component ────────────────────────────────────────────────────────
export default function LiveReportsPage() {
  const [view, setView] = useState<"liquidity" | "drives">("liquidity");
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [drives, setDrives] = useState<FundDrive[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function loadData() {
    try {
      const token = localStorage.getItem("access_token");
      const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [accountsRes, drivesRes] = await Promise.all([
        fetch(`${API_URL}/api/members/treasury/accounts/`, { headers: auth }),
        fetch(`${API_URL}/api/members/campaigns/`, { headers: auth }),
      ]);

      if (accountsRes.ok) setAccounts(await accountsRes.json());
      if (drivesRes.ok) {
        const payload = await drivesRes.json();
        setDrives(Array.isArray(payload) ? payload : []);
      }
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

  const liquidityTotal = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  // Only drives still collecting: a finished drive is history, not a live report.
  const activeDrives = drives.filter((drive) => drive.is_active);
  const drivesRaised = activeDrives.reduce((s, d) => s + Number(d.total_raised || 0), 0);

  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Live Reports</h1>
                <p className="mt-3 text-base leading-7 text-[#617068]">
                  Where the church&apos;s money sits, and how the fund drives are going.
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

            {/* The two live reports */}
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex h-[38px] shrink-0 items-center rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-0.5"
                role="group"
                aria-label="Live report"
              >
                {VIEWS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setView(option.key)}
                    aria-pressed={view === option.key}
                    className={`h-8 whitespace-nowrap rounded-lg px-3.5 text-xs font-semibold transition ${
                      view === option.key ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
                    }`}
                  >
                    {option.label}
                    {option.key === "drives" && activeDrives.length > 0 ? ` (${activeDrives.length})` : ""}
                  </button>
                ))}
              </div>
              {!loading && view === "liquidity" && accounts.length > 0 && (
                <p className="text-sm font-bold text-[#26352f]">
                  Total across accounts: <span className="text-[#b36b3c]">{money(liquidityTotal)}</span>
                </p>
              )}
              {!loading && view === "drives" && activeDrives.length > 0 && (
                <p className="text-sm font-bold text-[#26352f]">
                  Raised towards {money(activeDrives.reduce((s, d) => s + Number(d.target_amount || 0), 0))}:{" "}
                  <span className="text-[#b36b3c]">{money(drivesRaised)}</span>
                </p>
              )}
            </div>

            {view === "liquidity" ? (
              /* ── Account Liquidity — live balances from admin › Treasury Accounts ── */
              <div className="mt-2">
                <h2 className="text-lg font-semibold">Account Liquidity</h2>
                <p className="text-sm text-[#617068]">
                  Live balances of the church&apos;s treasury accounts. Support any account to give straight to it.
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-2xl border border-[#dfdbd1] bg-white p-6 h-32" />
                    ))
                  ) : accounts.length === 0 ? (
                    <div className="col-span-full rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-8 text-center text-sm text-[#617068]">
                      No treasury accounts have been configured yet.
                    </div>
                  ) : (
                    accounts.map((account) => (
                      <div key={account.id} className="flex flex-col rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span
                            className="block h-2 w-2 rounded-full"
                            style={{ backgroundColor: ACCOUNT_COLORS[account.account_type] ?? ACCOUNT_COLORS.other }}
                          />
                          <span className="text-xs font-semibold text-[#617068]">{account.account_type_display}</span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-[#617068]">{account.name}</p>
                        <p className="mt-1 text-2xl font-bold text-[#26352f]">{money(Number(account.balance || 0))}</p>
                        {account.account_number && (
                          <p className="mt-1 font-mono text-xs text-[#617068]">A/C {account.account_number}</p>
                        )}
                        <Link
                          href={supportHref(account.description || account.name)}
                          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#faf7f2]"
                        >
                          <HandHeart className="h-3.5 w-3.5 text-[#b36b3c]" />
                          Support this account
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* ── Fund Drives — how each active drive is going ── */
              <div className="mt-2">
                <h2 className="text-lg font-semibold">Fund Drives</h2>
                <p className="text-sm text-[#617068]">
                  Every drive still collecting, against the amount it set out to raise.
                </p>

                <div className="mt-4 space-y-4">
                  {loading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-2xl border border-[#dfdbd1] bg-white p-6 h-32" />
                    ))
                  ) : activeDrives.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-8 text-center text-sm text-[#617068]">
                      No fund drives are collecting at the moment.
                    </div>
                  ) : (
                    activeDrives.map((drive) => {
                      const target = Number(drive.target_amount || 0);
                      const raised = Number(drive.total_raised || 0);
                      const deficit = Math.max(0, target - raised);
                      const raisedShare = target > 0 ? (raised / target) * 100 : 0;
                      const remainingShare = Math.max(0, 100 - raisedShare);
                      const complete = target > 0 && raised >= target;
                      return (
                        <div key={drive.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-bold text-[#26352f]">
                                {drive.title || drive.name}
                              </h3>
                              <p className="mt-0.5 text-xs text-[#617068]">
                                {drive.account_name ? `${drive.account_name} · ` : ""}
                                {drive.donor_count} {drive.donor_count === 1 ? "giver" : "givers"}
                                {drive.end_date ? ` · until ${new Date(drive.end_date).toLocaleDateString("en-KE")}` : ""}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${
                                complete ? "bg-[#eef2ed] text-[#3d7146]" : "bg-[#faf7f2] text-[#b36b3c]"
                              }`}
                            >
                              {complete ? "Target reached" : `${remainingShare.toFixed(0)}% to go`}
                            </span>
                          </div>

                          <div className="mt-4">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#f2efe8]">
                              <div
                                className="h-full rounded-full bg-[#5f8067]"
                                style={{ width: `${Math.min(100, Math.max(raisedShare > 0 ? 2 : 0, raisedShare))}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-[#617068]">
                              <strong className="text-[#26352f]">{raisedShare.toFixed(1)}%</strong> contributed ·{" "}
                              <strong className="text-[#26352f]">{remainingShare.toFixed(1)}%</strong> remaining
                            </p>
                          </div>

                          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#dfdbd1] pt-4 sm:grid-cols-4">
                            {[
                              { label: "Target", value: money(target) },
                              { label: "Contributed", value: money(raised) },
                              { label: "Deficit", value: money(deficit) },
                              { label: "Remaining", value: `${remainingShare.toFixed(1)}%` },
                            ].map((row) => (
                              <div key={row.label}>
                                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#617068]">
                                  {row.label}
                                </dt>
                                <dd className="mt-1 text-sm font-bold text-[#26352f]">{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
