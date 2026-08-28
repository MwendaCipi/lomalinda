"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const financeRoles = ["finance", "treasurer", "admin", "leader"];
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
const money = (amount: string | number) => `KES ${Number(amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Reconciliation = {
  digital_amount_confirmed: string; cash_amount_counted: string; notes: string; reconciled_by_name: string; reconciled_at: string;
};
type Summary = {
  date: string; digital_recorded: string; cash_recorded: string; total_recorded: string;
  digital_contribution_count: number; cash_contribution_count: number;
  digital_variance?: string; cash_variance?: string; total_confirmed?: string; total_variance?: string;
  reconciliation: Reconciliation | null;
};
type CashReceipt = { id: number; received_on: string; amount: string; purpose: string; donor_name: string; receipt_number: string; notes: string; received_by_name: string; created_at: string };

function varianceClass(value?: string) {
  return Number(value || 0) === 0 ? "text-[#3d7146]" : "text-[#b44436]";
}

export default function ReconciliationPage() {
  const [date, setDate] = useState(localDate);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashReceipts, setCashReceipts] = useState<CashReceipt[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "denied">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [cashForm, setCashForm] = useState({ amount: "", purpose: "General giving", donor_name: "", receipt_number: "", notes: "" });
  const [confirmation, setConfirmation] = useState({ digital_amount_confirmed: "", cash_amount_counted: "", notes: "" });

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` });
  async function load(selectedDate = date) {
    setMessage("");
    const profile = await fetch(`${API_URL}/api/members/me/`, { headers: headers() }).then((res) => res.ok ? res.json() : null);
    if (!profile || !financeRoles.includes(profile.role)) { setStatus("denied"); return; }
    const [summaryRes, cashRes] = await Promise.all([
      fetch(`${API_URL}/api/members/treasury/reconciliation/?date=${selectedDate}`, { headers: headers() }),
      fetch(`${API_URL}/api/members/treasury/cash-contributions/?date=${selectedDate}`, { headers: headers() }),
    ]);
    if (!summaryRes.ok || !cashRes.ok) { setMessage("Could not load reconciliation data. Please try again."); setStatus("ready"); return; }
    const loadedSummary = await summaryRes.json() as Summary;
    setSummary(loadedSummary);
    setCashReceipts(await cashRes.json());
    setConfirmation(loadedSummary.reconciliation ? {
      digital_amount_confirmed: loadedSummary.reconciliation.digital_amount_confirmed,
      cash_amount_counted: loadedSummary.reconciliation.cash_amount_counted,
      notes: loadedSummary.reconciliation.notes,
    } : { digital_amount_confirmed: "", cash_amount_counted: "", notes: "" });
    setStatus("ready");
  }

  useEffect(() => { load(); }, []); // Initial authorisation and data load.

  async function changeDate(nextDate: string) { setDate(nextDate); setStatus("loading"); await load(nextDate); }
  async function addCash(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch(`${API_URL}/api/members/treasury/cash-contributions/`, { method: "POST", headers: headers(), body: JSON.stringify({ ...cashForm, received_on: date }) });
    setSaving(false);
    if (!response.ok) { const body = await response.json().catch(() => ({})); setMessage(body.amount?.[0] || "Could not save the cash receipt."); return; }
    setCashForm({ amount: "", purpose: "General giving", donor_name: "", receipt_number: "", notes: "" });
    setMessage("Cash receipt recorded."); await load(date);
  }
  async function saveReconciliation(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch(`${API_URL}/api/members/treasury/reconciliation/?date=${date}`, { method: "PUT", headers: headers(), body: JSON.stringify(confirmation) });
    setSaving(false);
    if (!response.ok) { setMessage("Could not save the reconciliation."); return; }
    setMessage("Reconciliation saved."); await load(date);
  }

  if (status === "loading") return <main className="min-h-screen bg-[#f7f4ee] p-10 text-center text-[#617068]">Loading reconciliation workspace…</main>;
  if (status === "denied") return <main className="min-h-screen bg-[#f7f4ee] p-10"><div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold text-[#26352f]">Finance access required</h1><p className="mt-3 text-[#617068]">This workspace is available to treasurers, finance managers, church leaders, and administrators.</p><Link href="/administration" className="mt-6 inline-block font-semibold text-[#b36b3c]">Back to administration</Link></div></main>;

  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16"><div className="mx-auto max-w-6xl">
    <Link href="/administration" className="text-sm font-semibold text-[#b36b3c]">← Back to administration</Link>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Treasury workspace</p><h1 className="mt-2 text-3xl font-semibold">Contribution reconciliation</h1><p className="mt-2 text-[#617068]">Compare the verified digital ledger and cash receipts with the amounts independently confirmed for the day.</p></div><label className="text-sm font-medium">Reconciliation date<input type="date" value={date} onChange={(event) => changeDate(event.target.value)} className="mt-1 block rounded-xl border border-[#c9c5bb] bg-white px-3 py-2" /></label></div>
    {message && <p className="mt-5 rounded-xl bg-white px-4 py-3 text-sm text-[#617068] shadow-sm">{message}</p>}
    <section className="mt-8 grid gap-4 md:grid-cols-3"><article className="rounded-2xl bg-[#26352f] p-6 text-white"><p className="text-sm text-white/70">Digital recorded</p><p className="mt-2 text-2xl font-bold">{money(summary?.digital_recorded || 0)}</p><p className="mt-1 text-xs text-white/70">{summary?.digital_contribution_count || 0} completed M-Pesa/card gifts</p></article><article className="rounded-2xl bg-white p-6 shadow-sm"><p className="text-sm text-[#617068]">Cash recorded</p><p className="mt-2 text-2xl font-bold">{money(summary?.cash_recorded || 0)}</p><p className="mt-1 text-xs text-[#617068]">{summary?.cash_contribution_count || 0} cash receipts</p></article><article className="rounded-2xl bg-[#5f8067] p-6 text-white"><p className="text-sm text-white/70">Total recorded</p><p className="mt-2 text-2xl font-bold">{money(summary?.total_recorded || 0)}</p><p className="mt-1 text-xs text-white/70">Digital plus cash</p></article></section>
    <div className="mt-8 grid gap-8 lg:grid-cols-2"><section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]"><h2 className="text-xl font-semibold">Record a cash receipt</h2><p className="mt-1 text-sm text-[#617068]">Enter each counted envelope or cash receipt before reconciling.</p><form onSubmit={addCash} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Amount (KES)<input required min="0.01" step="0.01" type="number" value={cashForm.amount} onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })} className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><label className="text-sm font-medium">Purpose<input required value={cashForm.purpose} onChange={(e) => setCashForm({ ...cashForm, purpose: e.target.value })} className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><label className="text-sm font-medium">Donor (optional)<input value={cashForm.donor_name} onChange={(e) => setCashForm({ ...cashForm, donor_name: e.target.value })} className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><label className="text-sm font-medium">Receipt / envelope no.<input value={cashForm.receipt_number} onChange={(e) => setCashForm({ ...cashForm, receipt_number: e.target.value })} className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><label className="text-sm font-medium sm:col-span-2">Note (optional)<input value={cashForm.notes} onChange={(e) => setCashForm({ ...cashForm, notes: e.target.value })} className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><button disabled={saving} className="w-fit rounded-full bg-[#b36b3c] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Add cash receipt</button></form></section>
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]"><h2 className="text-xl font-semibold">Confirm and reconcile</h2><p className="mt-1 text-sm text-[#617068]">Enter the totals checked against the mobile-money/card statement and the physical cash count.</p><form onSubmit={saveReconciliation} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Digital confirmed (KES)<input required min="0" step="0.01" type="number" value={confirmation.digital_amount_confirmed} onChange={(e) => setConfirmation({ ...confirmation, digital_amount_confirmed: e.target.value })} className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><label className="text-sm font-medium">Cash counted (KES)<input required min="0" step="0.01" type="number" value={confirmation.cash_amount_counted} onChange={(e) => setConfirmation({ ...confirmation, cash_amount_counted: e.target.value })} className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><label className="text-sm font-medium sm:col-span-2">Reconciliation notes<textarea value={confirmation.notes} onChange={(e) => setConfirmation({ ...confirmation, notes: e.target.value })} className="mt-1 block min-h-20 w-full rounded-xl border border-[#c9c5bb] px-3 py-2" /></label><button disabled={saving} className="w-fit rounded-full bg-[#5f8067] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Save reconciliation</button></form>{summary?.reconciliation && <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-[#f7f4ee] p-4 text-sm"><p>Digital variance<br /><strong className={varianceClass(summary.digital_variance)}>{money(summary.digital_variance || 0)}</strong></p><p>Cash variance<br /><strong className={varianceClass(summary.cash_variance)}>{money(summary.cash_variance || 0)}</strong></p><p>Total variance<br /><strong className={varianceClass(summary.total_variance)}>{money(summary.total_variance || 0)}</strong></p></div>}</section></div>
    <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1]"><h2 className="text-xl font-semibold">Cash receipt ledger</h2>{cashReceipts.length === 0 ? <p className="mt-4 text-sm text-[#617068]">No cash receipts have been recorded for this date.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-170 text-left text-sm"><thead className="border-b text-[#617068]"><tr><th className="pb-3">Purpose</th><th className="pb-3">Donor</th><th className="pb-3">Receipt</th><th className="pb-3">Entered by</th><th className="pb-3 text-right">Amount</th></tr></thead><tbody>{cashReceipts.map((receipt) => <tr key={receipt.id} className="border-b border-[#eeeae2]"><td className="py-3 font-medium">{receipt.purpose}</td><td className="py-3">{receipt.donor_name || "Anonymous"}</td><td className="py-3">{receipt.receipt_number || "—"}</td><td className="py-3">{receipt.received_by_name || "—"}</td><td className="py-3 text-right font-semibold">{money(receipt.amount)}</td></tr>)}</tbody></table></div>}</section>
  </div></main>;
}
