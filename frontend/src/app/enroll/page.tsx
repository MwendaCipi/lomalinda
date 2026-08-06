"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Mode = "new" | "transfer";

export default function EnrollPage() {
  const [mode, setMode] = useState<Mode>("new");
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone_number: "",
    current_church: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const payload: Record<string, string> = {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        phone_number: form.phone_number,
        enrollment_type: mode,
      };
      if (mode === "transfer") payload.current_church = form.current_church;

      const response = await fetch(`${API_URL}/api/members/auth/enrollment-request/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" "));
      setMessage(data.message ?? "Your request has been received. We will be in touch.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit your request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 pb-16 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10">
        <Link
          href="/share"
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Fellowship</span>
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Request to join</h1>
        <p className="mt-3 text-sm leading-6 text-[#617068]">
          Fill in your details and we will reach out to walk you through the next steps.
        </p>

        {/* Mode toggle */}
        <div className="mt-6 flex rounded-2xl border border-[#dfdbd1] p-1 gap-1">
          {(["new", "transfer"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                mode === m
                  ? "bg-[#26352f] text-white shadow-sm"
                  : "text-[#617068] hover:bg-[#f7f4ee]"
              }`}
            >
              {m === "new" ? "New member" : "Membership transfer"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              First name
              <input
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>
            <label className="block text-sm font-medium">
              Last name
              <input
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Phone number
            <input
              required
              placeholder="e.g. 01XX XXX XXX or 07XX XXX XXX"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
            />
          </label>

          {/* Transfer-only: current church */}
          {mode === "transfer" && (
            <label className="block text-sm font-medium">
              Current church name
              <input
                required
                placeholder="Name of your current church"
                value={form.current_church}
                onChange={(e) => setForm({ ...form, current_church: e.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>
          )}

          <button
            disabled={loading}
            className="w-full rounded-full bg-[#26352f] px-5 py-3.5 font-medium text-white disabled:opacity-60 transition hover:bg-[#3d5148]"
          >
            {loading ? "Sending..." : mode === "transfer" ? "Submit transfer request" : "Submit request to join"}
          </button>
        </form>

        {message && (
          <p className="mt-5 rounded-xl bg-[#f7f4ee] p-4 text-sm text-[#617068]">{message}</p>
        )}

        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-[#b36b3c]">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
