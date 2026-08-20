"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/members/auth/password-reset/confirm/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, token, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to reset password.");
      const successMsg = data.message || "Your password has been reset successfully.";
      setMessage(successMsg);
      await showAlert("Password Reset Successful", successMsg, "success");
      router.push("/login");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to reset your password.";
      setMessage(errorMsg);
      showAlert("Reset Error", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Choose a new password</h1>
        {!message && (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-sm font-medium">
              New password
              <input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3" />
            </label>
            <button disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60">
              {loading ? "Saving..." : "Reset password"}
            </button>
          </form>
        )}
        {message && <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#b36b3c]">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() { return <Suspense fallback={<main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">Loading password reset...</main>}><ResetPasswordContent /></Suspense>; }
