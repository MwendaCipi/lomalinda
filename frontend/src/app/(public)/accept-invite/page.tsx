"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordRules } from "@/components/password-rules";
import { FieldErrors, parseApiErrors } from "@/lib/form-errors";
import { passwordProblems } from "@/lib/validation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const inputClass =
  "mt-1.5 w-full rounded-xl border px-4 py-2.5 outline-none focus:border-[#b36b3c] border-[#c9c5bb]";

function fieldClass(hasError: boolean) {
  return hasError ? `${inputClass} border-red-400 bg-red-50/40` : inputClass;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="mt-1.5 block text-xs font-medium text-red-700">{message}</span>;
}

function AcceptInviteContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const linkCode = params.get("code") ?? "";
  const formRef = useRef<HTMLFormElement>(null);

  /**
   * What identifies the invitation: the link's token, or the code the same
   * email prints underneath it. Only one of the two is ever present.
   */
  const [credential, setCredential] = useState<{ token?: string; code?: string }>({});
  /** No credential in the address, so the invitee types the emailed code. */
  const [codeEntry, setCodeEntry] = useState(false);
  const [codeValue, setCodeValue] = useState("");
  const [codeError, setCodeError] = useState("");

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  /** Fatal: the invitation itself cannot be used, so there is nothing to retry. */
  const [linkError, setLinkError] = useState("");
  /** Recoverable: shown next to the offending input, form stays open. */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Accept whatever the verify endpoint sends back and remember which half of
   * the invitation got us here. Returns false when the invitation is unusable,
   * so the caller can report it in the right place.
   */
  async function verify(search: string, nextCredential: { token?: string; code?: string }) {
    const response = await fetch(`${API_URL}/api/members/auth/invitation/verify/?${search}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "This invitation is not valid. Please ask the church office for a new one.");
    }
    setEmail(data.email ?? "");
    setFirstName(data.first_name ?? "");
    setLastName(data.last_name ?? "");
    setPhoneNumber(data.phone_number ?? "");
    setCredential(nextCredential);
  }

  useEffect(() => {
    if (!token && !linkCode) {
      // Nobody arrives from a link here without one: this is the code path.
      setCodeEntry(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const search = token
      ? `token=${encodeURIComponent(token)}`
      : `code=${encodeURIComponent(linkCode)}`;
    verify(search, token ? { token } : { code: linkCode })
      .catch((error) => {
        if (!cancelled) {
          setLinkError(error instanceof Error ? error.message : "This invitation is not valid.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, linkCode]);

  /** The typed path to the same invitation, for mail apps that hide the link. */
  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = codeValue.trim();
    if (!clean) {
      setCodeError("Enter the invitation code from your email.");
      return;
    }
    setCodeError("");
    setSubmitting(true);
    try {
      await verify(`code=${encodeURIComponent(clean)}`, { code: clean });
      setCodeEntry(false);
    } catch (error) {
      setCodeError(
        error instanceof Error
          ? error.message
          : "That code does not match a live invitation. Check it and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** Put the cursor on the first input that has something wrong with it. */
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
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, "").slice(0, 10);
    const nextErrors: FieldErrors = {};

    if (!cleanFirstName) nextErrors.firstName = "Enter your first name.";
    if (!cleanLastName) nextErrors.lastName = "Enter your last name.";
    if (!cleanPhoneNumber || cleanPhoneNumber.length !== 10) nextErrors.phoneNumber = "Enter a valid 10-digit phone number.";
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
    if (!privacyAccepted) nextErrors.privacy = "Please accept the Privacy Policy to continue.";
    if (!termsAccepted) nextErrors.terms = "Please accept the Terms of Use to continue.";

    setGeneralError("");
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      focusFirstError(nextErrors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/members/auth/invitation/accept/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credential,
          first_name: cleanFirstName,
          last_name: cleanLastName,
          phone_number: cleanPhoneNumber,
          privacy_accepted: privacyAccepted,
          terms_accepted: termsAccepted,
          username: cleanUsername,
          password,
          confirm_password: confirmPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const { fieldErrors: apiFieldErrors, generalError: apiGeneralError } = parseApiErrors(data, [
          "firstName",
          "lastName",
          "phoneNumber",
          "privacy",
          "terms",
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
      router.push("/login?created=1");
    } catch {
      setGeneralError("We could not reach the church server. Check your connection and try again.");
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
        {email && !linkError && <p className="mt-2 text-xs text-[#617068]">Invitation email: {email}</p>}

        {loading && !linkError && <p className="mt-6 text-sm text-[#617068]">Checking your invitation…</p>}

        {!loading && codeEntry && (
          <form onSubmit={submitCode} noValidate className="mt-6 space-y-4">
            <p className="text-sm leading-6 text-[#617068]">
              Your invitation email carries a link and the code below it. The link opens in some mail apps and not
              others, so if it will not open, type the code here instead.
            </p>
            <label className="block text-sm font-medium">
              Invitation code
              <input
                name="code"
                required
                autoComplete="one-time-code"
                placeholder="ABCD-EFGH"
                value={codeValue}
                aria-invalid={Boolean(codeError)}
                onChange={(event) => {
                  setCodeValue(event.target.value);
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
              disabled={submitting}
              className="w-full rounded-full bg-[#26352f] px-5 py-3 font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Checking the code…" : "Continue"}
            </button>
          </form>
        )}

        {!loading && !linkError && !codeEntry && (
          <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-4">
            {generalError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"
              >
                {generalError}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                First name
                <input
                  name="firstName"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  aria-invalid={Boolean(fieldErrors.firstName)}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    setFieldErrors((current) => ({ ...current, firstName: "" }));
                  }}
                  className={fieldClass(Boolean(fieldErrors.firstName))}
                />
                <FieldError message={fieldErrors.firstName} />
              </label>
              <label className="block text-sm font-medium">
                Last name
                <input
                  name="lastName"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  aria-invalid={Boolean(fieldErrors.lastName)}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    setFieldErrors((current) => ({ ...current, lastName: "" }));
                  }}
                  className={fieldClass(Boolean(fieldErrors.lastName))}
                />
                <FieldError message={fieldErrors.lastName} />
              </label>
            </div>
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
            <label className="flex items-start gap-3 text-xs leading-5 text-[#617068]">
              <input type="checkbox" checked={privacyAccepted} aria-invalid={Boolean(fieldErrors.privacy)} onChange={(event) => { setPrivacyAccepted(event.target.checked); setFieldErrors((current) => ({ ...current, privacy: "" })); }} className="mt-1 h-4 w-4 accent-[#5f8067]" />
              <span>I agree to the <Link href="/privacy" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">Privacy Policy</Link>.</span>
            </label>
            <FieldError message={fieldErrors.privacy} />
            <label className="flex items-start gap-3 text-xs leading-5 text-[#617068]">
              <input type="checkbox" checked={termsAccepted} aria-invalid={Boolean(fieldErrors.terms)} onChange={(event) => { setTermsAccepted(event.target.checked); setFieldErrors((current) => ({ ...current, terms: "" })); }} className="mt-1 h-4 w-4 accent-[#5f8067]" />
              <span>I agree to the <Link href="/terms" target="_blank" className="font-semibold text-[#b36b3c] hover:underline">Terms of Use</Link>.</span>
            </label>
            <FieldError message={fieldErrors.terms} />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#26352f] px-5 py-3 font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Creating your account…" : "Create account"}
            </button>
          </form>
        )}

        {linkError && <p className="mt-6 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{linkError}</p>}
        {(linkError || !loading) && (
          <p className="mt-6 border-t border-[#dfdbd1] pt-5 text-center text-xs text-[#617068] sm:text-sm">
            Already set up?{" "}
            <Link href="/login" className="font-semibold text-[#b36b3c] hover:underline">
              Sign in
            </Link>
            .{" "}
            {(linkError || codeEntry) && (
              <Link href="/create-account" className="font-semibold text-[#b36b3c] hover:underline">
                Or create your own account
              </Link>
            )}
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
