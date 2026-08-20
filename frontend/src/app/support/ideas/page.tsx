"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ideaCategories = [
  "General Church Growth & Ministry",
  "Worship & Sabbath Services",
  "Youth & Children Programs",
  "Community Outreach & Welfare",
  "Church Infrastructure & Technology",
  "Fellowship & Hospitality",
];

const prayerFocusCategories = [
  "Intercessory Prayer for Pastoral Team & Leaders",
  "Spiritual Growth & Unity of Church Family",
  "Evangelism & Community Mission",
  "Sick, Bereaved & Vulnerable Members",
  "Church Development & Stewardship",
];

type SupportTab = "ideas" | "prayers";

function IdeasAndMoralSupportContent() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: SupportTab = rawTab === "prayers" || rawTab === "prayer" || rawTab === "moral" ? "prayers" : "ideas";

  const [tab, setTab] = useState<SupportTab>(initialTab);

  // Ideas state
  const [ideaCategory, setIdeaCategory] = useState(ideaCategories[0]);
  const [ideaText, setIdeaText] = useState("");
  const [ideaName, setIdeaName] = useState("");
  const [ideaContact, setIdeaContact] = useState("");

  // Moral support state
  const [prayerCategory, setPrayerCategory] = useState(prayerFocusCategories[0]);
  const [pledgeText, setPledgeText] = useState("");
  const [prayerName, setPrayerName] = useState("");
  const [prayerPhone, setPrayerPhone] = useState("");
  const [prayerEmail, setPrayerEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (rawTab) {
      if (rawTab === "prayers" || rawTab === "prayer" || rawTab === "moral") setTab("prayers");
      else setTab("ideas");
    }
  }, [rawTab]);

  const handleIdeaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    setSubmitting(true);
    setMessage(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/members/support-submissions/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          submission_type: "idea",
          category: ideaCategory,
          content: ideaText,
          name: ideaName,
          phone_number: ideaContact,
        }),
      });

      if (res.ok) {
        const successText =
          "Thank you for sharing your ideas and suggestions for Loma Linda SDA Church! Our church board and ministry leaders will carefully review your feedback.";
        setMessage({ type: "success", text: successText });
        showAlert("Idea Submitted", successText, "success");
        setIdeaText("");
        setIdeaName("");
        setIdeaContact("");
      } else {
        const errorText = "Unable to submit your idea. Please check the form details.";
        setMessage({ type: "error", text: errorText });
        showAlert("Submission Error", errorText, "error");
      }
    } catch {
      const errorText = "Network error. Please try again.";
      setMessage({ type: "error", text: errorText });
      showAlert("Network Error", errorText, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    setSubmitting(true);
    setMessage(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_URL}/api/members/support-submissions/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          submission_type: "prayer",
          category: prayerCategory,
          content: pledgeText,
          name: prayerName,
          phone_number: prayerPhone,
          email: prayerEmail,
        }),
      });

      if (res.ok) {
        const successText =
          "Thank you for supporting Loma Linda SDA Church in prayer and moral commitment! May God richly bless your faithful dedication.";
        setMessage({ type: "success", text: successText });
        showAlert("Prayer & Moral Support Received", successText, "success");
        setPledgeText("");
        setPrayerName("");
        setPrayerPhone("");
        setPrayerEmail("");
      } else {
        const data = await res.json().catch(() => ({}));
        const errorText = data.detail || "Unable to record your pledge. Please check form inputs.";
        setMessage({ type: "error", text: errorText });
        showAlert("Submission Error", errorText, "error");
      }
    } catch {
      const errorText = "Network error. Please try again.";
      setMessage({ type: "error", text: errorText });
      showAlert("Network Error", errorText, "error");
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
          <span>Back to Stewardship &amp; Support</span>
        </Link>

        <div className="mt-6">
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {tab === "ideas" ? "Share Ideas & Suggestions" : "Prayer & Moral Support"}
          </h1>
          <p className="mt-3 text-base leading-7 text-[#617068]">
            {tab === "ideas"
              ? "We value your insights! Share ideas, feedback, or innovative proposals to help Loma Linda SDA Church grow, improve ministry, and serve our community better."
              : "Support Loma Linda SDA Church through faithful intercessory prayer, pastoral encouragement, evangelism backing, and spiritual moral support."}
          </p>
        </div>

        {/* 2 Toggles */}
        <div className="mt-6 flex rounded-2xl bg-[#eef2ed] p-1 gap-1 max-w-md">
          <button
            type="button"
            onClick={() => {
              setTab("ideas");
              setMessage(null);
            }}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === "ideas" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
            }`}
          >
            Ideas & Suggestions
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("prayers");
              setMessage(null);
            }}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === "prayers" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
            }`}
          >
            Prayer & Moral Support
          </button>
        </div>

        {/* Form Card */}
        <div className="mt-6 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-10">
          {message && (
            <div
              className={`mb-6 rounded-2xl p-4 text-sm font-medium ${
                message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {tab === "ideas" ? (
            <form onSubmit={handleIdeaSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Category</label>
                <select
                  value={ideaCategory}
                  onChange={(e) => setIdeaCategory(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                >
                  {ideaCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Your Idea, Suggestion, or Proposal</label>
                <textarea
                  required
                  rows={5}
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  placeholder="Describe your suggestion in detail, how it can be implemented, and its expected impact on church life or community..."
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Your Name (Optional)</label>
                  <input
                    type="text"
                    value={ideaName}
                    onChange={(e) => setIdeaName(e.target.value)}
                    placeholder="Enter your name"
                    className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Phone Number / Email (Optional)</label>
                  <input
                    type="text"
                    value={ideaContact}
                    onChange={(e) => setIdeaContact(e.target.value)}
                    placeholder="e.g. 07XX XXX XXX or name@example.com"
                    className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-[#5f8067] py-4 text-center font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60 sm:col-start-2"
                >
                  {submitting ? "Submitting Idea..." : "Submit Idea"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePrayerSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Prayer Focus Area</label>
                <select
                  value={prayerCategory}
                  onChange={(e) => setPrayerCategory(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                >
                  {prayerFocusCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">
                  Your Prayer Commitment or Words of Encouragement
                </label>
                <textarea
                  required
                  rows={4}
                  value={pledgeText}
                  onChange={(e) => setPledgeText(e.target.value)}
                  placeholder="Share a message of moral support, an uplifting Bible promise, or the prayer commitment you are making for our church..."
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Your Name (Optional)</label>
                  <input
                    type="text"
                    value={prayerName}
                    onChange={(e) => setPrayerName(e.target.value)}
                    placeholder="Full name"
                    className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={prayerPhone}
                    onChange={(e) => setPrayerPhone(e.target.value)}
                    placeholder="07XX XXX XXX"
                    className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Email (Optional)</label>
                  <input
                    type="email"
                    value={prayerEmail}
                    onChange={(e) => setPrayerEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-[#5f8067] py-4 text-center font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60 sm:col-start-2"
                >
                  {submitting ? "Submitting Pledge..." : "Submit Prayer Support"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function IdeasAndMoralSupportPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
          Loading support options...
        </main>
      }
    >
      <IdeasAndMoralSupportContent />
    </Suspense>
  );
}
