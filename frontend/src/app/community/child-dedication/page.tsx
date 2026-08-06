"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ChildDedicationPage() {
  const [form, setForm] = useState({
    child_name: "",
    child_dob: "",
    father_name: "",
    mother_name: "",
    phone_number: "",
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
        child_name: form.child_name.trim(),
        child_dob: form.child_dob,
        father_name: form.father_name.trim(),
        mother_name: form.mother_name.trim(),
        phone_number: form.phone_number.trim(),
        notes: form.notes.trim(),
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
        child_name: "",
        child_dob: "",
        father_name: "",
        mother_name: "",
        phone_number: "",
        notes: "",
      });
      setMessage("Thank you! Your child dedication request has been submitted. The church office will reach out to connect with you.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-12 pb-10 text-[#26352f] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          <span>&larr;</span>
          <span>Back to Requests</span>
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-5xl">Child dedication</h1>
        <p className="mt-3 text-base leading-7 text-[#617068] sm:text-lg">
          Dedicating a child is a sacred opportunity to thank God for the gift of life and pledge to guide them in faith alongside your church family.
        </p>

        <section className="mt-8 rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-sm sm:p-10">
          <h2 className="text-xl font-semibold sm:text-2xl">Child dedication details</h2>
          <p className="mt-2 text-sm leading-6 text-[#617068]">
            Please provide your child&apos;s information and contact details below.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Child&apos;s Full Name
                <input
                  required
                  maxLength={160}
                  value={form.child_name}
                  onChange={(event) => setForm({ ...form, child_name: event.target.value })}
                  placeholder="Enter child's full name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
              <label className="block text-sm font-medium">
                Child&apos;s Date of Birth
                <input
                  type="date"
                  required
                  value={form.child_dob}
                  onChange={(event) => setForm({ ...form, child_dob: event.target.value })}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Father&apos;s Name (optional)
                <input
                  maxLength={160}
                  value={form.father_name}
                  onChange={(event) => setForm({ ...form, father_name: event.target.value })}
                  placeholder="Father's full name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
              <label className="block text-sm font-medium">
                Mother&apos;s Name (optional)
                <input
                  maxLength={160}
                  value={form.mother_name}
                  onChange={(event) => setForm({ ...form, mother_name: event.target.value })}
                  placeholder="Mother's full name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Phone / Contact Number
              <input
                required
                maxLength={40}
                placeholder="e.g. 07XX XXX XXX"
                value={form.phone_number}
                onChange={(event) => setForm({ ...form, phone_number: event.target.value })}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>

            <label className="block text-sm font-medium">
              Additional Notes or Special Requests (optional)
              <textarea
                maxLength={1000}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={3}
                placeholder="Any special requests or details for church leadership..."
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
              />
            </label>

            <button
              disabled={loading}
              className="w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
            >
              {loading ? "Submitting request..." : "Submit request"}
            </button>
          </form>

          {message && (
            <p className="mt-5 rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-6 text-[#617068]">
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
