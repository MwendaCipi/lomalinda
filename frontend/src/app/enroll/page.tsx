"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Mode = "baptism" | "transfer";

export default function EnrollPage() {
  const [mode, setMode] = useState<Mode>("baptism");
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone_number: "",
    current_church: "",
  });
  const [transferDirection, setTransferDirection] = useState<"incoming" | "outgoing">("incoming");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const endpoint = mode === "transfer"
        ? `${API_URL}/api/members/transfers/`
        : `${API_URL}/api/members/auth/enrollment-request/`;
      const payload: Record<string, string> = mode === "transfer"
        ? {
            member_name: `${form.first_name} ${form.last_name}`.trim(),
            transfer_type: transferDirection,
            other_church: form.current_church,
            phone_number: form.phone_number,
          }
        : {
            email: form.email,
            first_name: form.first_name,
            last_name: form.last_name,
            phone_number: form.phone_number,
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(Object.values(data).flat().join(" "));
      setMessage(data.message ?? (mode === "transfer"
        ? "Your transfer request has been received. The church office will be in touch."
        : "Your request has been received. We will be in touch."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit your request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#f7f4ee] px-6 pt-16 pb-16 text-[#26352f]">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[#dfdbd1] sm:p-10 lg:max-w-4xl">
        <Link
          href="/requests"
          className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Requests</span>
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Request to join</h1>
        <p className="mt-2 text-sm leading-6 text-[#617068]">
          {mode === "transfer"
            ? "For SDA members transferring from one church to another."
            : "Fill in your details and we will reach out to walk you through the next steps."}
        </p>

        {/* Mode toggle */}
        <div className="mt-6 flex max-w-md rounded-2xl border border-[#dfdbd1] p-1 gap-1">
          {(["baptism", "transfer"] as Mode[]).map((m) => (
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
              {m === "baptism" ? "Baptism" : "Transfer"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {/* First 4 fields in 1 row on large screens */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm font-medium">
              First name
              <input
                required
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>

            <label className="block text-sm font-medium">
              Last name
              <input
                required
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>

            <label className="block text-sm font-medium">
              Phone number
              <input
                required
                placeholder="e.g. 07XX XXX XXX"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>

            <label className="block text-sm font-medium">
              Email address
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>
          </div>

          {/* Transfer-only: current church */}
          {mode === "transfer" && (
            <div className="space-y-4">
              <div className="flex rounded-2xl border border-[#dfdbd1] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setTransferDirection("incoming")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${transferDirection === "incoming" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}
                >
                  Transfer in
                </button>
                <button
                  type="button"
                  onClick={() => setTransferDirection("outgoing")}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${transferDirection === "outgoing" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:bg-[#f7f4ee]"}`}
                >
                  Transfer out
                </button>
              </div>
              <label className="block text-sm font-medium">
                {transferDirection === "incoming" ? "Previous church name" : "Destination church name"}
                <input
                  required
                  placeholder={transferDirection === "incoming" ? "Name of your previous church" : "Name of your destination church"}
                  value={form.current_church}
                  onChange={(e) => setForm({ ...form, current_church: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>
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
