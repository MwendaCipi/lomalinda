"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function PrayersMoralSupportPage() {
  const [pledgeText, setPledgeText] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(localStorage.getItem("access_token")), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/members/support-submissions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          submission_type: "moral_support", content: pledgeText, name, phone_number: phoneNumber, email, anonymous,
        }),
      });

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Thank you for supporting Loma Linda SDA Church in prayer and moral commitment! May God richly bless your faithful dedication.",
        });
        setPledgeText("");
        setName("");
        setPhoneNumber("");
        setEmail("");
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.detail || "Unable to record your pledge. Please check input." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (token === null) return <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-[#26352f]"><div className="mx-auto max-w-md rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#dfdbd1]"><h1 className="text-2xl font-semibold">Sign in required</h1><p className="mt-3 text-sm leading-6 text-[#617068]">Please sign in to give moral support to the church.</p><Link href="/login" className="mt-6 inline-block rounded-full bg-[#b36b3c] px-5 py-3 font-semibold text-white">Sign in</Link></div></main>;
  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Back Button */}
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Stewardship & Support</span>
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Church Encouragement</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Prayer & Moral Support for the Church</h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            Support Loma Linda SDA Church through faithful intercessory prayer, pastoral encouragement, evangelism backing, and spiritual moral support.
          </p>
        </div>

        {/* Form Card */}
        <div className="mt-8 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-10">
          {message && (
            <div
              className={`mb-6 rounded-2xl p-4 text-sm font-medium ${
                message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-[#26352f]">Your Prayer & Moral Support Commitment</label>
              <textarea
                required
                rows={5}
                value={pledgeText}
                onChange={(e) => setPledgeText(e.target.value)}
                placeholder="e.g. I pledge to pray daily for church leadership and evangelism missions, volunteering for intercessory prayer, or offering encouragement..."
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Your Name</label>
                <input
                  type="text"
                  required={!anonymous}
                  disabled={anonymous}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c] disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Phone Number (Optional)</label>
                <input
                  type="tel"
                  disabled={anonymous}
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Contact phone number"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c] disabled:opacity-40"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#26352f]">Email Address (Optional)</label>
              <input
                type="email"
                disabled={anonymous}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c] disabled:opacity-40"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="anonymous"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="h-4 w-4 rounded border-[#dfdbd1] text-[#b36b3c] focus:ring-[#b36b3c]"
              />
              <label htmlFor="anonymous" className="text-sm font-medium text-[#617068]">
                Keep this prayer & moral support pledge anonymous
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#b36b3c] py-4 text-center font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-50"
            >
              {submitting ? "Submitting pledge..." : "Submit Prayer & Moral Support Pledge"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
