"use client";

import Link from "next/link";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function PrayersMoralSupportPage() {
  const [requestText, setRequestText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/members/prayer-requests/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_text: requestText,
          name,
          email,
          anonymous,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Your prayer request has been received. Our prayer team and pastoral elders will lift you up in prayer." });
        setRequestText("");
        setName("");
        setEmail("");
      } else {
        setMessage({ type: "error", text: "Unable to submit prayer request. Please check input." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Back Button */}
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Support Hub</span>
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Spiritual & Care Support</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Prayers & Moral Support</h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            &quot;The prayer of a righteous person is powerful and effective.&quot; &mdash; James 5:16. Let us stand with you in faith and moral support.
          </p>
        </div>

        {/* Prayer Form Card */}
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
              <label className="block text-sm font-semibold text-[#26352f]">How can we pray for or support you?</label>
              <textarea
                required
                rows={5}
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder="Share your prayer requests, health needs, family encouragement, or pastoral visitation request..."
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Your Name (Optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  disabled={anonymous}
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c] disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Email / Contact (Optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="If you'd like pastoral follow-up"
                  disabled={anonymous}
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c] disabled:opacity-40"
                />
              </div>
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
                Keep this prayer request confidential / anonymous
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#b36b3c] py-4 text-center font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Prayer & Moral Support Request"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
