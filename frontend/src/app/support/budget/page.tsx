"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Budget = { id: number; year: number; total_income: string; total_expenses: string; notes: string };

const money = (value: string) => `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function ChurchBudgetPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token"); setToken(accessToken);
    if (!accessToken) { setLoading(false); return; }
    fetch(`${API_URL}/api/members/budgets/`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBudgets(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (token === null) return <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-[#26352f]"><div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#dfdbd1]"><h1 className="text-2xl font-semibold">Sign in required</h1><p className="mt-3 text-sm leading-6 text-[#617068]">Please sign in to view church budgets.</p><Link href="/login" className="mt-6 inline-block rounded-full bg-[#b36b3c] px-5 py-3 font-semibold text-white">Sign in</Link></div></main>;
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
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Church Budget</h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            Published annual operating budgets and project allocations for Loma Linda SDA Church, Meru.
          </p>
        </div>

        {/* Budget Content */}
        <div className="mt-8">
          {loading ? (
            <p className="text-sm text-[#617068]">Loading church budgets...</p>
          ) : budgets.length === 0 ? (
            <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-[#617068]">
              No published annual church budgets found at this time.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {budgets.map((budget) => (
                <article key={budget.id} className="rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm">
                  <span className="rounded-full bg-[#f7f4ee] px-3.5 py-1 text-xs font-semibold text-[#b36b3c]">
                    {budget.year} Fiscal Year
                  </span>
                  <h2 className="mt-4 text-2xl font-semibold">{budget.year} Annual Budget</h2>

                  <div className="mt-6 grid grid-cols-2 gap-4 border-t border-[#dfdbd1] pt-6">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-[#617068]">Projected Income</p>
                      <p className="mt-1 text-xl font-semibold text-[#26352f]">{money(budget.total_income)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-[#617068]">Planned Expenses</p>
                      <p className="mt-1 text-xl font-semibold text-[#26352f]">{money(budget.total_expenses)}</p>
                    </div>
                  </div>

                  {budget.notes && (
                    <div className="mt-5 border-t border-[#dfdbd1] pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#617068]">Notes & Project Breakdown</p>
                      <p className="mt-2 text-sm leading-6 text-[#617068]">{budget.notes}</p>
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
