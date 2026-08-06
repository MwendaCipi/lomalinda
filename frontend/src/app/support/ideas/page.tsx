"use client";

import Link from "next/link";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ShareIdeasPage() {
  const [ideaText, setIdeaText] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [category, setCategory] = useState("church_growth");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giving_type: "idea",
          amount: 0,
          purpose: `Idea Submission (${category})`,
          phone_number: contact || "0000000000",
          donor_name: name || "Anonymous Contributor",
          item_description: ideaText,
        }),
      });

      if (res.ok) {
        setMessage({
          type: "success",
          text: "Thank you for sharing your ideas and suggestions for Loma Linda SDA Church! Our church board and ministry leaders will carefully review your feedback.",
        });
        setIdeaText("");
        setName("");
        setContact("");
      } else {
        setMessage({ type: "error", text: "Unable to submit your idea. Please check form details." });
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
          <span>Back to Stewardship & Support</span>
        </Link>

        <div className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Growth & Innovation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">Share Ideas & Suggestions</h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            We value your insights! Share ideas, feedback, or innovative proposals to help Loma Linda SDA Church grow, improve ministry, and serve our community better.
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
              <label className="block text-sm font-semibold text-[#26352f]">Idea Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
              >
                <option value="church_growth">Church Growth & Evangelism</option>
                <option value="worship_music">Worship Services & Music</option>
                <option value="youth_children">Youth & Children Ministries</option>
                <option value="community_outreach">Community Outreach & Welfare</option>
                <option value="facilities_tech">Building Facilities & Technology</option>
                <option value="general_feedback">General Feedback & Suggestions</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#26352f]">Your Idea or Suggestion</label>
              <textarea
                required
                rows={5}
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                placeholder="Describe your idea or suggestion in detail..."
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
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Phone or Email (Optional)</label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="For follow-up conversations"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm text-[#26352f] outline-none focus:border-[#b36b3c]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#b36b3c] py-4 text-center font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-50"
            >
              {submitting ? "Submitting idea..." : "Submit Idea to Church Leadership"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
