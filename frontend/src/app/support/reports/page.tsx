"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Report = {
  id: number;
  title: string;
  period_type: "monthly" | "quarterly" | "annual";
  period_start: string;
  period_end: string;
  total_tithes: string;
  total_offerings: string;
  total_expenses: string;
  notes: string;
};

const money = (value: string) => `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function FinancialReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "monthly" | "quarterly" | "annual">("all");

  useEffect(() => {
    fetch(`${API_URL}/api/members/reports/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setReports(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredReports = reports.filter((r) => (filter === "all" ? true : r.period_type === filter));

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Back Button */}
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Stewardship & Support</span>
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Financial Stewardship</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Financial Reports</h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            Transparent monthly, quarterly, and annual financial statements published by Loma Linda SDA Church treasury.
          </p>
        </div>

        {/* Filter Tabs (All, Monthly, Quarterly, Annual) */}
        <div className="mt-8 flex flex-wrap gap-2 rounded-2xl border border-[#dfdbd1] bg-white p-2">
          {(["all", "monthly", "quarterly", "annual"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-xl px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
                filter === tab ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f]"
              }`}
            >
              {tab === "all" ? "All Reports" : `${tab} Reports`}
            </button>
          ))}
        </div>

        {/* Reports Content */}
        <div className="mt-8">
          {loading ? (
            <p className="text-sm text-[#617068]">Loading financial statements...</p>
          ) : filteredReports.length === 0 ? (
            <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-[#617068]">
              No {filter !== "all" ? filter : ""} financial reports have been published yet.
            </div>
          ) : (
            <div className="space-y-6">
              {filteredReports.map((report) => (
                <article key={report.id} className="rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dfdbd1] pb-5">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-semibold text-[#26352f]">{report.title}</h2>
                        <span className="rounded-full bg-[#f7f4ee] px-3 py-1 text-xs font-semibold capitalize text-[#b36b3c]">
                          {report.period_type || "Monthly"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#617068]">
                        Period: {report.period_start} &ndash; {report.period_end}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-[#617068]">Tithes</span>
                      <span className="mt-1 block text-lg font-semibold text-[#26352f]">{money(report.total_tithes)}</span>
                    </div>

                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-[#617068]">Offerings</span>
                      <span className="mt-1 block text-lg font-semibold text-[#26352f]">{money(report.total_offerings)}</span>
                    </div>

                    <div className="rounded-2xl bg-[#f7f4ee] p-4">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-[#617068]">Expenses</span>
                      <span className="mt-1 block text-lg font-semibold text-[#26352f]">{money(report.total_expenses)}</span>
                    </div>
                  </div>

                  {report.notes && (
                    <div className="mt-5 border-t border-[#dfdbd1] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#617068]">Treasury Notes</p>
                      <p className="mt-2 text-sm leading-6 text-[#617068]">{report.notes}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
