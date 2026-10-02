"use client";

import { useEffect, useRef, useState } from "react";
import { HandHeart, Search } from "lucide-react";
import { brand } from "@/lib/brand";
import { GiveNowModal } from "@/components/give-now-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type TreasuryAccount = {
  id: number;
  name: string;
  description?: string;
  account_number: string;
  account_type: string;
  account_type_display: string;
  balance: number | string;
};

const money = (n: number) =>
  `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

// Card accent per treasury account type — the accounts themselves come live
// from admin › Treasury Accounts, nothing about them is hardcoded here.
const ACCOUNT_COLORS: Record<string, string> = {
  bank: brand.bark,
  mobile_money: brand.ember,
  cash: brand.moss,
  other: brand.sageLime,
};

/**
 * The live half of Reports: the church's treasury accounts and what is in them
 * right now, refreshed every 30 seconds.
 *
 * The cards are deliberately short — this is a covering page, so the member
 * should be able to take in every account at a glance without scrolling, and
 * each one carries the same four things: what it is, what it is called, what
 * it holds, and the way to give to it.
 */
export function LiveReportsPanel() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // "Support this account" opens the give-now modal right here, so cancelling
  // lands the member back on the reports page — never mid-navigation.
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
    // The first read is deferred by a microtask rather than started in the
    // effect's own synchronous body — the state it lands then settles after
    // the first paint. The 30-second poll takes over from there.
    void Promise.resolve().then(loadData);
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">Account Liquidity</h2>
        {!loading && accounts.length > 0 && (
          <p className="text-sm font-bold text-bark">
            Total across accounts: <span className="text-ember">{money(liquidityTotal)}</span>
          </p>
        )}
      </div>
      <div className="relative sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-moss-faint2"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search accounts…"
          aria-label="Search treasury accounts"
          className="w-full rounded-xl border border-sand-mute bg-white py-2 pl-10 pr-3 text-sm outline-none transition focus:border-ember"
        />
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-sand-line bg-white sm:h-24" />
          ))
        ) : accounts.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-sand-mute bg-white p-6 text-center text-sm text-moss">
            No treasury accounts have been configured yet.
          </div>
        ) : visibleAccounts.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-sand-mute bg-white p-6 text-center text-sm text-moss">
            No account matches “{search.trim()}”.
          </div>
        ) : (
          visibleAccounts.map((account) => (
            <div
              key={account.id}
              className="flex flex-col rounded-2xl border border-sand-line bg-white p-3.5 shadow-sm sm:p-4"
            >
              {/* Type and account number share the top row so the card keeps to
                  four lines: what it is, its name, its balance, the button. */}
              <div className="flex items-center gap-2">
                <span
                  className="block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ACCOUNT_COLORS[account.account_type] ?? ACCOUNT_COLORS.other }}
                />
                <span className="text-[11px] font-semibold text-moss">{account.account_type_display}</span>
                {account.account_number && (
                  <span className="ml-auto min-w-0 truncate font-mono text-[11px] text-moss-faint2">
                    A/C {account.account_number}
                  </span>
                )}
              </div>
              {/* Members read the description (e.g. "Adventist Men"), never the
                  12-character M-Pesa name ("AdventMEn"). */}
              <p className="mt-1.5 truncate text-sm font-semibold text-moss">
                {account.description || account.name}
              </p>
              <p className="mt-0.5 text-lg font-bold text-bark sm:text-xl">
                {money(Number(account.balance || 0))}
              </p>
              <button
                type="button"
                onClick={() => setSupportAccountName(account.description || account.name)}
                className="mt-auto inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-1 text-xs font-bold text-bark transition hover:border-ember hover:bg-sand-linen"
              >
                <HandHeart className="h-3.5 w-3.5 text-ember" />
                Support this account
              </button>
            </div>
          ))
        )}
      </div>

      {/* Supporting an account happens here: the modal preselects the account
          and cancelling returns to this page. */}
      <GiveNowModal
        open={supportAccountName !== null}
        onClose={() => setSupportAccountName(null)}
        presetAccount={supportAccountName ?? undefined}
      />
    </div>
  );
}
