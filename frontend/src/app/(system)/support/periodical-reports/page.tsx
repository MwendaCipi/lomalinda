"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Report = {
  id: number;
  title: string;
  period_type?: string;
  period_start: string;
  period_end: string;
  total_tithes: string;
  total_offerings: string;
  total_expenses: string;
  notes: string;
};

const money = (value: string | number) =>
  `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function PeriodicalReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/members/reports/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setReports(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Periodic Reports
              </h1>
              <p className="mt-3 text-base leading-7 text-moss">
                Published weekly, monthly, quarterly, and annual financial statements for SDA Loma Linda.
              </p>
            </div>

            <div className="mt-8">
              {loading ? (
                <p className="text-sm text-moss">Loading periodical financial reports...</p>
              ) : reports.length === 0 ? (
                <div className="rounded-3xl border border-sand-line bg-white p-8 text-center text-moss">
                  No published periodical financial reports found at this time.
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  {reports.map((report) => (
                    <article
                      key={report.id}
                      className="rounded-3xl border border-sand-line bg-white p-7 shadow-sm"
                    >
                      <span className="rounded-full bg-sand px-3.5 py-1 text-xs font-semibold text-ember capitalize">
                        {report.period_type ? `${report.period_type} Report` : "Financial Report"} · {report.period_start} to {report.period_end}
                      </span>
                      <h2 className="mt-4 text-2xl font-semibold">{report.title}</h2>

                      <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-sand-line pt-6 text-sm">
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-moss">Tithes</dt>
                          <dd className="mt-1 font-semibold text-bark">{money(report.total_tithes)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-moss">Offerings</dt>
                          <dd className="mt-1 font-semibold text-bark">{money(report.total_offerings)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase tracking-wider text-moss">Expenses</dt>
                          <dd className="mt-1 font-semibold text-bark">{money(report.total_expenses)}</dd>
                        </div>
                      </dl>

                      {report.notes && (
                        <div className="mt-5 border-t border-sand-line pt-4">
                          <p className="text-xs font-semibold uppercase tracking-wider text-moss">
                            Notes &amp; Details
                          </p>
                          <p className="mt-2 text-sm leading-6 text-moss">{report.notes}</p>
                        </div>
                      )}
                    </article>
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
