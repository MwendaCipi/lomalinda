"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/members/auth/password-reset/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      const msg = data.message ?? "If an account exists, a reset link has been sent.";
      setMessage(msg);
      showAlert(response.ok ? "Reset link sent" : "Password Reset", msg, response.ok ? "success" : "info");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to request password reset.";
      setMessage(errorMsg);
      showAlert("Error", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-sand px-6 pt-16 text-bark">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-sand-line sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Reset your password</h1>
        <p className="mt-3 text-sm leading-6 text-moss">Enter your account email and we&apos;ll send a password reset link.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">
            Email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3" />
          </label>
          <button disabled={loading} className="w-full rounded-full bg-bark px-5 py-3.5 font-medium text-white disabled:opacity-60">
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
        {message && <p className="mt-5 rounded-xl bg-sand p-4 text-sm text-moss">{message}</p>}
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-ember">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
