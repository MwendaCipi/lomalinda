"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordRules } from "@/components/password-rules";
import { passwordProblems } from "@/lib/validation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/dashboard");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next?.startsWith("/")) setNextPath(next);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const problems = passwordProblems(password);
    if (problems.length > 0) {
      setError(problems.join(" "));
      return;
    }
    if (password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch(`${API_URL}/api/members/auth/change-password/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm_password: confirmPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(Object.values(data).flat().join(" ") || "Unable to change your password.");
        return;
      }
      router.replace(nextPath);
    } catch {
      setError("We could not reach the church server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-[#f7f4ee] px-6 py-10 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">First sign-in</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Change your password</h1>
        <p className="mt-3 text-sm leading-6 text-[#617068]">
          Your account was created with an initial password. Choose a private password before continuing.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
          <label className="block text-sm font-medium">
            New password
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]" />
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
            <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]" />
          </label>
          <PasswordRules password={password} />
          <button type="submit" disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3 font-medium text-white disabled:opacity-60">
            {loading ? "Saving…" : "Save new password"}
          </button>
        </form>
      </section>
    </main>
  );
}
