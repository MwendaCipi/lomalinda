"use client";

import Link from "next/link";
import { FormEvent, Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";
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

function ResetPasswordContent() {
  const router = useRouter();
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const formRef = useRef<HTMLFormElement>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  const [loading, setLoading] = useState(false);

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
    const nextErrors: FieldErrors = {};

    if (!password) nextErrors.password = "Choose a new password.";
    else if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
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
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/members/auth/password-reset/confirm/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const { fieldErrors: apiFieldErrors, generalError: apiGeneralError } = parseApiErrors(data, [
          "password",
          "confirmPassword",
        ]);
        const fallback =
          Object.keys(apiFieldErrors).length === 0 && !apiGeneralError
            ? "Unable to reset your password. Please try again."
            : "";
        setFieldErrors(apiFieldErrors);
        setGeneralError(apiGeneralError || fallback);
        focusFirstError(apiFieldErrors);
        return;
      }
      const successMsg = data.message || "Your password has been reset successfully.";
      await showAlert("Password reset successful", successMsg, "success");
      router.push("/login");
    } catch {
      setGeneralError("We could not reach the church server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Choose a new password</h1>
        <form ref={formRef} onSubmit={submit} noValidate className="mt-8 space-y-5">
          {generalError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
              {generalError}
            </p>
          )}
          <label className="block text-sm font-medium">
            New password
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
            Confirm new password
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
          <p className="text-xs text-[#617068]">Use at least 8 characters, and avoid a password that is easy to guess.</p>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60"
          >
            {loading ? "Saving..." : "Reset password"}
          </button>
        </form>
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#b36b3c]">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
          Loading password reset...
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
