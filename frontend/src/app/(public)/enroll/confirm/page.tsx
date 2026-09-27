"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordRules } from "@/components/password-rules";
import { FieldErrors, parseApiErrors } from "@/lib/form-errors";
import { passwordProblems } from "@/lib/validation";

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
  /** The emailed verification code: pre-filled from /create-account, typed here otherwise. */
  const initialCode = (params.get("code") ?? "").trim();

  const [code, setCode] = useState(initialCode);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(initialCode));

  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  /** Fatal: no usable code, so there is nothing to retry on this page. */
  const [codeError, setCodeError] = useState("");
  /** Recoverable: shown inline, form stays open. */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  /** Success: the account now exists, so the form is replaced. */
  const [successMessage, setSuccessMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  /** True when the person never agreed through create-account (e.g. an office-created enrollment). */
  const [needsConsent, setNeedsConsent] = useState(true);

  useEffect(() => {
    if (!initialCode) {
      setVerifying(false);
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/api/members/auth/enrollment/verify/?code=${encodeURIComponent(initialCode)}`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "This verification code is invalid or has expired.");
        if (cancelled) return;
        setEmail(data.email);
        setVerified(true);
        setNeedsConsent(false);
      })
      .catch((error) => {
        if (!cancelled) setCodeError(error instanceof Error ? error.message : "This verification code is invalid or has expired.");
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialCode]);

  /** The typed path to the same verification, for a code entered on this page directly. */
  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setCodeError("Enter the verification code from your email.");
      return;
    }
    setCodeError("");
    setVerifying(true);
    try {
      const response = await fetch(`${API_URL}/api/members/auth/enrollment/verify/?code=${encodeURIComponent(clean)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "This verification code is invalid or has expired.");
      setEmail(data.email);
      setVerified(true);
      setNeedsConsent(false);
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : "That code does not match a pending sign-up. Check it and try again.");
    } finally {
      setVerifying(false);
    }
  }

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
    const cleanPhone = phoneNumber.replace(/\D/g, "").slice(0, 10);
    const nextErrors: FieldErrors = {};

    if (!cleanPhone || cleanPhone.length !== 10) nextErrors.phoneNumber = "Enter a valid 10-digit phone number.";
    if (!cleanUsername) nextErrors.username = "Choose a username you will sign in with.";
    else if (/\s/.test(cleanUsername)) nextErrors.username = "Usernames cannot contain spaces.";
    if (!password) nextErrors.password = "Choose a password.";
    else {
      const problems = passwordProblems(password);
      if (problems.length > 0) nextErrors.password = problems.join(" ");
    }
    if (password && password !== confirmPassword) {
      nextErrors.confirmPassword = "The two passwords do not match. Please retype the confirmation.";
    }
    if (needsConsent && !privacyAccepted) nextErrors.privacy = "Please accept the privacy policy to continue.";
    if (needsConsent && !termsAccepted) nextErrors.terms = "Please accept the Terms of Use to continue.";

    setGeneralError("");
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/members/auth/enrollment/complete/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          username: cleanUsername,
          phone_number: cleanPhone,
          password,
          ...(needsConsent ? { privacy_accepted: privacyAccepted, terms_accepted: termsAccepted } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const { fieldErrors: apiFieldErrors, generalError: apiGeneralError } = parseApiErrors(data, [
          "username",
          "password",
          "confirmPassword",
          "phoneNumber",
          "privacy",
          "terms",
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
      setSubmitting(false);
    }
  }

  const heading = "Set up your church account";

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{heading}</h1>
        {email && verified && <p className="mt-3 text-sm text-[#617068]">Account email: {email}</p>}

        {verifying && !codeError && <p className="mt-6 text-sm text-[#617068]">Checking your code…</p>}

        {/* Stage 1: the code. Skipped when a verified code arrived in the address. */}
        {!verified && !verifying && !successMessage && (
          <form onSubmit={submitCode} noValidate className="mt-8 space-y-5">
            <p className="text-sm leading-6 text-[#617068]">
              Enter the verification code we emailed you to continue setting up your account.
            </p>
            <label className="block text-sm font-medium">
              Verification code
              <input
                name="code"
                required
                autoComplete="one-time-code"
                placeholder="ABCD-EFGH"
                value={code}
                aria-invalid={Boolean(codeError)}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeError("");
                }}
                className={fieldClass(Boolean(codeError))}
              />
            </label>
            {codeError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                {codeError}
              </p>
            )}
            <button
              type="submit"
              disabled={verifying}
              className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60"
            >
              {verifying ? "Checking…" : "Continue"}
            </button>
            <Link href="/create-account" className="block text-center text-sm font-semibold text-[#b36b3c]">
              Start a new sign-up
            </Link>
          </form>
        )}

        {/* Stage 2: phone and sign-in details. Consent appears only for those
            who never agreed through create-account. */}
        {verified && !successMessage && (
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
              Phone number
              <input
                name="phoneNumber"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                required
                autoComplete="tel"
                placeholder="e.g. 0712345678 (10 digits)"
                value={phoneNumber}
                aria-invalid={Boolean(fieldErrors.phoneNumber)}
                onChange={(event) => {
                  setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10));
                  setFieldErrors((current) => ({ ...current, phoneNumber: "" }));
                }}
                className={fieldClass(Boolean(fieldErrors.phoneNumber))}
              />
              <FieldError message={fieldErrors.phoneNumber} />
            </label>
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
            <PasswordRules password={password} />
            {needsConsent && (
              <>
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
                <label className="flex items-start gap-3 text-xs leading-5 text-[#617068]">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    aria-invalid={Boolean(fieldErrors.terms)}
                    onChange={(event) => {
                      setTermsAccepted(event.target.checked);
                      setFieldErrors((current) => ({ ...current, terms: "" }));
                    }}
                    className="mt-1 h-4 w-4 accent-[#5f8067]"
                  />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">Terms of Use</Link>
                    .
                  </span>
                </label>
                <FieldError message={fieldErrors.terms} />
              </>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Saving..." : "Create account"}
            </button>
          </form>
        )}

        {successMessage && (
          <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{successMessage}</p>
        )}
        {codeError && !verified && (
          <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{codeError}</p>
        )}

        {successMessage && (
          <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#b36b3c]">
            Go to sign in
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
