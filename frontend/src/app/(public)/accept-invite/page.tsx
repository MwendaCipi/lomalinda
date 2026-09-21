"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [rolesDisplay, setRolesDisplay] = useState("");
  const [accountTypeDisplay, setAccountTypeDisplay] = useState("");
  const [churchName, setChurchName] = useState("Loma Linda SDA Church");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setMessage("This invitation link is not valid. Please ask the church office for a new invitation.");
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/members/auth/invitation/verify/?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "This invitation link is not valid.");
        setEmail(data.email ?? "");
        setFirstName(data.first_name ?? "");
        setRolesDisplay(data.roles_display ?? "");
        setAccountTypeDisplay(data.account_type_display ?? "");
        if (data.church_name) setChurchName(data.church_name);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "This invitation link is not valid."))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setMessage("The two passwords do not match.");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/members/auth/invitation/accept/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username, password, confirm_password: confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to create your account.");
      showAlert("Account ready", data.message, "success");
      router.push("/login?created=1");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to create your account.";
      setMessage(text);
      showAlert("Account error", text, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-start justify-center bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:items-center">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Invitation</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {firstName ? `${firstName}, create your account` : "Create your account"}
        </h1>
        {!message && (
          <p className="mt-2 text-sm text-[#617068]">
            {churchName}
            {accountTypeDisplay ? ` has invited you to join as a ${accountTypeDisplay}` : " has invited you to join"}
            {rolesDisplay ? ` with access as ${rolesDisplay}` : ""}. Choose your own username and password below.
          </p>
        )}
        {email && !message && <p className="mt-2 text-xs text-[#617068]">Invitation email: {email}</p>}

        {loading && !message && <p className="mt-6 text-sm text-[#617068]">Checking your invitation…</p>}

        {!loading && !message && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Username
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
              />
            </label>
            <label className="block text-sm font-medium">
              Confirm password
              <input
                type="password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
              />
            </label>
            <p className="text-xs text-[#617068]">Use at least 8 characters, and avoid a password that is easy to guess.</p>
            <button
              disabled={submitting}
              className="w-full rounded-full bg-[#26352f] px-5 py-3 font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Creating your account…" : "Create account"}
            </button>
          </form>
        )}

        {message && <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>}
        {(message || !loading) && (
          <p className="mt-6 border-t border-[#dfdbd1] pt-5 text-center text-xs text-[#617068] sm:text-sm">
            Already set up? <Link href="/login" className="font-semibold text-[#b36b3c] hover:underline">Sign in</Link>.
          </p>
        )}
      </section>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[calc(100vh-73px)] bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
          Checking your invitation…
        </main>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
