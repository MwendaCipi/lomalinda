"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function PrayerPage() {
  const [requestText, setRequestText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`${API_URL}/api/members/prayer-requests/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_text: requestText, anonymous, name: anonymous ? "" : name, email: anonymous ? "" : email }) });
    if (!response.ok) { setMessage("We could not submit your request. Please try again."); return; }
    setRequestText("");
    setMessage("Your prayer request has been received. We will pray with you.");
  }

  return <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16"><div className="mx-auto max-w-4xl"><Link href="/" className="text-sm font-semibold text-[#b36b3c]">← Back to Loma Linda Church</Link><div className="mt-12 grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start"><div><p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Prayer box</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">You do not have to carry it alone.</h1><p className="mt-6 text-lg leading-8 text-[#617068]">Share a prayer request with our church family. You may submit anonymously, and no account is required.</p></div><form onSubmit={submitRequest} className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#dfdbd1] sm:p-9"><label className="block text-sm font-medium">Your prayer request<textarea required rows={7} value={requestText} onChange={(event) => setRequestText(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder="Share what is on your heart…" /></label><label className="mt-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} className="h-4 w-4 accent-[#b36b3c]" />Submit anonymously</label>{!anonymous && <div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label><label className="block text-sm font-medium">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label></div>}<button className="mt-7 w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e]">Send prayer request</button>{message && <p className="mt-5 rounded-xl bg-[#eef2ed] p-4 text-sm leading-6 text-[#3d5148]">{message}</p>}</form></div></div></main>;
}
