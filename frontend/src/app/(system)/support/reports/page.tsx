"use client";

import { useEffect, useRef, useState } from "react";
import { HandHeart, Search } from "lucide-react";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";
import { GiveNowModal } from "@/components/give-now-modal";

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

// ── Helpers ────────────────────────────────────────────────────────────────
const money = (n: number) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

/** The account a Support button names, preselected in the in-page modal. */
const supportAccount = (accountName: string) => accountName;

// Card accent per treasury account type — the accounts themselves come live
// from admin › Treasury Accounts, nothing about them is hardcoded here.
const ACCOUNT_COLORS: Record<string, string> = {
  bank: "#26352f",
  mobile_money: "#b36b3c",
  cash: "#617068",
  other: "#7a8c56",
};

// ── Main Component ────────────────────────────────────────────────────────
export default function LiveReportsPage() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // "Support this account" opens the give-now modal right here, so cancelling
  // lands the member back on the live reports page — never mid-navigation.
  const [supportAccountName, setSupportAccountName] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function loadData() {
    try {
      const token = localStorage.getItem("access_token");
      const auth: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const accountsRes = await fetch(`${API_URL}/api/members/treasury/accounts/`, { headers: auth });
      if (accountsRes.ok) setAccounts(await accountsRes.json());
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

  // The search reads what members read: the account's description (the label
  // the giving form shows) and its short name, plus the type. The total
  // across accounts stays whole — it is the church's liquidity, not the
  // filtered subset's.
  const visibleAccounts = accounts.filter((account) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [account.description, account.name, account.account_type_display]
      .filter((text): text is string => Boolean(text))
      .some((text) => text.toLowerCase().includes(query));
  });

  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Account Liquidity — live balances from admin › Treasury Accounts */}
            <div className="mt-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-lg font-semibold">Account Liquidity</h2>
                {!loading && accounts.length > 0 && (
                  <p className="text-sm font-bold text-[#26352f]">
                    Total across accounts: <span className="text-[#b36b3c]">{money(liquidityTotal)}</span>
                  </p>
                )}
              </div>
              <p className="text-sm text-[#617068]">
                Live balances of the church&apos;s treasury accounts. Support any account to give straight to it.
              </p>
              {/* Search sits directly under the paragraph on a phone, beside
                  the heading on a wide screen. */}
              <div className="relative mt-3 sm:mt-0">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a948d]" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search accounts…"
                  aria-label="Search treasury accounts"
                  className="w-full rounded-xl border border-[#c9c5bb] bg-white py-2 pl-10 pr-3 text-sm outline-none transition focus:border-[#b36b3c] sm:w-64"
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="animate-pulse rounded-2xl border border-[#dfdbd1] bg-white p-6 h-32" />
                  ))
                ) : accounts.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-8 text-center text-sm text-[#617068]">
                    No treasury accounts have been configured yet.
                  </div>
                ) : visibleAccounts.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-[#c9c5bb] bg-white p-8 text-center text-sm text-[#617068]">
                    No account matches “{search.trim()}”.
                  </div>
                ) : (
                  visibleAccounts.map((account) => (
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
                      <button
                        type="button"
                        onClick={() => setSupportAccountName(supportAccount(account.description || account.name))}
                        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#faf7f2]"
                      >
                        <HandHeart className="h-3.5 w-3.5 text-[#b36b3c]" />
                        Support this account
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Supporting an account happens here: the modal preselects the account
          and cancelling returns to this page. */}
      <GiveNowModal
        open={supportAccountName !== null}
        onClose={() => setSupportAccountName(null)}
        presetAccount={supportAccountName ?? undefined}
      />
    </main>
  );
}
