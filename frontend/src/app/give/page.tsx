"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function GivePage() {
  const [givingType, setGivingType] = useState<"financial" | "in_kind">("financial");
  const [amount, setAmount] = useState("1000");
  const [purpose, setPurpose] = useState("General giving");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitGiving(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const response = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ giving_type: givingType, amount: givingType === "financial" ? amount : "0", purpose, phone_number: phoneNumber, item_description: itemDescription, donor_name: donorName, donor_email: donorEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "We could not start the giving request.");
      setMessage(data.message ?? "Thank you for your gift.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect to the giving service.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16"><div className="mx-auto max-w-5xl"><Link href="/" className="text-sm font-semibold text-[#b36b3c]">← Back to Loma Linda Church</Link><div className="mt-12 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Give with purpose</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Tithes, offerings and more</h1><p className="mt-6 max-w-md text-lg leading-8 text-[#617068]">Support worship, ministry, prayer, and care for our church family through financial or practical gifts.</p><p className="mt-6 text-sm leading-6 text-[#617068]">You can give without an account. Sign in first if you would like this contribution connected to your member history.</p><Link href="/login" className="mt-6 inline-block text-sm font-semibold text-[#b36b3c]">Sign in to track your giving →</Link></div><form onSubmit={submitGiving} className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-9"><h2 className="text-2xl font-semibold">How would you like to give?</h2><div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setGivingType("financial")} className={`rounded-2xl border p-4 text-left transition ${givingType === "financial" ? "border-[#b36b3c] bg-[#f7f4ee]" : "border-[#dfdbd1]"}`}><span className="font-semibold">Financial gift</span><span className="mt-1 block text-sm text-[#617068]">Tithes and offerings through M-Pesa.</span></button><button type="button" onClick={() => setGivingType("in_kind")} className={`rounded-2xl border p-4 text-left transition ${givingType === "in_kind" ? "border-[#b36b3c] bg-[#f7f4ee]" : "border-[#dfdbd1]"}`}><span className="font-semibold">Practical gift</span><span className="mt-1 block text-sm text-[#617068]">Bibles, clothes, food, and other items.</span></button></div>{givingType === "financial" ? <div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Amount (KES)<input type="number" min="1" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label><label className="block text-sm font-medium">Giving purpose<select value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]"><option>General giving</option><option>Tithe</option><option>Church development</option><option>Community support</option><option>Missions</option></select></label></div> : <label className="mt-6 block text-sm font-medium">What would you like to give?<textarea required rows={4} value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} placeholder="For example: 10 Bibles and 20 bags of maize flour" className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label>}<label className="mt-5 block text-sm font-medium">Phone number<input required placeholder="07XX XXX XXX" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Your name <span className="font-normal text-[#617068]">(optional)</span><input value={donorName} onChange={(event) => setDonorName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label><label className="block text-sm font-medium">Email <span className="font-normal text-[#617068]">(optional)</span><input type="email" value={donorEmail} onChange={(event) => setDonorEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label></div><button disabled={loading} className="mt-7 w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:cursor-wait disabled:opacity-60">{loading ? "Submitting…" : givingType === "financial" ? "Continue with M-Pesa" : "Submit practical gift"}</button>{message && <p className="mt-5 rounded-xl bg-[#eef2ed] p-4 text-sm leading-6 text-[#3d5148]">{message}</p>}</form></div></div></main>;
}
