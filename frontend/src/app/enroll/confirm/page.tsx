"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function EnrollmentConfirmContent() {
  const params = useSearchParams(); const token = params.get("token") ?? ""; const [email, setEmail] = useState(""); const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { fetch(`${API_URL}/api/members/auth/enrollment/verify/?token=${encodeURIComponent(token)}`).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.detail); setEmail(data.email); }).catch((error) => setMessage(error.message)).finally(() => setLoading(false)); }, [token]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); try { const response = await fetch(`${API_URL}/api/members/auth/enrollment/complete/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, username, password }) }); const data = await response.json(); if (!response.ok) throw new Error(Object.values(data).flat().join(" ")); setMessage(data.message); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create your account."); } finally { setLoading(false); } }
  return <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 text-[#26352f]"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10"><h1 className="text-3xl font-semibold">Set up your member account</h1>{email && <p className="mt-3 text-sm text-[#617068]">Account email: {email}</p>}{!message && <form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-medium">Username<input required value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" /></label><label className="block text-sm font-medium">Password<input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" /></label><button disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60">{loading ? "Saving..." : "Create account"}</button></form>}{message && <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}{message && <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#b36b3c]">Go to sign in</Link>}</section></main>;
}

export default function EnrollmentConfirmPage() { return <Suspense fallback={<main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">Loading enrollment...</main>}><EnrollmentConfirmContent /></Suspense>; }
