"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { showAlert } from "@/lib/alerts";
import { destinationAfterSignIn, storeSession } from "@/lib/auth";
import { GOOGLE_SIGN_IN_ENABLED, type GoogleCredentialResponse } from "@/lib/google-identity";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

function LoginContent() {
  const router = useRouter();
  // Read ?next= after mount: useSearchParams would force this page to prerender as
  // an empty loading shell, so the sign-in form would not be in the served HTML.
  const [nextParam, setNextParam] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setNextParam(query.get("next"));
    setJustCreated(query.get("created") === "1");
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
      router.push(destinationAfterSignIn(data, nextParam));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to connect to the server.";
      setMessage(errorMsg);
      showAlert("Sign-in Failed", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Google hands the browser a signed ID token; the API verifies it before
   * believing anything in it and answers with the same JWT pair the password
   * form returns, so the member's next steps are shared between the two doors.
   */
  async function handleGoogleCredential(credential: GoogleCredentialResponse) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${API_URL}/api/auth/google/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credential.credential }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to sign in with Google.");
      storeSession(data);
      setMessage("You are signed in.");
      router.push(destinationAfterSignIn(data, nextParam));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to connect to the server.";
      setMessage(errorMsg);
      showAlert("Google sign-in failed", errorMsg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-73px)] items-start justify-center bg-[#f7f4ee] px-6 pt-6 text-[#26352f] sm:items-center sm:py-8">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back</h1>
        <p className="mt-2 text-sm text-[#617068]">Sign in to your SDA Loma Linda account.</p>
        {justCreated && (
          <p className="mt-4 rounded-xl bg-[#eef2ed] p-3 text-xs text-[#3d5148] sm:text-sm">
            Your account is ready. Sign in with the username and password you just chose.
          </p>
        )}
        {GOOGLE_SIGN_IN_ENABLED && (
          <div className="mt-6">
            <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />
            <div className="mt-4 flex items-center gap-3 text-xs uppercase tracking-wide text-[#8a9086]">
              <span className="h-px flex-1 bg-[#dfdbd1]" aria-hidden="true" />
              or
              <span className="h-px flex-1 bg-[#dfdbd1]" aria-hidden="true" />
            </div>
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Username
            <input
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button disabled={loading} className="w-full rounded-full bg-[#26352f] px-5 py-3 font-medium text-white disabled:opacity-60">
            {loading ? "Please wait..." : "Sign in"}
          </button>
          <div className="text-center pt-1">
            <Link href="/forgot-password" className="text-xs font-semibold text-[#b36b3c] hover:underline sm:text-sm">
              Forgot password?
            </Link>
          </div>
        </form>
        {message && <p className="mt-4 rounded-xl bg-[#f7f4ee] p-3 text-xs text-[#617068] sm:text-sm">{message}</p>}
        <p className="mt-6 border-t border-[#dfdbd1] pt-5 text-center text-xs leading-5 text-[#617068] sm:text-sm">
          Need an account? <Link href="/create-account" className="font-semibold text-[#b36b3c] hover:underline">Create one as a member or Friend of SDA Loma Linda</Link>.
        </p>
      </section>
    </main>
  );
}

export default LoginContent;
