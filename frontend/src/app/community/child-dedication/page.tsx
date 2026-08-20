"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ChildDedicationPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    child_first_name: "",
    child_last_name: "",
    child_dob: "",
    father_name: "",
    mother_name: "",
    phone_number: "",
    notes: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(localStorage.getItem("access_token")), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const storedToken = localStorage.getItem("access_token") || token;
    setLoading(true);
    setMessage("");

    try {
      const fullName = `${form.child_first_name.trim()} ${form.child_last_name.trim()}`.trim();
      const payload = {
        child_name: fullName,
        child_first_name: form.child_first_name.trim(),
        child_last_name: form.child_last_name.trim(),
        child_dob: form.child_dob,
        father_name: form.father_name.trim(),
        mother_name: form.mother_name.trim(),
        phone_number: form.phone_number.trim(),
        notes: form.notes.trim(),
      };
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (storedToken) headers.Authorization = `Bearer ${storedToken}`;
      const response = await fetch(`${API_URL}/api/members/child-dedications/`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(Object.values(data).flat().join(" ") || "Unable to submit dedication request.");
      }
      setForm({
        child_first_name: "",
        child_last_name: "",
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
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-8 pb-8 text-[#26352f] sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          <span>&larr;</span>
          <span>Back to Requests</span>
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Child dedication</h1>

        <section className="mt-5 rounded-3xl border border-[#dfdbd1] bg-[#ffffff] p-6 shadow-sm sm:p-10">
          <h2 className="text-xl font-semibold sm:text-2xl">Child dedication details</h2>
          <p className="mt-2 text-sm leading-6 text-[#617068]">
            Please provide your child&apos;s information and contact details below.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-5">
            {/* Child First & Last Name */}
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Child&apos;s First Name
                <input
                  required
                  maxLength={80}
                  value={form.child_first_name}
                  onChange={(event) => setForm({ ...form, child_first_name: event.target.value })}
                  placeholder="Enter child's first name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
              <label className="block text-sm font-medium">
                Child&apos;s Last Name
                <input
                  required
                  maxLength={80}
                  value={form.child_last_name}
                  onChange={(event) => setForm({ ...form, child_last_name: event.target.value })}
                  placeholder="Enter child's last name"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>

            {/* Date of Birth & Phone */}
            <div className="grid gap-5 sm:grid-cols-2">
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
            </div>

            {/* Parents' Names */}
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
