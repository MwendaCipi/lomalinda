"use client";

import { useCallback, useEffect, useState } from "react";
import { brand } from "@/lib/brand";
import { dayFirst } from "@/lib/dates";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  HandCoins,
  Landmark,
  PiggyBank,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { CompositionBar, GroupedBarChart, HorizontalBars, TrendLineChart } from "./mini-charts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type SeriesPoint = {
  week_start: string;
  label: string;
  income: number;
  expense: number;
  gifts: number;
};

type MonthPoint = {
  month_start: string;
  label: string;
  income: number;
  expense: number;
  gifts: number;
};

type Analytics = {
  window_weeks: number;
  window_start: string;
  as_of: string;
  series: SeriesPoint[];
  previous: { income: number; expense: number; start: string; end: string };
  monthly: MonthPoint[];
  budget: {
    year: number;
    has_budget: boolean;
    income_target: number;
    expense_target: number;
    income_actual: number;
    expense_actual: number;
  };
  funds: {
    total_liquidity: number;
    account_count: number;
    by_type: { label: string; total: number; count: number }[];
    accounts: { id: number; name: string; type_label: string; balance: number }[];
  };
  giving: {
    this_month: number;
    last_month: number;
    this_year: number;
    window_total: number;
    by_account: { label: string; total: number }[];
    by_method: { label: string; total: number }[];
    givers: {
      gifts: number;
      givers: number;
      average: number;
      largest: number;
      grouped_total: number;
      last_gift_on: string | null;
    };
  };
  expenditure: {
    this_month: number;
    this_year: number;
    window_total: number;
    by_category: { label: string; total: number }[];
    by_account: { label: string; total: number }[];
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

const INCOME_COLOR = brand.sage;
const EXPENSE_COLOR = brand.ember;

/** The windows an officer actually asks about: this month, the quarter, half a year. */
const RANGES = [
  { weeks: 4, label: "4 weeks" },
  { weeks: 12, label: "12 weeks" },
  { weeks: 26, label: "26 weeks" },
];

const DEFAULT_WEEKS = 12;

const fmtAmount = (value: number) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

/** Axis labels need something short: KES 12k, KES 1.2M. */
const fmtCompact = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
};

const fmtDay = (iso: string) => dayFirst(iso);

/** How the window compares with the one before it; null when there is nothing to compare. */
const changePercent = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

const deltaHint = (current: number, previous: number) => {
  const percent = changePercent(current, previous);
  if (percent === null) return previous === 0 && current > 0 ? "none in the period before" : null;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}% on the period before`;
};

/**
 * What a treasurer would mark with a pencil, said in plain words.
 *
 * Every line is a restatement of a figure already on the page — nothing here is
 * modelled, estimated or forecast — so the panel and the notes can never
 * contradict each other.
 */
function buildInsights(data: Analytics): string[] {
  const notes: string[] = [];
  const weeks = data.window_weeks;
  const income = data.giving.window_total;
  const expense = data.expenditure.window_total;

  const percent = changePercent(income, data.previous.income);
  if (percent !== null) {
    notes.push(`Giving is ${percent >= 0 ? "up" : "down"} ${Math.abs(percent).toFixed(0)}% on the ${weeks} weeks before this one.`);
  } else if (income > 0 && data.previous.income === 0) {
    notes.push(`Nothing was recorded in the ${weeks} weeks before this one.`);
  }

  const quiet = data.series.filter((week) => week.income === 0 && week.expense === 0).length;
  if (quiet > 0 && data.series.length > 1) {
    notes.push(`${quiet} of the last ${data.series.length} weeks had no money recorded in or out.`);
  }

  if (expense > income) {
    notes.push(`Spending ran ${fmtAmount(expense - income)} ahead of giving in this window.`);
  }

  if (data.giving.givers.grouped_total > 0 && income > 0) {
    const share = (data.giving.givers.grouped_total / income) * 100;
    notes.push(
      `${fmtAmount(data.giving.givers.grouped_total)} (${share.toFixed(0)}% of giving) came in as collections or anonymous gifts.`,
    );
  }

  const largest = data.funds.accounts[0];
  if (largest && data.funds.total_liquidity > 0) {
    const share = (largest.balance / data.funds.total_liquidity) * 100;
    if (share >= 35) {
      notes.push(`${largest.name} holds ${share.toFixed(0)}% of the church's ${fmtAmount(data.funds.total_liquidity)}.`);
    }
  }

  if (data.pending_refunds.count > 0) {
    notes.push(
      `${data.pending_refunds.count} M-Pesa refund${data.pending_refunds.count === 1 ? "" : "s"} still awaiting settlement.`,
    );
  }

  return notes.slice(0, 4);
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string | null;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-2xl border border-sand-deep bg-sand-card p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-moss">{label}</p>
      <p className="mt-1.5 text-sm font-bold text-bark sm:text-base">{value}</p>
      {hint && (
        <p
          className={`mt-1 flex items-center gap-1 text-[10px] ${
            tone === "good" ? "text-sage-deep" : tone === "warn" ? "text-ember-deep" : "text-moss"
          }`}
        >
          {tone === "good" && <ArrowUpRight className="h-3 w-3" />}
          {tone === "warn" && <ArrowDownRight className="h-3 w-3" />}
          {hint}
        </p>
      )}
    </div>
  );
}

function ProgressRow({
  label,
  actual,
  target,
  formatValue,
}: {
  label: string;
  actual: number;
  target: number;
  formatValue: (value: number) => string;
}) {
  const share = target > 0 ? (actual / target) * 100 : 0;
  const over = share > 100;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-bark">{label}</span>
        <span className="text-xs font-bold text-bark">
          {formatValue(actual)}
          <span className="font-semibold text-moss"> of {formatValue(target)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-sand-light">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(2, share))}%`, backgroundColor: over ? brand.emberDeep : brand.sage }}
        />
      </div>
      <p className="mt-1 text-[10px] text-moss">
        {share.toFixed(0)}% of the year's plan
        {target > 0 && !over && actual < target && ` · ${formatValue(target - actual)} to go`}
        {over && ` · ${formatValue(actual - target)} beyond the plan`}
      </p>
    </li>
  );
}

/**
 * Church funds at a glance, for the officers who keep the books.
 *
 * Tailored for the treasurer and the leadership team: what came in, what went
 * out, who gave it, where the money sits and whether the year is running to
 * plan. Members never reach this panel — the caller renders it for finance
 * roles only, and the endpoint refuses anyone else — because these are the
 * whole church's figures.
 *
 * It holds what a treasurer is asked for, and no more: the month, the window,
 * the balance, the refunds owed and the year's plan, with the shape of the
 * window drawn over the figures so a total never has to be read alone.
 */
export function DashboardAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS);
  const [trend, setTrend] = useState<"weeks" | "months">("weeks");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (windowW: number) => {
    const token = localStorage.getItem("access_token");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/members/dashboard/analytics/?weeks=${windowW}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) {
        setState("denied");
        return;
      }
      if (!res.ok) throw new Error("analytics failed");
      setData(await res.json());
      setState("ready");
    } catch {
      setState((current) => (current === "ready" ? "ready" : "error"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(weeks);
  }, [load, weeks]);

  if (state === "denied") return null;

  if (state === "loading") {
    return (
      <section className="mt-6 rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
        <p className="text-center text-xs text-moss">Loading church finances…</p>
      </section>
    );
  }

  if (state === "error" || !data) {
    return (
      <section className="mt-6 rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold text-bark">Church finances</h2>
        <p className="mt-2 text-xs text-moss">
          The figures could not be loaded just now. Reload the page to try again — the rest of your dashboard is
          unaffected.
        </p>
      </section>
    );
  }

  const rangeLabel = `last ${data.window_weeks} weeks`;
  const net = data.giving.window_total - data.expenditure.window_total;
  // Which way this month's giving moved on last month's; null when there was
  // nothing recorded last month to move from.
  const givingChange = changePercent(data.giving.this_month, data.giving.last_month);
  const insights = buildInsights(data);

  // The four quarters of the calendar year — January to March is always the
  // first quarter, whatever today's date. The monthly series the API returns
  // reaches back twelve months, so months from last year carry last year's
  // money; those are balances carried forward, not this year's giving, and
  // they are left out. A quarter that has not started yet simply has nothing
  // recorded.
  const QUARTER_SPANS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];
  const asOf = new Date(data.as_of);
  const quarters = QUARTER_SPANS.map((span, index) => {
    const year = asOf.getFullYear();
    const months = data.monthly.filter((month) => {
      const start = new Date(month.month_start);
      return start.getFullYear() === year && Math.floor(start.getMonth() / 3) === index;
    });
    return { quarter: index + 1, span, year, months };
  });
  const quarterByIndex = quarters.map((quarter) => quarter.months);
  const quarterLabel = (index: number) =>
    `Q${quarters[index].quarter} · ${quarters[index].span} ${quarters[index].year}`;

  // "This quarter" is the one today falls in.
  const quarterOfToday = Math.floor(asOf.getMonth() / 3);

  const quarterIncome = (index: number) =>
    quarterByIndex[index].reduce((sum, month) => sum + month.income, 0);
  const quarterExpense = (index: number) =>
    quarterByIndex[index].reduce((sum, month) => sum + month.expense, 0);
  const hasQuarterly = quarterByIndex.some((quarter) => quarter.some((month) => month.income > 0 || month.expense > 0));
  // "Last quarter" is the one before this quarter — undefined only before Q1
  // has a predecessor, which the calendar cannot produce inside the year.
  const lastQuarterIndex = Math.max(0, quarterOfToday - 1);

  return (
    <section
      aria-busy={busy}
      className={`mt-6 rounded-2xl border border-sand-line bg-white p-5 shadow-sm transition-opacity sm:p-6 ${
        busy ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-bark">
            <Landmark className="h-4 w-4 text-ember" /> Church finances at a glance
          </h2>
          <p className="mt-1 text-[11px] text-moss">
            Real receipts only — completed gifts and recorded cash — for the {rangeLabel} to{" "}
            {fmtDay(data.as_of)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-sand-mute bg-white p-0.5" role="group" aria-label="Window">
            {RANGES.map((option) => (
              <button
                key={option.weeks}
                type="button"
                onClick={() => setWeeks(option.weeks)}
                aria-pressed={weeks === option.weeks}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  weeks === option.weeks ? "bg-bark text-white" : "text-bark hover:bg-sand-light"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Link
            href="/administration/reconciliation"
            className="rounded-full border border-sand-mute bg-white px-3.5 py-2 text-[11px] font-semibold text-bark hover:border-ember"
          >
            Reconciliation
          </Link>
          <Link
            href="/support/financial"
            className="rounded-full border border-sand-mute bg-white px-3.5 py-2 text-[11px] font-semibold text-bark hover:border-ember"
          >
            Live balances
          </Link>
        </div>
      </div>

      {insights.length > 0 && (
        <ul className="mt-4 grid gap-2 rounded-2xl border border-sand-deep bg-sand-veil p-4 sm:grid-cols-2">
          {insights.map((note) => (
            <li key={note} className="flex items-start gap-2 text-[11px] leading-snug text-moss-dim">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
              {note}
            </li>
          ))}
        </ul>
      )}

      {/* Headline figures. The month leads — it is the period a treasurer is
          asked about in passing, and the one the giving report is written on —
          then the window the officer picked, the church's balance, the money
          it owes back and the people behind it. */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Giving this month"
          value={fmtAmount(data.giving.this_month)}
          hint={deltaHint(data.giving.this_month, data.giving.last_month)}
          tone={givingChange === null ? undefined : givingChange < 0 ? "warn" : "good"}
        />
        <StatTile
          label="Spending this month"
          value={fmtAmount(data.expenditure.this_month)}
          hint={`${fmtAmount(data.expenditure.this_year)} this year`}
        />
        <StatTile
          label="Net in the window"
          value={fmtAmount(net)}
          hint={`giving less spending, over the ${rangeLabel}`}
        />
        <StatTile
          label="Total liquidity"
          value={fmtAmount(data.funds.total_liquidity)}
          hint={`${data.funds.account_count} ${data.funds.account_count === 1 ? "account" : "accounts"}`}
        />
        <StatTile
          label="M-Pesa refunds"
          value={data.pending_refunds.count > 0 ? fmtAmount(data.pending_refunds.amount) : "None owed"}
          hint={
            data.pending_refunds.count > 0
              ? `${data.pending_refunds.count} awaiting settlement`
              : "nothing awaiting settlement"
          }
        />
        <StatTile
          label="Members"
          value={String(data.members.total)}
          hint={`${data.members.friends} friends · ${data.members.new_this_month} new this month`}
        />
      </div>

      {/* The window the officer picked, week by week. The two lines carry the
          same money the tiles do — drawn so the shape is readable: a quiet
          month and a busy one can hold the same total, and only the chart
          tells them apart. */}
      <div className="mt-4 rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
          <TrendingUp className="h-4 w-4 text-ember" /> Giving in and spending out, week by week
        </h3>
        <p className="mt-1 text-[11px] text-moss">
          The {rangeLabel} to {fmtDay(data.as_of)}, real receipts only.
        </p>
        <div className="mt-4">
          <TrendLineChart
            points={data.series.map((week) => ({ label: week.label, values: [week.income, week.expense] }))}
            series={[
              { label: "Giving in", color: INCOME_COLOR },
              { label: "Spending out", color: EXPENSE_COLOR },
            ]}
            formatValue={fmtCompact}
            height={200}
            emptyLabel={`No money was recorded in or out over the ${rangeLabel}.`}
          />
        </div>
      </div>

      {/* The quarterly slides a treasurer opens with: one card per quarter,
          each with the income vs spending bar for that window and a short
          honest read. */}
      <div className="mt-6 rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
          <TrendingUp className="h-4 w-4 text-ember" /> Giving in vs spending out, by quarter
        </h3>
        <p className="mt-1 text-[11px] text-moss">
          The quarters of the year, oldest first, over the twelve months the API reports.
        </p>
        <div className="mt-4 gap-4 sm:gap-6">
          {quarterByIndex.map((quarter, index) => {
            const income = quarterIncome(index);
            const expense = quarterExpense(index);
            const net = income - expense;

            return (
              <div key={index} className={`rounded-xl border border-sand-deep bg-sand-card p-4 ${index > 0 ? "sm:mt-4" : ""}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-bark">{quarterLabel(index)}</p>
                    <p className="mt-0.5 text-[11px] text-moss">
                      {quarter.length > 0 ? `${quarter.reduce((sum, month) => sum + month.income + month.expense, 0)} recorded across ${quarter.length} month${quarter.length === 1 ? "" : "s"}` : "No money recorded in this quarter yet."}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm font-bold text-bark">{fmtAmount(income)}</span>
                    <span className="text-sm font-bold text-ember-deep">{fmtAmount(expense)}</span>
                    <span className={`text-sm font-bold ${net >= 0 ? "text-sage-deep" : "text-ember-deep"}`}>
                      {fmtAmount(net)}
                    </span>
                  </div>
                </div>
                <div className="mt-3">
                  {quarter.length > 0 ? (
                    <GroupedBarChart
                      groups={quarter.map((month) => ({ label: month.label, values: [month.income, month.expense] }))}
                      series={[
                        { label: "Giving in", color: INCOME_COLOR },
                        { label: "Spending out", color: EXPENSE_COLOR },
                      ]}
                      formatValue={fmtCompact}
                      emptyLabel={`No giving or spending recorded in ${quarterLabel(index)} yet.`}
                    />
                  ) : (
                    <p className="text-[11px] text-moss">
                      No giving or spending recorded in this quarter yet.
                    </p>
                  )}
                </div>
                {/* The window-wide "collections & anonymous" figure is on the
                    headline tiles; a per-quarter share of it would need
                    per-month collections, which the API does not report. */}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <Wallet className="h-4 w-4 text-ember" /> Where the money sits
          </h3>
          <p className="mt-1 text-[11px] text-moss">
            {fmtAmount(data.funds.total_liquidity)} across {data.funds.account_count} treasury{" "}
            {data.funds.account_count === 1 ? "account" : "accounts"}.
          </p>
          <div className="mt-4">
            <CompositionBar
              items={data.funds.by_type}
              formatValue={fmtAmount}
              emptyLabel="No treasury accounts have been added yet."
            />
          </div>
          {data.funds.accounts.length > 0 && (
            <div className="mt-4 border-t border-sand-line pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-moss">Largest balances</p>
              <div className="mt-3">
                <HorizontalBars
                  items={data.funds.accounts.map((account) => ({ label: account.name, value: account.balance }))}
                  formatValue={fmtAmount}
                  limit={5}
                  color={brand.bark}
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <PiggyBank className="h-4 w-4 text-ember" /> Giving by account
          </h3>
          <p className="mt-1 text-[11px] text-moss">
            {fmtAmount(data.giving.window_total)} received across {data.giving.by_account.length}{" "}
            {data.giving.by_account.length === 1 ? "account" : "accounts"} in the {rangeLabel}.
          </p>
          <div className="mt-4">
            <HorizontalBars
              items={data.giving.by_account.map((row) => ({ label: row.label, value: row.total }))}
              formatValue={fmtAmount}
              limit={6}
              emptyLabel={`Nothing received in the ${rangeLabel}.`}
            />
          </div>
          {data.giving.by_method.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-sand-line pt-3">
              {data.giving.by_method.map((row) => (
                <span
                  key={row.label}
                  className="rounded-full bg-sand-light px-2.5 py-1 text-[10px] font-semibold text-bark"
                >
                  {row.label}: {fmtAmount(row.total)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <ArrowDownRight className="h-4 w-4 text-ember" /> Spending by category
          </h3>
          <p className="mt-1 text-[11px] text-moss">
            {fmtAmount(data.expenditure.window_total)} spent in the {rangeLabel} ·{" "}
            {fmtAmount(data.expenditure.this_year)} this year.
          </p>
          <div className="mt-4">
            <HorizontalBars
              items={data.expenditure.by_category.map((row) => ({ label: row.label, value: row.total }))}
              formatValue={fmtAmount}
              emptyLabel={`No expenditure recorded in the ${rangeLabel}.`}
              limit={5}
              color={brand.emberDeep}
            />
          </div>
          {data.expenditure.by_account.length > 0 && (
            <div className="mt-4 border-t border-sand-line pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-moss">Paid from</p>
              <ul className="mt-2 space-y-1.5">
                {data.expenditure.by_account.slice(0, 4).map((row) => (
                  <li key={row.label} className="flex items-baseline justify-between gap-3 text-[11px]">
                    <span className="truncate text-moss">{row.label}</span>
                    <span className="shrink-0 font-semibold text-bark">{fmtAmount(row.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
            <Users className="h-4 w-4 text-ember" /> Giving activity
          </h3>
          <p className="mt-1 text-[11px] text-moss">
            Who is giving, without naming and ranking donors — the figures are per gift, not per person.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Gifts recorded", value: String(data.giving.givers.gifts) },
              { label: "Givers", value: String(data.giving.givers.givers) },
              { label: "Average gift", value: fmtAmount(data.giving.givers.average) },
              { label: "Largest gift", value: fmtAmount(data.giving.givers.largest) },
              { label: "This quarter", value: fmtAmount(quarterIncome(quarterOfToday)) },
              { label: "Last quarter", value: fmtAmount(quarterIncome(lastQuarterIndex)) },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-moss">{row.label}</dt>
                <dd className="mt-1 text-xs font-bold text-bark">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-center gap-2 border-t border-sand-line pt-3 text-[11px] text-moss">
            <HandCoins className="h-3.5 w-3.5 text-ember" />
            {data.giving.givers.last_gift_on
              ? `Most recent gift: ${fmtDay(data.giving.givers.last_gift_on)}`
              : `No gift recorded in the ${rangeLabel}.`}
          </p>
        </div>

        <div className="rounded-2xl border border-sand-deep bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-bark">
              <Target className="h-4 w-4 text-ember" /> {data.budget.year} budget
            </h3>
            <Link href="/support/budget" className="text-[11px] font-semibold text-ember hover:underline">
              Open budget <ArrowRight size={11} className="inline" aria-hidden="true" />
            </Link>
          </div>
          {data.budget.has_budget ? (
            <ul className="mt-4 space-y-4">
              <ProgressRow
                label="Income to date"
                actual={data.budget.income_actual}
                target={data.budget.income_target}
                formatValue={fmtAmount}
              />
              <ProgressRow
                label="Expenditure to date"
                actual={data.budget.expense_actual}
                target={data.budget.expense_target}
                formatValue={fmtAmount}
              />
            </ul>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-moss">
              No budget has been set for {data.budget.year}, so there is no plan to measure the year against. Record
              one and this card turns into a progress bar for income and expenditure.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-sand-line pt-3 text-[11px] text-moss">
            <span className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-ember" /> {fmtAmount(data.giving.this_year)} given this year
            </span>
            <span className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-ember" /> {fmtAmount(data.expenditure.this_year)} spent this
              year
            </span>
            {data.members.pending_invitations > 0 && (
              <span>
                {data.members.pending_invitations} invitation
                {data.members.pending_invitations === 1 ? "" : "s"} awaiting acceptance
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
