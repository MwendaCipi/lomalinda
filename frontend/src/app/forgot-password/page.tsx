"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); try { const response = await fetch(`${API_URL}/api/members/auth/password-reset/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }); const data = await response.json(); setMessage(data.message ?? "If an account exists, a reset link has been sent."); } finally { setLoading(false); } }
  return <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 text-[#26352f]"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10"><h1 className="text-3xl font-semibold">Reset your password</h1><p className="mt-3 text-sm leading-6 text-[#617068]">Enter your account email and we&apos;ll send a password reset link.</p><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-medium">Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" /></label><button disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60">{loading ? "Sending..." : "Send reset link"}</button></form>{message && <p className="mt-5 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}<Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#b36b3c]">Back to sign in</Link></section></main>;
}
