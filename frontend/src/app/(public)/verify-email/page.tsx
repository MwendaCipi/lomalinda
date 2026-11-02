"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Stage = "checking" | "confirmed" | "unusable";

function VerifyEmailContent() {
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  // Arriving without a link is known before the first paint, so it is settled
  // here rather than by an effect that would only cause a second render.
  const hasLink = Boolean(uid && token);
  const [stage, setStage] = useState<Stage>(hasLink ? "checking" : "unusable");
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [reason, setReason] = useState(
    hasLink
      ? ""
      : "This page needs the link from the church's email. Open that link again, or ask for a new one below."
  );
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState("");
  const [resendError, setResendError] = useState("");
  const [resending, setResending] = useState(false);

  // The link is the whole request: opening the page tells the server the
  // address is the person's, so there is nothing else for them to type.
  useEffect(() => {
    if (!hasLink) return;
    let cancelled = false;
    fetch(`${API_URL}/api/members/auth/verify-email/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, token }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok) {
          setConfirmedEmail(data.email ?? "");
          setStage("confirmed");
          return;
        }
        setReason(data.detail || "This confirmation link is invalid or has expired.");
        setStage("unusable");
      })
      .catch(() => {
        if (cancelled) return;
        setReason("We could not reach the church server. Check your connection and open the link again.");
        setStage("unusable");
      });
    return () => {
      cancelled = true;
    };
  }, [hasLink, uid, token]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResending(true);
    setResendError("");
    setResent("");
    try {
      const response = await fetch(`${API_URL}/api/members/auth/resend-verification/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResendError(data.email || data.detail || "Enter the email address the church has for you.");
        return;
      }
      setResent(
        data.message ??
          "If that address belongs to an account still waiting to be confirmed, a new link is on its way."
      );
    } catch {
      setResendError("We could not reach the church server. Check your connection and try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-start justify-center bg-sand px-6 py-10 text-bark sm:items-center">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line sm:p-8">
        {stage === "checking" && <p className="text-sm text-moss">Confirming your email address…</p>}

        {stage === "confirmed" && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">Confirmed</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">You&apos;re all set</h1>
            <p className="mt-3 text-sm leading-6 text-moss">
              {confirmedEmail ? (
                <>
                  <span className="font-medium text-bark">{confirmedEmail}</span> is confirmed as your church account
                  address. Sign in with the username and password the office gave you.
                </>
              ) : (
                "Your email address is confirmed. Sign in with the username and password the office gave you."
              )}
            </p>
            <Link
              href="/login?created=1"
              className="mt-6 block w-full rounded-full bg-bark px-5 py-3 text-center font-medium text-white"
            >
              Go to sign in
            </Link>
          </>
        )}

        {stage === "unusable" && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">Email confirmation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Confirm your address</h1>
            <p className="mt-3 rounded-xl bg-sand p-4 text-sm leading-6 text-moss">{reason}</p>
            <form onSubmit={resend} noValidate className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Your email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setResendError("");
                  }}
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 outline-none focus:border-ember"
                />
              </label>
              {resendError && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                  {resendError}
                </p>
              )}
              {resent && <p className="rounded-xl bg-sand p-3 text-sm text-moss">{resent}</p>}
              <button
                type="submit"
                disabled={resending}
                className="w-full rounded-full bg-bark px-5 py-3 font-medium text-white disabled:opacity-60"
              >
                {resending ? "Sending…" : "Send me a new link"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 border-t border-sand-line pt-5 text-center text-xs leading-5 text-moss sm:text-sm">
          Already confirmed?{" "}
          <Link href="/login" className="font-semibold text-ember hover:underline">
            Sign in
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[calc(100vh-73px)] bg-sand px-6 py-16 text-center text-moss">
          Confirming your email address…
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
