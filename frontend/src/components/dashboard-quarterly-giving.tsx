"use client";

import { useCallback, useEffect, useState } from "react";
import { brand } from "@/lib/brand";
import { TrendingUp } from "lucide-react";
import { GroupedBarChart } from "@/components/mini-charts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type MonthPoint = {
  month_start: string;
  label: string;
  income: number;
  expense: number;
  gifts: number;
};

type Analytics = {
  as_of: string;
  monthly: MonthPoint[];
};

const INCOME_COLOR = brand.sage;

const fmtAmount = (value: number) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

/** Axis labels need something short: KES 12k, KES 1.2M. */
const fmtCompact = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
};

/**
 * Quarterly giving statistics for the officers who keep the books: the
 * calendar year's quarters, oldest first, each with its total giving and the
 * monthly bars behind it. Members never see this card — it rides on the same
 * analytics endpoint the Church finances panel used, which refuses anyone
 * outside the treasury roles.
 */
export function DashboardQuarterlyGiving() {
  const [data, setData] = useState<Analytics | null>(null);
  const [visible, setVisible] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/dashboard/analytics/?weeks=12`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) {
        setVisible(false);
        return;
      }
      if (!res.ok) return;
      setData((await res.json()) as Analytics);
      setVisible(true);
    } catch {
      // The card just stays hidden if the figures cannot be reached.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!visible || !data) return null;

  // The four quarters of the calendar year — January to March is always the
  // first quarter, whatever today's date. The monthly series reaches back
  // twelve months, so months from last year are left out: those are balances
  // carried forward, not this year's giving.
  const QUARTER_SPANS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];
  const asOf = new Date(data.as_of);
  const year = asOf.getFullYear();
  const quarters = QUARTER_SPANS.map((span, index) => ({
    label: `Q${index + 1} · ${span} ${year}`,
    months: data.monthly.filter((month) => {
      const start = new Date(month.month_start);
      return start.getFullYear() === year && Math.floor(start.getMonth() / 3) === index;
    }),
  }));
  const hasAnyGiving = quarters.some((quarter) => quarter.months.some((month) => month.income > 0));

  return (
    <section className="mt-6 rounded-2xl border border-sand-line bg-white p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold text-bark">
        <TrendingUp className="h-4 w-4 text-ember" /> Quarterly giving
      </h2>
      <p className="mt-1 text-[11px] text-moss">
        The year's quarters, oldest first — real receipts only, completed gifts.
      </p>

      <div className="mt-4 gap-4 sm:gap-5">
        {quarters.map((quarter) => {
          const total = quarter.months.reduce((sum, month) => sum + month.income, 0);
          return (
            <div key={quarter.label} className="rounded-xl border border-sand-deep bg-sand-card p-4 sm:mt-4 first:sm:mt-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-bark">{quarter.label}</p>
                <p className="text-sm font-bold text-bark">{fmtAmount(total)}</p>
              </div>
              <div className="mt-3">
                {quarter.months.length > 0 ? (
                  <GroupedBarChart
                    groups={quarter.months.map((month) => ({ label: month.label, values: [month.income] }))}
                    series={[{ label: "Giving", color: INCOME_COLOR }]}
                    formatValue={fmtCompact}
                    height={120}
                    emptyLabel={`No giving recorded in ${quarter.label} yet.`}
                  />
                ) : (
                  <p className="text-[11px] text-moss">No giving recorded in this quarter yet.</p>
                )}
              </div>
            </div>
          );
        })}
        {!hasAnyGiving && (
          <p className="text-[11px] text-moss">
            No giving recorded this year yet — the quarters fill in as offerings are received.
          </p>
        )}
      </div>
    </section>
  );
}
