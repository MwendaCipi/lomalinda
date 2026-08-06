"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Budget = { id: number; year: number; total_income: string; total_expenses: string; notes: string };
type Report = { id: number; title: string; period_start: string; period_end: string; total_tithes: string; total_offerings: string; total_expenses: string; notes: string };

const money = (value: string) => `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function FinancialPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    Promise.all([
      fetch(`${API_URL}/api/members/budgets/`, { headers }).then((res) => (res.ok ? res.json() : [])),
      fetch(`${API_URL}/api/members/reports/`, { headers }).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([budgetData, reportData]) => {
        setBudgets(budgetData);
        setReports(reportData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-12 pb-10 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Financial Stewardship</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Giving & Financial Reports</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#617068] sm:text-lg">
              We believe in open, transparent stewardship of God&apos;s resources at Loma Linda SDA Church.
            </p>
          </div>
          <Link href="/give" className="rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e]">
            Give / Support Church &rarr;
          </Link>
        </div>

        {/* Giving Banner Card */}
        <section className="mt-10 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-10">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Support the Ministry</h2>
              <p className="mt-2 text-sm leading-6 text-[#617068]">
                Your tithes and offerings enable worship, evangelism, community outreach, and care for our church family. Give easily via M-Pesa or bank transfer.
              </p>
            </div>
            <Link
              href="/give"
              className="inline-block rounded-full bg-[#26352f] px-6 py-3.5 font-semibold text-white transition hover:bg-[#1d2a25]"
            >
              Online Giving &rarr;
            </Link>
          </div>
        </section>

        {/* Church Budget Section */}
        <section id="budget" className="scroll-mt-28 pt-12">
          <h2 className="text-2xl font-semibold">Church Budget</h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#617068]">Loading church budget...</p>
          ) : (
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {budgets.map((budget) => (
                <article key={budget.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-6 shadow-sm">
                  <p className="text-sm font-semibold text-[#b36b3c]">{budget.year} Budget</p>
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-[#617068]">Income</p>
                      <p className="mt-1 text-lg font-semibold">{money(budget.total_income)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-[#617068]">Expenses</p>
                      <p className="mt-1 text-lg font-semibold">{money(budget.total_expenses)}</p>
                    </div>
                  </div>
                  {budget.notes && <p className="mt-5 text-sm leading-6 text-[#617068]">{budget.notes}</p>}
                </article>
              ))}
            </div>
          )}
          {!loading && budgets.length === 0 && <p className="mt-5 text-sm text-[#617068]">No church budget has been published yet.</p>}
        </section>

        {/* Financial Reports Section */}
        <section id="reports" className="scroll-mt-28 border-t border-[#dfdbd1] pt-12 mt-12">
          <h2 className="text-2xl font-semibold">Financial Reports</h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#617068]">Loading financial reports...</p>
          ) : (
            <div className="mt-5 divide-y divide-[#dfdbd1] rounded-2xl border border-[#dfdbd1] bg-white shadow-sm">
              {reports.map((report) => (
                <article key={report.id} className="p-6">
                  <div className="flex flex-wrap justify-between gap-4">
                    <h3 className="text-lg font-semibold">{report.title}</h3>
                    <p className="text-sm text-[#617068]">
                      {report.period_start} &ndash; {report.period_end}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <span className="block text-xs uppercase tracking-wider text-[#617068]">Tithes</span>
                      <span className="font-semibold">{money(report.total_tithes)}</span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-wider text-[#617068]">Offerings</span>
                      <span className="font-semibold">{money(report.total_offerings)}</span>
                    </div>
                    <div>
                      <span className="block text-xs uppercase tracking-wider text-[#617068]">Expenses</span>
                      <span className="font-semibold">{money(report.total_expenses)}</span>
                    </div>
                  </div>
                  {report.notes && <p className="mt-4 text-sm leading-6 text-[#617068]">{report.notes}</p>}
                </article>
              ))}
            </div>
          )}
          {!loading && reports.length === 0 && <p className="mt-5 text-sm text-[#617068]">No financial reports have been published yet.</p>}
        </section>
      </div>
    </main>
  );
}
