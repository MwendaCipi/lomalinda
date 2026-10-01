"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MemberWorkspace } from "@/components/member-workspace";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
type Report = { id: number; title: string; period_start: string; period_end: string; trust_fund: string; local_church_offerings: string; expenditure: string; total: string; notes: string };

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
    <MemberWorkspace>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Church financial reports</h1>
        <p className="mt-2 max-w-2xl text-moss">
          Published reports help our church family stay informed about giving and stewardship.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {reports.map((report) => (
          <article key={report.id} className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-sand-line">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ember">
              {report.period_start} – {report.period_end}
            </p>
            <h2 className="mt-3 text-2xl font-semibold">{report.title}</h2>
            {/* The statement in the field's own language: trust fund and
                local offerings in, expenditure out, and the total in hand —
                computed by the server, never typed twice. */}
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-moss">Trust Fund</dt>
                <dd className="mt-1 font-semibold">KES {Number(report.trust_fund).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-moss">Local Church Offerings</dt>
                <dd className="mt-1 font-semibold">KES {Number(report.local_church_offerings).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-moss">Expenditure</dt>
                <dd className="mt-1 font-semibold">KES {Number(report.expenditure).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="font-bold text-ember">Total in hand</dt>
                <dd className="mt-1 font-bold">KES {Number(report.total).toLocaleString()}</dd>
              </div>
            </dl>
            {report.notes && <p className="mt-6 border-t border-sand-line pt-5 text-sm leading-6 text-moss">{report.notes}</p>}
          </article>
        ))}
      </div>

      {message && (
        <div className="rounded-2xl bg-white p-6 text-moss shadow-sm ring-1 ring-sand-line">
          {message} {message.includes("Sign in") && <Link href="/login" className="font-semibold text-ember">Sign in &rarr;</Link>}
        </div>
      )}
    </MemberWorkspace>
  );
}
