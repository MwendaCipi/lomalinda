"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const endpoint = mode === "login" ? "/api/auth/token/" : "/api/members/register/";
    const body = mode === "login" ? { username, password } : { username, email, password };
    try {
      const response = await fetch(`${API_URL}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Something went wrong.");
      if (mode === "login") localStorage.setItem("access_token", data.access);
      setMessage(mode === "login" ? "You are signed in." : "Account created. You can now sign in.");
      if (mode === "signup") setMode("login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-6 py-12 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
        <Link href="/" className="text-sm font-semibold text-[#b36b3c]">← Back to Loma Linda Church</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Join the church community"}</h1>
        <p className="mt-3 text-[#617068]">{mode === "login" ? "Sign in to your member account." : "Create an account to get started."}</p>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">Username<input className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          {mode === "signup" && <label className="block text-sm font-medium">Email<input type="email" className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
          <label className="block text-sm font-medium">Password<input type="password" minLength={8} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white transition hover:bg-[#3c5147] disabled:cursor-wait disabled:opacity-60">{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        {message && <p className="mt-5 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}
        <button className="mt-6 text-sm font-medium text-[#b36b3c]" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>{mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}</button>
      </section>
    </main>
  );
}
