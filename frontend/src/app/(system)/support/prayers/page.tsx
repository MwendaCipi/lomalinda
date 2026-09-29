"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { HandHelping, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const prayerFocusCategories = [
  "Intercessory Prayer for Pastoral Team & Leaders",
  "Spiritual Growth & Unity of Church Family",
  "Evangelism & Community Mission",
  "Sick, Bereaved & Vulnerable Members",
  "Church Development & Stewardship",
];

type SupportSubmission = {
  id: number;
  submission_type: string;
  category?: string;
  content: string;
  name?: string;
  created_at?: string;
};

export default function PrayersPage() {
  const [showForm, setShowForm] = useState(false);
  const [submissions, setSubmissions] = useState<SupportSubmission[]>([]);
  const [fetchingList, setFetchingList] = useState(true);

  // Moral support state
  const [prayerCategory, setPrayerCategory] = useState(prayerFocusCategories[0]);
  const [pledgeText, setPledgeText] = useState("");
  const [prayerName, setPrayerName] = useState("");
  const [prayerPhone, setPrayerPhone] = useState("");
  const [prayerEmail, setPrayerEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSubmissions = async () => {
    setFetchingList(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_URL}/api/members/support-submissions/`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data.filter((item: SupportSubmission) => item.submission_type === "prayer") : []);
      } else {
        setSubmissions([]);
      }
    } catch {
      setSubmissions([]);
    } finally {
      setFetchingList(false);
    }
  };

  const handleLookup = async (query?: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    let url = `${API_URL}/api/members/lookup/`;
    if (query) {
      url += `?query=${encodeURIComponent(query)}`;
    } else if (!token) {
      return;
    }
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          setPrayerName((prev) => prev || data.name || "");
          setPrayerPhone((prev) => prev || data.phone_number || "");
          setPrayerEmail((prev) => prev || data.email || "");
        }
      }
    } catch {
      // Ignore lookup errors
    }
  };

  useEffect(() => {
    fetchSubmissions();
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      handleLookup();
    }
  }, []);

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
          "Thank you for supporting SDA Loma Linda in prayer and moral commitment! May God richly bless your faithful dedication.";
        setMessage({ type: "success", text: successText });
        showAlert("Prayer & Moral Support Received", successText, "success");
        setPledgeText("");
        setPrayerName("");
        setPrayerPhone("");
        setPrayerEmail("");
        setShowForm(false);
        fetchSubmissions();
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
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 h-full md:h-full px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {/* The strip names the page; the h1 is for screen readers. */}
              <h1 className="sr-only">Prayer &amp; Moral Support</h1>
              <p className="sr-only">Support SDA Loma Linda through intercessory prayer, encouragement, and spiritual commitment.</p>
            </div>
            {!showForm && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setMessage(null);
                }}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-sage px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sage-deep"
              >
                + Make Prayer Pledge
              </button>
            )}
          </div>

          {message && (
            <div
              className={`mt-6 rounded-2xl p-4 text-sm font-medium ${
                message.type === "success" ? "bg-mist-select text-bark" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8">
                <div className="flex items-center justify-between border-b border-sand-line pb-4 mb-6">
                  <h2 className="text-xl font-semibold text-bark">
                    Make a Prayer Commitment
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-lg p-1.5 text-moss hover:bg-sand hover:text-bark transition"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={handlePrayerSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-bark">Prayer Focus Area</label>
                    <select
                      value={prayerCategory}
                      onChange={(e) => setPrayerCategory(e.target.value)}
                      className="mt-2 w-full rounded-2xl border border-sand-line bg-sand px-4 py-3 text-sm outline-none focus:border-ember"
                    >
                      {prayerFocusCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-bark">
                      Your Prayer Commitment or Words of Encouragement
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={pledgeText}
                      onChange={(e) => setPledgeText(e.target.value)}
                      placeholder="Share a message of moral support, an uplifting Bible promise, or your prayer commitment..."
                      className="mt-2 w-full rounded-2xl border border-sand-line bg-sand px-4 py-3 text-sm outline-none focus:border-ember"
                    />
                  </div>

                  <div className="grid gap-6 sm:grid-cols-3">
                    <div>
                      <label className="block text-sm font-semibold text-bark">Your Name (Optional)</label>
                      <input
                        type="text"
                        value={prayerName}
                        onChange={(e) => setPrayerName(e.target.value)}
                        placeholder="Full name"
                        className="mt-2 w-full rounded-2xl border border-sand-line bg-sand px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-bark">Phone Number (Optional)</label>
                      <input
                        type="tel"
                        value={prayerPhone}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrayerPhone(val);
                          const clean = val.replace(/\D/g, "");
                          if (clean.length === 10) {
                            handleLookup(clean);
                          }
                        }}
                        onBlur={() => {
                          const clean = prayerPhone.replace(/\D/g, "");
                          if (clean.length === 10) {
                            handleLookup(clean);
                          }
                        }}
                        placeholder="07XX XXX XXX"
                        className="mt-2 w-full rounded-2xl border border-sand-line bg-sand px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-bark">Email (Optional)</label>
                      <input
                        type="email"
                        value={prayerEmail}
                        onChange={(e) => setPrayerEmail(e.target.value)}
                        onBlur={() => {
                          if (prayerEmail.includes("@") && prayerEmail.includes(".")) {
                            handleLookup(prayerEmail);
                          }
                        }}
                        placeholder="name@example.com"
                        className="mt-2 w-full rounded-2xl border border-sand-line bg-sand px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 rounded-full bg-sage py-3.5 text-center font-semibold text-white transition hover:bg-sage-deep disabled:opacity-60"
                    >
                      {submitting ? "Submitting Commitment..." : "Submit Prayer Commitment"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="rounded-full border border-sand-mute px-6 py-3.5 font-semibold text-bark transition hover:bg-sand"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <section className="mt-6">
            {fetchingList ? (
              <div className="rounded-3xl border border-sand-line bg-white p-8 text-center text-sm text-moss">
                Loading prayer commitments...
              </div>
            ) : submissions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-sand-mute bg-white p-8 sm:p-12 text-center">
                <HandHelping size={36} className="text-moss-faint" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-semibold text-bark">
                  No prayer commitments added yet
                </h3>
                <p className="mt-1 text-sm text-moss">
                  Make a prayer pledge or moral commitment for our church family.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-full bg-sage px-6 py-3 text-sm font-semibold text-white transition hover:bg-sage-deep"
                >
                  + Make Prayer Pledge
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {submissions.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-2xl border border-sand-line bg-white p-5 shadow-sm space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-moss">
                        <span className="font-semibold text-bark">{item.name || "Church Member"}</span>
                        <span className="capitalize rounded-full bg-mist-select px-2.5 py-1 text-[11px] font-semibold text-sage">
                          {item.category || "Prayer Pledge"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-bark">{item.content}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-moss pt-2 border-t border-sand-line">
                      <span>Received</span>
                      {item.created_at && <span>{new Date(item.created_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
