"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Budget = { id: number; year: number; total_income: string; total_expenses: string; notes: string };

const money = (value: string) => `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

export default function ChurchBudgetPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/members/budgets/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBudgets(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Financial Stewardship</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Church Budget</h1>
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
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#617068]">Notes &amp; Project Breakdown</p>
                        <p className="mt-2 text-sm leading-6 text-[#617068]">{budget.notes}</p>
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
