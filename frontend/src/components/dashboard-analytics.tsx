"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Landmark, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { GroupedBarChart, HorizontalBars } from "./mini-charts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type SeriesPoint = {
  week_start: string;
  label: string;
  income: number;
  expense: number;
  gifts: number;
};

type Analytics = {
  window_weeks: number;
  as_of: string;
  series: SeriesPoint[];
  funds: {
    total_liquidity: number;
    account_count: number;
    accounts: { id: number; name: string; type_label: string; balance: number }[];
  };
  giving: {
    this_month: number;
    last_month: number;
    this_year: number;
    window_total: number;
    by_account: { label: string; total: number }[];
    by_method: { label: string; total: number }[];
  };
  expenditure: {
    this_month: number;
    this_year: number;
    window_total: number;
    by_category: { label: string; total: number }[];
  };
  members: {
    total: number;
    friends: number;
    new_this_month: number;
    ex_members: number;
    pending_invitations: number;
  };
  pending_refunds: { count: number; amount: number };
};

const INCOME_COLOR = "#5f8067";
const EXPENSE_COLOR = "#b36b3c";

const fmtAmount = (value: number) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

/** Axis labels need something short: KES 12k, KES 1.2M. */
const fmtCompact = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
};

/**
 * Church funds at a glance, for the officers who keep the books.
 *
 * Tailored for the treasurer and the leadership team: what came in, what went
 * out, where the money sits, and the handful of numbers that raise a question
 * (pending refunds, invitations nobody has accepted). Members never reach this
 * panel — the caller renders it for finance roles only, and the endpoint
 * refuses anyone else — because these are the whole church's figures.
 */
export function DashboardAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    let cancelled = false;

    fetch(`${API_URL}/api/members/dashboard/analytics/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 403) {
          setState("denied");
          return;
        }
        if (!res.ok) throw new Error("analytics failed");
        const payload: Analytics = await res.json();
        setData(payload);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "denied") return null;

  if (state === "loading") {
    return (
      <section className="mt-6 rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-center text-xs text-[#617068]">Loading church finances…</p>
      </section>
    );
  }

  if (state === "error" || !data) {
    return (
      <section className="mt-6 rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-[#26352f]">Church finances</h2>
        <p className="mt-2 text-xs text-[#617068]">
          The figures could not be loaded just now. Reload the page to try again — the rest of your dashboard is
          unaffected.
        </p>
      </section>
    );
  }

  const monthDelta = data.giving.this_month - data.giving.last_month;
  const monthDeltaPct = data.giving.last_month > 0 ? (monthDelta / data.giving.last_month) * 100 : null;
  const netThisMonth = data.giving.this_month - data.expenditure.this_month;
  const windowNet = data.giving.window_total - data.expenditure.window_total;
  const hasSeries = data.series.some((point) => point.income > 0 || point.expense > 0);

  const kpis: { label: string; value: string; hint?: string; tone?: "good" | "warn" }[] = [
    {
      label: "Total liquidity",
      value: fmtAmount(data.funds.total_liquidity),
      hint: `${data.funds.account_count} ${data.funds.account_count === 1 ? "account" : "accounts"}`,
    },
    {
      label: "Giving this month",
      value: fmtAmount(data.giving.this_month),
      hint:
        monthDeltaPct === null
          ? "no figure for last month"
          : `${monthDelta >= 0 ? "+" : ""}${monthDeltaPct.toFixed(0)}% vs last month`,
      tone: monthDeltaPct === null ? undefined : monthDelta > 0 ? "good" : monthDelta < 0 ? "warn" : undefined,
    },
    {
      label: "Spending this month",
      value: fmtAmount(data.expenditure.this_month),
      hint: `KES ${data.expenditure.this_year.toLocaleString("en-KE", { maximumFractionDigits: 0 })} this year`,
    },
    {
      label: "Net this month",
      value: fmtAmount(netThisMonth),
      hint: netThisMonth >= 0 ? "surplus" : "deficit",
      tone: netThisMonth >= 0 ? "good" : "warn",
    },
    {
      label: "Pending refunds",
      value: String(data.pending_refunds.count),
      hint: data.pending_refunds.count > 0 ? fmtAmount(data.pending_refunds.amount) : "nothing outstanding",
    },
    {
      label: "Members",
      value: String(data.members.total),
      hint: `${data.members.friends} friends · ${data.members.new_this_month} new this month`,
    },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-[#26352f]">
            <Landmark className="h-4 w-4 text-[#b36b3c]" /> Church finances at a glance
          </h2>
          <p className="mt-1 text-[11px] text-[#617068]">
            Real receipts only — completed gifts and recorded cash — for the last {data.window_weeks} weeks to{" "}
            {new Date(data.as_of).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/administration/reconciliation"
            className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]"
          >
            Reconciliation
          </Link>
          <Link
            href="/support/reports"
            className="rounded-full border border-[#c9c5bb] bg-white px-3.5 py-2 text-[11px] font-semibold text-[#26352f] hover:border-[#b36b3c]"
          >
            Live reports
          </Link>
        </div>
      </div>

      {/* Headline figures */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-[#e5dfd2] bg-[#faf9f5] p-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#617068]">{kpi.label}</p>
            <p className="mt-1.5 text-sm font-bold text-[#26352f] sm:text-base">{kpi.value}</p>
            {kpi.hint && (
              <p
                className={`mt-1 flex items-center gap-1 text-[10px] ${
                  kpi.tone === "good" ? "text-[#4d6d55]" : kpi.tone === "warn" ? "text-[#96552c]" : "text-[#617068]"
                }`}
              >
                {kpi.tone === "good" && <ArrowUpRight className="h-3 w-3" />}
                {kpi.tone === "warn" && <ArrowDownRight className="h-3 w-3" />}
                {kpi.hint}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Money in and out, week by week */}
      <div className="mt-6 rounded-2xl border border-[#e5dfd2] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#26352f]">
            <TrendingUp className="h-4 w-4 text-[#b36b3c]" /> Giving in vs spending out
          </h3>
          <p className="text-[11px] text-[#617068]">
            Last {data.window_weeks} weeks · in {fmtAmount(data.giving.window_total)} · out{" "}
            {fmtAmount(data.expenditure.window_total)}
            {hasSeries && (
              <span className={windowNet >= 0 ? "text-[#4d6d55]" : "text-[#96552c]"}>
                {" "}
                · net {fmtAmount(windowNet)}
              </span>
            )}
          </p>
        </div>
        <div className="mt-4">
          <GroupedBarChart
            groups={data.series.map((point) => ({
              label: point.label,
              values: [point.income, point.expense],
            }))}
            series={[
              { label: "Giving in", color: INCOME_COLOR },
              { label: "Spending out", color: EXPENSE_COLOR },
            ]}
            formatValue={fmtCompact}
            emptyLabel="No giving or spending recorded in these weeks yet."
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#e5dfd2] bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#26352f]">
            <Wallet className="h-4 w-4 text-[#b36b3c]" /> Where the money sits
          </h3>
          <p className="mt-1 text-[11px] text-[#617068]">
            Live balances of the {data.funds.account_count} treasury{" "}
            {data.funds.account_count === 1 ? "account" : "accounts"}.
          </p>
          <div className="mt-4">
            <HorizontalBars
              items={data.funds.accounts.map((account) => ({ label: account.name, value: account.balance }))}
              formatValue={fmtAmount}
              emptyLabel="No treasury accounts have been added yet."
              limit={6}
              color="#26352f"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#e5dfd2] bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#26352f]">
            <PiggyBank className="h-4 w-4 text-[#b36b3c]" /> Giving by account
          </h3>
          <p className="mt-1 text-[11px] text-[#617068]">
            {fmtAmount(data.giving.window_total)} received across {data.giving.by_account.length}{" "}
            {data.giving.by_account.length === 1 ? "account" : "accounts"} in these weeks.
          </p>
          <div className="mt-4">
            <HorizontalBars
              items={data.giving.by_account.map((row) => ({ label: row.label, value: row.total }))}
              formatValue={fmtAmount}
              limit={6}
            />
          </div>
          {data.giving.by_method.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#dfdbd1] pt-3">
              {data.giving.by_method.map((row) => (
                <span
                  key={row.label}
                  className="rounded-full bg-[#f2efe8] px-2.5 py-1 text-[10px] font-semibold text-[#26352f]"
                >
                  {row.label}: {fmtAmount(row.total)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#e5dfd2] bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#26352f]">
            <ArrowDownRight className="h-4 w-4 text-[#b36b3c]" /> Spending by category
          </h3>
          <p className="mt-1 text-[11px] text-[#617068]">
            {fmtAmount(data.expenditure.window_total)} spent in these weeks ·{" "}
            {fmtAmount(data.expenditure.this_year)} this year.
          </p>
          <div className="mt-4">
            <HorizontalBars
              items={data.expenditure.by_category.map((row) => ({ label: row.label, value: row.total }))}
              formatValue={fmtAmount}
              emptyLabel="No expenditure recorded in these weeks."
              limit={5}
              color="#96552c"
            />
          </div>
          {data.members.pending_invitations > 0 && (
            <p className="mt-4 border-t border-[#dfdbd1] pt-3 text-[11px] text-[#617068]">
              {data.members.pending_invitations} invitation
              {data.members.pending_invitations === 1 ? "" : "s"} still waiting to be accepted.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
