"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldErrors, parseApiErrors } from "@/lib/form-errors";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const inputClass = "mt-2 w-full rounded-xl border px-4 py-3 outline-none focus:border-[#b36b3c] border-[#c9c5bb]";

function fieldClass(hasError: boolean) {
  return hasError ? `${inputClass} border-red-400 bg-red-50/40` : inputClass;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1.5 block text-xs font-medium text-red-700">{message}</span>;
}

function EnrollmentConfirmContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const formRef = useRef<HTMLFormElement>(null);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  /** Fatal: the verification link itself is unusable. */
  const [linkError, setLinkError] = useState("");
  /** Recoverable: shown inline, form stays open. */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  /** Success: the account now exists, so the form is replaced. */
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState("member");

  useEffect(() => {
    if (!token) {
      setLinkError("This verification link is not valid. Please start again so we can email you a new one.");
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/api/members/auth/enrollment/verify/?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "This verification link is invalid or has expired.");
        setEmail(data.email);
        setAccountType(data.joining_mode === "friend" ? "friend" : "member");
      })
      .catch((error) =>
        setLinkError(
          error instanceof Error && error.message
            ? error.message
            : "This verification link is invalid or has expired."
        )
      )
      .finally(() => setLoading(false));
  }, [token]);

  function focusFirstError(errors: FieldErrors) {
    requestAnimationFrame(() => {
      const name = Object.keys(errors)[0];
      if (!name) return;
      const input = formRef.current?.querySelector<HTMLInputElement>(`[name="${name}"]`);
      input?.focus();
      input?.select?.();
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUsername = username.trim();
    const nextErrors: FieldErrors = {};

    if (!cleanUsername) nextErrors.username = "Choose a username you will sign in with.";
    else if (/\s/.test(cleanUsername)) nextErrors.username = "Usernames cannot contain spaces.";
    if (!password) nextErrors.password = "Choose a password.";
    else if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
    if (password && password !== confirmPassword) {
      nextErrors.confirmPassword = "The two passwords do not match. Please retype the confirmation.";
    }
    if (!privacyAccepted) nextErrors.privacy = "Please accept the privacy policy to continue.";

    setGeneralError("");
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/members/auth/enrollment/complete/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username: cleanUsername, password, privacy_accepted: privacyAccepted }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const { fieldErrors: apiFieldErrors, generalError: apiGeneralError } = parseApiErrors(data, [
          "username",
          "password",
          "confirmPassword",
        ]);
        const fallback =
          Object.keys(apiFieldErrors).length === 0 && !apiGeneralError
            ? "We could not create your account just now. Please try again."
            : "";
        setFieldErrors(apiFieldErrors);
        setGeneralError(apiGeneralError || fallback);
        focusFirstError(apiFieldErrors);
        return;
      }
      const text = String(data.message || "Your account is ready. You can now sign in.");
      if (text.toLowerCase().includes("review")) {
        setSuccessMessage(text);
      } else {
        router.push("/login?created=1");
      }
    } catch {
      setGeneralError("We could not reach the church server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Set up your {accountType === "friend" ? "friend" : "church"} account
        </h1>
        {email && !linkError && <p className="mt-3 text-sm text-[#617068]">Account email: {email}</p>}

        {!successMessage && !linkError && (
          <form ref={formRef} onSubmit={submit} noValidate className="mt-8 space-y-5">
            {generalError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"
              >
                {generalError}
              </p>
            )}

            <label className="block text-sm font-medium">
              Username
              <input
                name="username"
                required
                autoComplete="username"
                value={username}
                aria-invalid={Boolean(fieldErrors.username)}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setFieldErrors((current) => ({ ...current, username: "" }));
                }}
                className={fieldClass(Boolean(fieldErrors.username))}
              />
              <FieldError message={fieldErrors.username} />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                value={password}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: "", confirmPassword: "" }));
                }}
                className={fieldClass(Boolean(fieldErrors.password))}
              />
              <FieldError message={fieldErrors.password} />
            </label>
            <label className="block text-sm font-medium">
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                value={confirmPassword}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, confirmPassword: "" }));
                }}
                className={fieldClass(Boolean(fieldErrors.confirmPassword))}
              />
              <FieldError message={fieldErrors.confirmPassword} />
            </label>
            <label className="flex items-start gap-3 text-xs leading-5 text-[#617068]">
              <input
                type="checkbox"
                checked={privacyAccepted}
                aria-invalid={Boolean(fieldErrors.privacy)}
                onChange={(event) => {
                  setPrivacyAccepted(event.target.checked);
                  setFieldErrors((current) => ({ ...current, privacy: "" }));
                }}
                className="mt-1 h-4 w-4 accent-[#5f8067]"
              />
              <span>
                I agree to the{" "}
                <Link href="/privacy" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            <FieldError message={fieldErrors.privacy} />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60"
            >
              {loading ? "Saving..." : "Create account"}
            </button>
          </form>
        )}

        {successMessage && (
          <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{successMessage}</p>
        )}
        {linkError && <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{linkError}</p>}

        {(successMessage || linkError) && (
          <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#b36b3c]">
            Go to sign in
          </Link>
        )}
        {linkError && (
          <Link href="/create-account" className="mt-3 block text-center text-sm font-semibold text-[#b36b3c]">
            Start a new sign-up
          </Link>
        )}
      </section>
    </main>
  );
}

export default function EnrollmentConfirmPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">Loading enrollment...</main>
      }
    >
      <EnrollmentConfirmContent />
    </Suspense>
  );
}
