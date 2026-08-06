"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ChildDedicationPage() {
  const [form, setForm] = useState({
    parent_name: "",
    child_name: "",
    child_dob: "",
    phone_number: "",
    email: "",
    requested_date: "",
    notes: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const payload = {
        ...form,
        child_dob: form.child_dob || null,
        email: form.email || "",
        notes: form.notes || "",
      };
      const response = await fetch(`${API_URL}/api/members/child-dedications/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(Object.values(data).flat().join(" ") || "Unable to submit dedication request.");
      }
      setForm({
        parent_name: "",
        child_name: "",
        child_dob: "",
        phone_number: "",
        email: "",
        requested_date: "",
        notes: "",
      });
      setMessage("Thank you! Your child dedication request has been submitted. The church office will reach out to confirm your requested date.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 py-10 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/community" className="text-sm font-semibold text-[#b36b3c] hover:underline">
          &larr; Community
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-5xl">Child dedication</h1>
        <p className="mt-4 text-base leading-7 text-[#617068] sm:text-lg">
          Dedicating a child is a sacred opportunity to thank God for the gift of life and pledge to guide them in faith alongside your church family.
        </p>

        <section className="mt-10 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-10">
          <h2 className="text-2xl font-semibold">Request a dedication date</h2>
          <p className="mt-2 text-sm leading-6 text-[#617068]">
            Please fill in the parent/guardian details, your child&apos;s name, and your requested dedication date.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Parent or Guardian Name
                <input
                  required
                  value={form.parent_name}
                  onChange={(event) => setForm({ ...form, parent_name: event.target.value })}
                  placeholder="Full name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
              <label className="block text-sm font-medium">
                Child&apos;s Name
                <input
                  required
                  value={form.child_name}
                  onChange={(event) => setForm({ ...form, child_name: event.target.value })}
                  placeholder="Full name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Phone Number
                <input
                  required
                  placeholder="e.g. 07XX XXX XXX"
                  value={form.phone_number}
                  onChange={(event) => setForm({ ...form, phone_number: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
              <label className="block text-sm font-medium">
                Email Address (optional)
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="email@example.com"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Requested Dedication Date
                <input
                  type="date"
                  required
                  value={form.requested_date}
                  onChange={(event) => setForm({ ...form, requested_date: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
              <label className="block text-sm font-medium">
                Child&apos;s Date of Birth (optional)
                <input
                  type="date"
                  value={form.child_dob}
                  onChange={(event) => setForm({ ...form, child_dob: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Additional Notes or Special Requests (optional)
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={3}
                placeholder="Any special requests or information for the pastors and leaders..."
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>

            <button
              disabled={loading}
              className="w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
            >
              {loading ? "Submitting request..." : "Submit dedication request"}
            </button>
          </form>

          {message && (
            <p className="mt-6 rounded-2xl bg-[#f7f4ee] p-5 text-sm leading-6 text-[#617068]">
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
