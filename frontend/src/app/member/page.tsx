"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
type Contribution = { id: string; amount: string; currency: string; purpose: string; status: string; created_at: string };

export default function MemberPage() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [token] = useState(() => typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  const [message, setMessage] = useState(token ? "Loading your giving history..." : "Sign in to view your giving history.");
  useEffect(() => { if (!token) return; fetch(`${API_URL}/api/members/contributions/`, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => { if (!response.ok) throw new Error("Your session may have expired."); return response.json(); }).then((data) => { setContributions(data); setMessage(data.length ? "" : "No contributions have been recorded yet."); }).catch((error) => setMessage(error.message)); }, [token]);
  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between gap-5"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Member space</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Your giving history</h1></div><Link href="/give" className="rounded-full bg-[#b36b3c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#96552e]">Give now</Link></div><div className="mt-6 flex flex-wrap gap-5"><Link href="/member/reports" className="text-sm font-semibold text-[#b36b3c]">View church financial reports &rarr;</Link><Link href="/community/welfare" className="text-sm font-semibold text-[#b36b3c]">Church welfare &rarr;</Link><Link href="/announcements" className="text-sm font-semibold text-[#b36b3c]">Member announcements &rarr;</Link></div><div className="mt-10 space-y-4">{contributions.map((item) => <article key={item.id} className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.purpose}</p><p className="mt-1 text-sm text-[#617068]">{new Date(item.created_at).toLocaleDateString()}</p></div><div className="sm:text-right"><p className="text-xl font-semibold">{item.currency} {Number(item.amount).toLocaleString()}</p><p className="mt-1 text-sm capitalize text-[#617068]">{item.status}</p></div></article>)}{message && <div className="rounded-2xl bg-white p-6 text-[#617068] shadow-sm ring-1 ring-[#dfdbd1]">{message} {message.includes("Sign in") && <Link href="/login" className="font-semibold text-[#b36b3c]">Sign in &rarr;</Link>}</div>}</div></div></main>;
}
