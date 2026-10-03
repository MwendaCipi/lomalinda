"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import {
  clearSession,
  destinationAfterSession,
  destinationAfterSignIn,
  storeSession,
} from "@/lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function LoginContent() {
  const router = useRouter();
  // Read ?next= after mount: useSearchParams would force this page to prerender as
  // an empty loading shell, so the sign-in form would not be in the served HTML.
  const [nextParam, setNextParam] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  /** Set only while a stored session is being carried into the app. */
  const [takingYouIn, setTakingYouIn] = useState(false);
  /** A stored session exists but the server could not be reached to check it. */
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const next = query.get("next");
    setNextParam(next);
    setJustCreated(query.get("created") === "1");

    // Already signed in? Then this page has nothing to offer — send them into
    // the app instead of asking for a password they already gave. The token is
    // checked against /me before moving: a stale one must not land the member
    // somewhere that would immediately send them back here.
    const token = localStorage.getItem("access_token");
    if (!token) return;
    let active = true;
    setTakingYouIn(true);
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      })
      .then((me) => {
        if (active) router.replace(destinationAfterSession(me, next));
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Expired or revoked: clear it so the sign-in form is usable.
        const status = error instanceof Error ? error.message : "";
        if (status === "401" || status === "403") {
          clearSession();
          setTakingYouIn(false);
          return;
        }
        // The server could not be reached — offline, or it is restarting. That
        // is not grounds to ask for a password the member already gave.
        setUnreachable(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to sign in.");
      storeSession(data);
      setMessage("You are signed in.");

      // Manually created accounts must replace the shared initial password before
      // entering the app; preserve the destination they originally requested.
      // Replace (not push): the signed-in session's history starts at the
      // destination, so back never replays the sign-in form or the page
      // that led to it.
      router.replace(destinationAfterSignIn(data, nextParam));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to connect to the server.";
      setMessage(errorMsg);
      showAlert("Sign-in Failed", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  // A signed-in visit is on its way to the app, so the form is not shown — no
  // second sign-in prompt, and no half-drawn page while /me answers.
  if (unreachable) {
    return (
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-sand px-6 py-8 text-bark">
        <section className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-sand-line sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">You&apos;re offline</h1>
          <p className="mt-2 text-sm leading-6 text-moss">
            You are still signed in on this device — we just could not reach the church&apos;s server to confirm it. Try again
            once the connection is back.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-bark px-4 py-2 text-xs font-semibold text-white transition hover:bg-bark-900"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (takingYouIn) {
    return (
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-sand px-6 py-8 text-moss">
        <p className="text-sm">Taking you in…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-center justify-center bg-sand px-6 py-8 text-bark">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back</h1>
        <p className="mt-2 text-sm text-moss">Sign in to your SDA Loma Linda account.</p>
        {justCreated && (
          <p className="mt-4 rounded-xl bg-mist-select p-3 text-xs text-moss-dark sm:text-sm">
            Your account is ready. Sign in with the username and password you just chose.
          </p>
        )}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Username
            <input
              className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 outline-none focus:border-ember"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 outline-none focus:border-ember"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button disabled={loading} className="w-full rounded-full bg-bark px-5 py-3 font-medium text-white disabled:opacity-60">
            {loading ? "Please wait..." : "Sign in"}
          </button>
          <div className="text-center pt-1">
            <Link href="/forgot-password" className="text-xs font-semibold text-ember hover:underline sm:text-sm">
              Forgot password?
            </Link>
          </div>
        </form>
        {message && <p className="mt-4 rounded-xl bg-sand p-3 text-xs text-moss sm:text-sm">{message}</p>}
        <p className="mt-6 border-t border-sand-line pt-5 text-center text-xs leading-5 text-moss sm:text-sm">
          Need an account? <Link href="/create-account" className="font-semibold text-ember hover:underline">Create one here</Link>.
        </p>
      </section>
    </main>
  );
}

export default LoginContent;
