"use client";

import { FormEvent, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { dayFirstTime } from "@/lib/dates";
import { Sparkles } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const ideaCategories = [
  "General Church Growth & Ministry",
  "Worship & Sabbath Services",
  "Youth & Children Programs",
  "Community Outreach & Welfare",
  "Church Infrastructure & Technology",
  "Fellowship & Hospitality",
];

interface ApprovedTestimony {
  id: number;
  name: string;
  testimony_text: string;
  created_at: string;
}

/**
 * What a member sees while nothing is on the board.
 *
 * There used to be a single line of grey text here — "No testimonies have been
 * published yet" — which named the absence without offering a way out of it.
 * The empty board is the moment to invite the first share, so the way in sits
 * right here: one button, and the share sheet asks what is being shared.
 */
function EmptySharing({
  searching,
  onShare,
}: {
  searching: boolean;
  onShare: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-sand-mute bg-white px-6 py-10 text-center shadow-sm sm:py-12">
      <Sparkles size={36} className="text-moss-faint" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-bark sm:text-lg">
        {searching ? "Nothing matches your search" : "Nothing shared yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-moss">
        {searching
          ? "Try a different name or word, or clear the search to read everything shared here."
          : "Be the first to tell the church family what God has done — or to offer an idea that could help the church. Share it here now."}
      </p>
      <div className="mx-auto mt-6 max-w-sm">
        <button
          type="button"
          onClick={onShare}
          className="w-full rounded-full bg-sage px-4 py-3 text-sm font-semibold text-white transition hover:bg-sage-deep"
        >
          Share Now
        </button>
      </div>
    </div>
  );
}

/**
 * Sharing — the church family's stories and its ideas in one place.
 *
 * One button opens the share sheet, which asks what is being offered: a
 * testimony of what God has done, or an idea that could help the church.
 * The board below reads the testimonies.
 */
export default function TestimoniesPage() {
  const [testimony, setTestimony] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // Read once at render, not inside the effect: localStorage is a
  // synchronous external value, so it needs no effect to mirror it. Guarded
  // for the server, which has no window during static prerender.
  const [isLoggedIn] = useState(() => typeof window !== "undefined" && Boolean(localStorage.getItem("access_token")));
  const [shareModalOpen, setShareModalOpen] = useState(false);
  // Which thing the share sheet is collecting: a testimony of what God has
  // done, or an idea that could help the church.
  const [shareKind, setShareKind] = useState<"testimony" | "idea">("testimony");
  const [searchQuery, setSearchQuery] = useState("");
  const [approvedTestimonies, setApprovedTestimonies] = useState<ApprovedTestimony[]>([]);

  const [ideaCategory, setIdeaCategory] = useState(ideaCategories[0]);
  const [ideaText, setIdeaText] = useState("");
  const [ideaName, setIdeaName] = useState("");
  const [ideaContact, setIdeaContact] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
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
          testimony_text: testimony.trim(),
          name: name.trim(),
          phone_number: "",
          request_type: "online",
          requested_date: null,
          requested_time: "",
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorDetail = errorData.detail || errorData.message || (typeof errorData === "object" ? Object.values(errorData).flat().join(" ") : "") || "Could not submit your testimony.";
        throw new Error(errorDetail);
      }
      const successText = isLoggedIn ? "Thank you for sharing your testimony." : "Thank you. Your testimony has been submitted for admin approval.";
      setMessage(successText);
      showAlert("Testimony Submitted", successText, "success");
      setTestimony("");
      setName("");
      setShareModalOpen(false);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "We could not submit your testimony. Please try again.";
      setMessage(errorText);
      showAlert("Submission Error", errorText, "error");
    } finally {
      setLoading(false);
    }
  }

  /** The share sheet's other half: an idea, offered for the board's review. */
  async function submitIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const response = await fetch(`${API_URL}/api/members/support-submissions/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          submission_type: "idea",
          category: ideaCategory,
          content: ideaText.trim(),
          name: ideaName.trim(),
          phone_number: ideaContact.trim(),
        }),
      });
      if (!response.ok) throw new Error("Unable to submit your idea. Please check the form details.");
      const successText = "Thank you for sharing your ideas and suggestions. The church board and ministry leaders will review your feedback.";
      setMessage(successText);
      showAlert("Idea Submitted", successText, "success");
      setIdeaText("");
      setIdeaName("");
      setIdeaContact("");
      setShareModalOpen(false);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Network error. Please try again.";
      setMessage(errorText);
      showAlert("Submission Error", errorText, "error");
    } finally {
      setLoading(false);
    }
  }

  function startSharing() {
    setShareKind("testimony");
    setShareModalOpen(true);
    setMessage("");
  }

  const sharingIdea = shareKind === "idea";

  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 h-full md:h-full p-4 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
        <section className="mt-3">
          <h2 className="text-lg font-bold text-bark">Testimonies</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="block text-sm font-medium sm:w-72">Search testimonies
              <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name or words" className="mt-2 w-full rounded-xl border border-sand-mute bg-white px-4 py-3 outline-none focus:border-ember" />
            </label>
          </div>
          <div className="mt-4">
            {filteredTestimonies.length === 0 ? (
              <EmptySharing
                searching={approvedTestimonies.length > 0}
                onShare={startSharing}
              />
            ) : (
              <>
              {/* PC Desktop Table View (visible on md and up) */}
              <div className="hidden md:block overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
                <div className="overflow-x-auto custom-table-scrollbar">
                  <table className="w-full min-w-[42rem] text-left text-sm">
                    <thead className="bg-sand text-xs uppercase tracking-wide text-moss"><tr><th className="px-5 py-3 font-semibold">Name</th><th className="px-5 py-3 font-semibold">Testimony</th><th className="px-5 py-3 font-semibold">Date</th></tr></thead>
                    <tbody className="divide-y divide-sand-line">
                      {filteredTestimonies.map((item) => <tr key={item.id} className="align-top"><td className="px-5 py-4 font-semibold">{item.name || "Church Member"}</td><td className="max-w-xl px-5 py-4 leading-6 text-moss">{item.testimony_text}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-moss">{dayFirstTime(item.created_at)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Testimonies Cards View (visible on mobile only) */}
              <div className="grid gap-4 md:hidden">
                {filteredTestimonies.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-white p-5 border border-sand-line shadow-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-bark">{item.name || "Church Member"}</h3>
                      <span className="text-[11px] text-moss">{dayFirstTime(item.created_at)}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-moss">{item.testimony_text}</p>
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        </section>

        {/* With nothing on the board the button lives inside the empty panel,
            so it is not printed twice in a row. */}
        {filteredTestimonies.length > 0 && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={startSharing} className="rounded-full bg-sage px-8 py-3 text-sm font-semibold text-white transition hover:bg-sage-deep">Share Now</button>
          </div>
        )}

        {shareModalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-bark/50 px-5" role="dialog" aria-modal="true" aria-labelledby="share-title">
          <form onSubmit={sharingIdea ? submitIdea : submitTestimony} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><h2 id="share-title" className="text-xl font-semibold sm:text-2xl">Share</h2><p className="mt-2 text-sm leading-6 text-moss">{sharingIdea ? "Offer an idea, a suggestion or a proposal that could help the church." : "Tell the church family what God has done in your life."}</p></div><button type="button" onClick={() => { setShareModalOpen(false); setMessage(""); }} className="text-xl text-moss" aria-label="Close">&times;</button></div>

            {/* One sheet, two things to share: pick which. */}
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-full bg-sand p-1">
              <button
                type="button"
                onClick={() => { setShareKind("testimony"); setMessage(""); }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${sharingIdea ? "text-moss hover:text-bark" : "bg-white text-bark shadow-sm"}`}
              >
                Testimony
              </button>
              <button
                type="button"
                onClick={() => { setShareKind("idea"); setMessage(""); }}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${sharingIdea ? "bg-white text-bark shadow-sm" : "text-moss hover:text-bark"}`}
              >
                Idea
              </button>
            </div>

            {sharingIdea ? (
              <>
                <label className="mt-4 block text-sm font-medium">Category
                  <select value={ideaCategory} onChange={(event) => setIdeaCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-sand-mute bg-white px-4 py-3 text-sm outline-none focus:border-ember">
                    {ideaCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-medium">Your Idea, Suggestion, or Proposal
                  <textarea required rows={5} maxLength={2000} value={ideaText} onChange={(event) => setIdeaText(event.target.value)} className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 outline-none focus:border-ember" placeholder="Describe your suggestion, how it can be implemented, and its expected impact on church life..." />
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium">Your Name <span className="font-normal text-moss">(Optional)</span><input type="text" maxLength={160} value={ideaName} onChange={(event) => setIdeaName(event.target.value)} className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 outline-none focus:border-ember" placeholder="Enter your name" /></label>
                  <label className="block text-sm font-medium">Phone / Email <span className="font-normal text-moss">(Optional)</span><input type="text" maxLength={160} value={ideaContact} onChange={(event) => setIdeaContact(event.target.value)} className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 outline-none focus:border-ember" placeholder="e.g. 07XX XXX XXX or name@example.com" /></label>
                </div>
              </>
            ) : (
              <>
                <label className="mt-4 block text-sm font-medium">Your Name<input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 outline-none focus:border-ember" placeholder="Enter your name" /></label>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <label htmlFor="share-testimony-text">Your Testimony</label>
                    <span className="text-xs text-moss">{testimony.length} / 1000 characters</span>
                  </div>
                  <textarea id="share-testimony-text" required maxLength={1000} rows={5} value={testimony} onChange={(event) => setTestimony(event.target.value)} className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 outline-none focus:border-ember" placeholder="Tell us what God has done in your life..." />
                </div>
              </>
            )}

            <button disabled={loading} className="mt-5 w-full rounded-full bg-sage px-5 py-3 font-semibold text-white transition hover:bg-sage-deep disabled:opacity-60">{loading ? "Sending..." : sharingIdea ? "Submit Idea" : "Share testimony"}</button>
            {message && <p className="mt-4 rounded-2xl bg-sand p-4 text-sm leading-6 text-moss">{message}</p>}
          </form>
        </div>}
        {message && !shareModalOpen && (
          <p className="mt-5 rounded-2xl bg-white p-4 text-sm leading-6 text-moss shadow-sm ring-1 ring-sand-line">{message}</p>
        )}
          </div>
        </div>
      </div>
    </main>
  );
}
