"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ApprovedTestimony {
  id: number;
  name: string;
  testimony_text: string;
  created_at: string;
}

export default function TestimoniesPage() {
  const [mode, setMode] = useState<"online" | "fellowship" | null>(null);
  const [testimony, setTestimony] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [approvedTestimonies, setApprovedTestimonies] = useState<ApprovedTestimony[]>([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [verificationName, setVerificationName] = useState("");
  const [emailStatus, setEmailStatus] = useState("");

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

    const tokenFromLink = new URLSearchParams(window.location.search).get("token");
    if (tokenFromLink) {
      setVerificationToken(tokenFromLink);
      fetch(`${API_URL}/api/members/testimonies/verify/?token=${encodeURIComponent(tokenFromLink)}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("This confirmation link is invalid or expired."))))
        .then((data) => {
          setVerificationName(data.name || "");
          setName(data.name || "");
          setMode("online");
        })
        .catch((error) => setEmailStatus(error instanceof Error ? error.message : "This confirmation link is invalid or expired."));
    }
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
      const guestShare = mode === "online" && !isLoggedIn;
      const response = await fetch(`${API_URL}/api/members/${guestShare ? "testimonies/verify/" : "testimonies/"}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(guestShare ? { token: verificationToken } : {}),
          testimony_text: testimony.trim() || "I would like to request an opportunity to share my testimony during fellowship.",
          name: name.trim(),
          phone_number: phoneNumber.trim(),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(Object.values(errorData).flat().join(" ") || "Could not submit your testimony.");
      }
      setMessage(mode === "online" ? (isLoggedIn ? "Thank you for sharing your testimony." : "Thank you. Your testimony has been submitted for review.") : "Thank you. Your request to share during fellowship has been received. A church leader will follow up with you.");
      setTestimony("");
      if (!isLoggedIn) setName("");
      setPhoneNumber("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not submit your testimony. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startGuestShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setEmailStatus("");
    try {
      const response = await fetch(`${API_URL}/api/members/testimonies/verify/start/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddress.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.email || "The confirmation email could not be sent.");
      setEmailStatus(data.message || "Check your email for a confirmation link.");
    } catch (error) {
      setEmailStatus(error instanceof Error ? error.message : "The confirmation email could not be sent.");
    } finally {
      setLoading(false);
    }
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
          <button type="button" onClick={() => isLoggedIn ? setMode("online") : setEmailModalOpen(true)} className="rounded-full bg-[#5f8067] px-5 py-3 font-semibold text-white transition hover:bg-[#4d6d55]">Share testimony</button>
          <button type="button" onClick={() => setMode("fellowship")} className="rounded-full bg-[#b36b3c] px-5 py-3 font-semibold text-white transition hover:bg-[#96552e]">Request</button>
        </div>

        {emailModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26352f]/50 px-5" role="dialog" aria-modal="true" aria-labelledby="testimony-email-title">
            <form onSubmit={startGuestShare} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
              <div className="flex items-start justify-between gap-4"><div><h2 id="testimony-email-title" className="text-2xl font-semibold">Share testimony</h2><p className="mt-2 text-sm leading-6 text-[#617068]">Enter your email to receive a secure link to the sharing page.</p></div><button type="button" onClick={() => setEmailModalOpen(false)} className="text-xl text-[#617068]" aria-label="Close">&times;</button></div>
              <label className="mt-5 block text-sm font-medium">Email address<input required type="email" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder="you@example.com" /></label>
              <button disabled={loading} className="mt-5 w-full rounded-full bg-[#5f8067] px-5 py-3 font-semibold text-white disabled:opacity-60">{loading ? "Sending..." : "Next"}</button>
              {emailStatus && <p className="mt-4 rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-6 text-[#617068]">{emailStatus}</p>}
            </form>
          </div>
        )}

        {(mode === "fellowship" || (mode === "online" && (isLoggedIn || verificationToken))) && <form onSubmit={submitTestimony} className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-7">
          {mode === "fellowship" && <h2 className="text-xl font-semibold sm:text-2xl">Request to share during fellowship</h2>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Your Name<input required maxLength={160} value={name} readOnly={mode === "online" && Boolean(verificationName)} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c] read-only:bg-[#f7f4ee]" placeholder="Enter your name" /></label>
            {mode === "fellowship" && <label className="block text-sm font-medium">Phone number<input required maxLength={40} type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder="07XX XXX XXX" /></label>}
          </div>
          <div className="mt-4"><div className="flex items-center justify-between text-sm font-medium"><label htmlFor="testimony-text">{mode === "online" ? "Your Testimony" : "Message (optional)"}</label><span className="text-xs text-[#617068]">{testimony.length} / 1000 characters</span></div><textarea id="testimony-text" required={mode === "online"} maxLength={1000} rows={4} value={testimony} onChange={(event) => setTestimony(event.target.value)} className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]" placeholder={mode === "online" ? "Tell us what God has done in your life..." : "Add any details you would like the church team to know..."} /></div>
          <button disabled={loading} className="mt-6 w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60">{loading ? "Sending..." : mode === "online" ? "Share testimony" : "Request"}</button>
          {message && <p className="mt-5 rounded-2xl bg-[#f7f4ee] p-4 text-sm leading-6 text-[#617068]">{message}</p>}
        </form>}
      </div>
    </main>
  );
}
