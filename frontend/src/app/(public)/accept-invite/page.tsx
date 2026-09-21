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
  const formRef = useRef<HTMLFormElement>(null);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [rolesDisplay, setRolesDisplay] = useState("");
  const [accountTypeDisplay, setAccountTypeDisplay] = useState("");
  const [churchName, setChurchName] = useState("SDA Loma Linda, Meru");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  /** Fatal: the invitation itself cannot be used, so there is nothing to retry. */
  const [linkError, setLinkError] = useState("");
  /** Recoverable: shown next to the offending input, form stays open. */
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLinkError("This invitation link is not valid. Please ask the church office for a new invitation.");
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
      .catch((error) =>
        setLinkError(error instanceof Error ? error.message : "This invitation link is not valid.")
      )
      .finally(() => setLoading(false));
  }, [token]);

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
    const nextErrors: FieldErrors = {};

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
          token,
          username: cleanUsername,
          password,
          confirm_password: confirmPassword,
        }),
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
        {!linkError && (
          <p className="mt-2 text-sm text-[#617068]">
            {/* 'SDA Loma Linda, Meru, has invited you…' — when the church's own name carries
                a comma (church, town) the apposition it opens is closed here, exactly as the
                invitation email words it. */}
            {churchName.includes(",") ? `${churchName},` : churchName}
            {accountTypeDisplay ? ` has invited you to join as a ${accountTypeDisplay}` : " has invited you to join"}
            {rolesDisplay ? ` with access as ${rolesDisplay}` : ""}. Choose your own username and password below.
          </p>
        )}
        {email && !linkError && <p className="mt-2 text-xs text-[#617068]">Invitation email: {email}</p>}

        {loading && !linkError && <p className="mt-6 text-sm text-[#617068]">Checking your invitation…</p>}

        {!loading && !linkError && (
          <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-4">
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
            <PasswordRules password={password} />
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
            {linkError && (
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
