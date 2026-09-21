"use client";

import { useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const ideaCategories = [
  "General Church Growth & Ministry",
  "Worship & Sabbath Services",
  "Youth & Children Programs",
  "Community Outreach & Welfare",
  "Church Infrastructure & Technology",
  "Fellowship & Hospitality",
];

type SupportSubmission = {
  id: number;
  submission_type: string;
  category?: string;
  content: string;
  name?: string;
  created_at?: string;
};

export default function IdeasPage() {
  const [showForm, setShowForm] = useState(false);
  const [submissions, setSubmissions] = useState<SupportSubmission[]>([]);
  const [fetchingList, setFetchingList] = useState(true);

  // Ideas state
  const [ideaCategory, setIdeaCategory] = useState(ideaCategories[0]);
  const [ideaText, setIdeaText] = useState("");
  const [ideaName, setIdeaName] = useState("");
  const [ideaContact, setIdeaContact] = useState("");

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
        setSubmissions(Array.isArray(data) ? data.filter((item: SupportSubmission) => item.submission_type === "idea") : []);
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
          setIdeaName((prev) => prev || data.name || "");
          setIdeaContact((prev) => prev || data.phone_number || data.email || "");
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
        setShowForm(false);
        fetchSubmissions();
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

  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] px-4 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Ideas &amp; Suggestions
              </h1>
              <p className="hidden sm:block mt-2 text-sm leading-6 text-[#617068]">
                Share ideas, feedback, or innovative proposals to help Loma Linda SDA Church grow and improve ministry.
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
                + Share Idea
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
                    Submit an Idea or Suggestion
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-lg p-1.5 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f] transition"
                  >
                    ✕
                  </button>
                </div>

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
                    <label className="block text-sm font-semibold text-[#26352f]">
                      Your Idea, Suggestion, or Proposal
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={ideaText}
                      onChange={(e) => setIdeaText(e.target.value)}
                      placeholder="Describe your suggestion in detail, how it can be implemented, and its expected impact on church life..."
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
                      <label className="block text-sm font-semibold text-[#26352f]">
                        Phone Number / Email (Optional)
                      </label>
                      <input
                        type="text"
                        value={ideaContact}
                        onChange={(e) => {
                          const val = e.target.value;
                          setIdeaContact(val);
                          const cleanPhone = val.replace(/\D/g, "");
                          if (cleanPhone.length === 10) {
                            handleLookup(cleanPhone);
                          }
                        }}
                        onBlur={() => {
                          if (ideaContact.includes("@") && ideaContact.includes(".")) {
                            handleLookup(ideaContact);
                          } else {
                            const cleanPhone = ideaContact.replace(/\D/g, "");
                            if (cleanPhone.length === 10) {
                              handleLookup(cleanPhone);
                            }
                          }
                        }}
                        placeholder="e.g. 07XX XXX XXX or name@example.com"
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
                      {submitting ? "Submitting Idea..." : "Submit Idea"}
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
                Loading ideas...
              </div>
            ) : submissions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                <span className="text-4xl" aria-hidden="true">💡</span>
                <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                  No ideas or suggestions added yet
                </h3>
                <p className="mt-1 text-sm text-[#617068]">
                  Share your insights to help our church grow and improve ministry.
                </p>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 rounded-full bg-[#5f8067] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4d6d55]"
                >
                  + Share Idea
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
                          {item.category || "General"}
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
    </div>
  </main>
  );
}
