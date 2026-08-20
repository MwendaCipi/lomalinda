"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ApprovedTestimony {
  id: number;
  name: string;
  testimony_text: string;
  created_at: string;
}

export default function TestimoniesPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"online" | "fellowship" | null>(null);
  const [testimony, setTestimony] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [approvedTestimonies, setApprovedTestimonies] = useState<ApprovedTestimony[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const loggedIn = Boolean(token);
    setIsLoggedIn(loggedIn);
    if (loggedIn) {
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) setName(`${data.user.first_name || ""} ${data.user.last_name || ""}`.trim() || data.user.username || "");
        })
        .catch(() => {});
    }
    fetch(`${API_URL}/api/members/testimonies/`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setApprovedTestimonies)
      .catch(() => setApprovedTestimonies([]));

  }, []);

  const filteredTestimonies = approvedTestimonies.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    return !query || `${item.name} ${item.testimony_text}`.toLowerCase().includes(query);
  });

  async function submitTestimony(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const response = await fetch(`${API_URL}/api/members/testimonies/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          testimony_text: testimony.trim() || "I would like to request an opportunity to share my testimony during fellowship.",
          name: name.trim(),
          phone_number: phoneNumber.trim(),
          request_type: mode,
          requested_date: requestedDate || null,
          requested_time: requestedTime,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorDetail = errorData.detail || errorData.message || (typeof errorData === "object" ? Object.values(errorData).flat().join(" ") : "") || "Could not submit your testimony.";
        throw new Error(errorDetail);
      }
      setMessage(mode === "online" ? (isLoggedIn ? "Thank you for sharing your testimony." : "Thank you. Your testimony has been submitted for admin approval.") : "Thank you. Your request to share during fellowship has been received. A church leader will follow up with you.");
      setTestimony("");
      setName("");
      setPhoneNumber("");
      setRequestedDate("");
      setRequestedTime("");
      if (mode === "fellowship") setRequestModalOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not submit your testimony. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "online") {
    return (
      <main className="min-h-screen bg-[#f7f4ee] px-6 pb-8 pt-6 text-[#26352f] sm:py-10">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={() => { setMode(null); setMessage(""); }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
          >
            &larr; Back to Testimonies
          </button>
          <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-[#26352f] sm:text-3xl">Share testimony</h1>
            <p className="mt-1 text-sm text-[#617068]">Tell us what God has done in your life.</p>
            <form onSubmit={submitTestimony} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium">Your Name
                  <input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder="Enter your name" />
                </label>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm font-medium">
                  <label htmlFor="testimony-text">Your Testimony</label>
                  <span className="text-xs text-[#617068]">{testimony.length} / 1000 characters</span>
                </div>
                <textarea id="testimony-text" required maxLength={1000} rows={5} value={testimony} onChange={(event) => setTestimony(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder="Tell us what God has done in your life..." />
              </div>
              <div className="pt-2">
                <button disabled={loading} className="w-full rounded-full bg-[#5f8067] px-6 py-3.5 font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60">
                  {loading ? "Sending..." : "Share testimony"}
                </button>
              </div>
              {message && (
                <div className="mt-4 rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-6 text-[#617068]">
                  <p>{message}</p>
                  <button
                    type="button"
                    onClick={() => { setMode(null); setMessage(""); }}
                    className="mt-3 inline-block font-semibold text-[#b36b3c] hover:underline"
                  >
                    &larr; Return to all testimonies
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-8 pt-6 text-[#26352f] sm:py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/share" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">&larr; Back to Fellowship</Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Testimonies</h1>

        <section className="mt-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block text-sm font-medium sm:w-72">Search testimonies
              <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name or words" className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 outline-none focus:border-[#b36b3c]" />
            </label>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfdbd1] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="bg-[#f7f4ee] text-xs uppercase tracking-wide text-[#617068]"><tr><th className="px-5 py-3 font-semibold">Name</th><th className="px-5 py-3 font-semibold">Testimony</th><th className="px-5 py-3 font-semibold">Date</th></tr></thead>
                <tbody className="divide-y divide-[#dfdbd1]">
                  {filteredTestimonies.map((item) => <tr key={item.id} className="align-top"><td className="px-5 py-4 font-semibold">{item.name || "Church Member"}</td><td className="max-w-xl px-5 py-4 leading-6 text-[#617068]">{item.testimony_text}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-[#617068]">{new Date(item.created_at).toLocaleDateString()}</td></tr>)}
                  {filteredTestimonies.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-[#617068]">{approvedTestimonies.length ? "No testimonies match your search." : "No testimonies have been published yet."}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setMode("online"); setMessage(""); }} className="rounded-full bg-[#5f8067] px-5 py-3 font-semibold text-white transition hover:bg-[#4d6d55]">Share testimony</button>
          <button type="button" onClick={() => { setMode("fellowship"); setRequestModalOpen(true); setMessage(""); }} className="rounded-full bg-[#b36b3c] px-5 py-3 font-semibold text-white transition hover:bg-[#96552e]">Request</button>
        </div>

        {requestModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26352f]/50 px-5" role="dialog" aria-modal="true" aria-labelledby="request-testimony-title">
          <form onSubmit={submitTestimony} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><h2 id="request-testimony-title" className="text-xl font-semibold sm:text-2xl">Request to share</h2><p className="mt-2 text-sm leading-6 text-[#617068]">Tell us when you would like to share during fellowship.</p></div><button type="button" onClick={() => setRequestModalOpen(false)} className="text-xl text-[#617068]" aria-label="Close">&times;</button></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Your Name<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label><label className="block text-sm font-medium">Phone number<input required maxLength={40} type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder="07XX XXX XXX" /></label><label className="block text-sm font-medium">Preferred date<input type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label><label className="block text-sm font-medium">Preferred time<input type="time" value={requestedTime} onChange={(event) => setRequestedTime(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" /></label></div>
            <label className="mt-4 block text-sm font-medium">Additional message<textarea rows={3} maxLength={1000} value={testimony} onChange={(event) => setTestimony(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder="Add any details for the church team..." /></label>
            <button disabled={loading} className="mt-5 w-full rounded-full bg-[#b36b3c] px-5 py-3 font-semibold text-white disabled:opacity-60">{loading ? "Sending..." : "Request"}</button>
            {message && <p className="mt-4 rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-6 text-[#617068]">{message}</p>}
          </form>
        </div>}
        {message && !requestModalOpen && (
          <p className="mt-5 rounded-2xl bg-white p-4 text-sm leading-6 text-[#617068] shadow-sm ring-1 ring-[#dfdbd1]">{message}</p>
        )}
      </div>
    </main>
  );
}
