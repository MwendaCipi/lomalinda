"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

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
          "Thank you for supporting Loma Linda SDA Church in prayer and moral commitment! May God richly bless your faithful dedication.";
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
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Prayer &amp; Moral Support
              </h1>
              <p className="hidden sm:block mt-2 text-sm leading-6 text-[#617068]">
                Support Loma Linda SDA Church through intercessory prayer, encouragement, and spiritual commitment.
              </p>
            </div>
            {!showForm && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setMessage(null);
                }}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#5f8067] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4d6d55]"
              >
                + Make Prayer Pledge
              </button>
            )}
          </div>

          {message && (
            <div
              className={`mt-6 rounded-2xl p-4 text-sm font-medium ${
                message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#dfdbd1] bg-white p-6 shadow-2xl sm:p-8">
                <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4 mb-6">
                  <h2 className="text-xl font-semibold text-[#26352f]">
                    Make a Prayer Commitment
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-lg p-1.5 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f] transition"
                  >
                    ✕
                  </button>
                </div>

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
                      placeholder="Share a message of moral support, an uplifting Bible promise, or your prayer commitment..."
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
                        className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#26352f]">Email (Optional)</label>
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
                        className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 rounded-full bg-[#5f8067] py-3.5 text-center font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
                    >
                      {submitting ? "Submitting Commitment..." : "Submit Prayer Commitment"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="rounded-full border border-[#c9c5bb] px-6 py-3.5 font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
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
              <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
                Loading prayer commitments...
              </div>
            ) : submissions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                <span className="text-4xl" aria-hidden="true">🙏</span>
                <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                  No prayer commitments added yet
                </h3>
                <p className="mt-1 text-sm text-[#617068]">
                  Make a prayer pledge or moral commitment for our church family.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-full bg-[#5f8067] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4d6d55]"
                >
                  + Make Prayer Pledge
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {submissions.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-[#617068]">
                        <span className="font-semibold text-[#26352f]">{item.name || "Church Member"}</span>
                        <span className="capitalize rounded-full bg-[#eef2ed] px-2.5 py-1 text-[11px] font-semibold text-[#5f8067]">
                          {item.category || "Prayer Pledge"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[#26352f]">{item.content}</p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#617068] pt-2 border-t border-[#dfdbd1]">
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
