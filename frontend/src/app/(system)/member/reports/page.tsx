"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MemberSidebar } from "@/components/sidebars/member-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Report = { id: number; title: string; period_start: string; period_end: string; total_tithes: string; total_offerings: string; total_expenses: string; notes: string };

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [token] = useState(() => typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  const [message, setMessage] = useState(token ? "Loading reports…" : "Sign in to view church financial reports.");

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/members/reports/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Your session may have expired.");
        return response.json();
      })
      .then((data) => {
        setReports(data);
        setMessage(data.length ? "" : "No published reports are available yet.");
      })
      .catch((error) => setMessage(error.message));
  }, [token]);

  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <MemberSidebar />
        <div className="flex-1 min-w-0 h-full p-4 sm:p-8 lg:p-10 overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Church financial reports</h1>
            <p className="mt-2 max-w-2xl text-[#617068]">
              Published reports help our church family stay informed about giving and stewardship.
            </p>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {reports.map((report) => (
              <article key={report.id} className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1]">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b36b3c]">
                  {report.period_start} – {report.period_end}
                </p>
                <h2 className="mt-3 text-2xl font-semibold">{report.title}</h2>
                <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-[#617068]">Tithes</dt>
                    <dd className="mt-1 font-semibold">KES {Number(report.total_tithes).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-[#617068]">Offerings</dt>
                    <dd className="mt-1 font-semibold">KES {Number(report.total_offerings).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-[#617068]">Expenses</dt>
                    <dd className="mt-1 font-semibold">KES {Number(report.total_expenses).toLocaleString()}</dd>
                  </div>
                </dl>
                {report.notes && <p className="mt-6 border-t border-[#dfdbd1] pt-5 text-sm leading-6 text-[#617068]">{report.notes}</p>}
              </article>
            ))}
          </div>

          {message && (
            <div className="mt-8 rounded-2xl bg-white p-6 text-[#617068] shadow-sm ring-1 ring-[#dfdbd1]">
              {message} {message.includes("Sign in") && <Link href="/login" className="font-semibold text-[#b36b3c]">Sign in &rarr;</Link>}
            </div>
          )}
          </div>
        </div>
      </div>
    </main>
  );
}
