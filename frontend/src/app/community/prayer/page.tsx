"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const LocationMapPicker = dynamic(() => import("@/components/location-map-picker"), { ssr: false });

type RequestTab = "prayer" | "visitation";

function PrayerAndVisitationContent() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: RequestTab = rawTab === "visitation" || rawTab === "visit" ? "visitation" : "prayer";

  const [tab, setTab] = useState<RequestTab>(initialTab);

  // Prayer state
  const [requestText, setRequestText] = useState("");
  const [prayerName, setPrayerName] = useState("");
  const [prayerPhone, setPrayerPhone] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  // Visitation state
  const [visitationForm, setVisitationForm] = useState({
    requester_name: "",
    phone_number: "",
    email: "",
    visitation_type: "pastoral",
    preferred_date: "",
    preferred_time: "",
    latitude: null as number | null,
    longitude: null as number | null,
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (rawTab) {
      if (rawTab === "visitation" || rawTab === "visit") setTab("visitation");
      else setTab("prayer");
    }
  }, [rawTab]);

  async function submitPrayerRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("access_token");
    setLoading(true);
    setMessage(null);

    const body: Record<string, unknown> = { request_text: requestText, anonymous };
    if (!anonymous) {
      if (prayerName) body.name = prayerName;
      if (prayerPhone) body.phone_number = prayerPhone;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_URL}/api/members/prayer-requests/`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const text = "Your prayer request has been received. Our pastoral prayer team will pray with and for you.";
        setMessage({ type: "success", text });
        showAlert("Prayer Request Received", text, "success");
        setRequestText("");
        setPrayerName("");
        setPrayerPhone("");
      } else {
        const errorData = await response.json().catch(() => ({}));
        const text = errorData.detail || "We could not submit your prayer request. Please check the form.";
        setMessage({ type: "error", text });
        showAlert("Request Error", text, "error");
      }
    } catch {
      const text = "Network error. Please try again.";
      setMessage({ type: "error", text });
      showAlert("Network Error", text, "error");
    } finally {
      setLoading(false);
    }
  }

  async function submitVisitationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("access_token");
    setLoading(true);
    setMessage(null);

    try {
      if (visitationForm.latitude === null || visitationForm.longitude === null) {
        const text = "Please pin your location on the map before submitting.";
        setMessage({ type: "error", text });
        showAlert("Location Required", text, "warning");
        setLoading(false);
        return;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_URL}/api/members/visitations/`, {
        method: "POST",
        headers,
        body: JSON.stringify(visitationForm),
      });

      if (response.ok) {
        const text =
          "Thank you! Your visitation request has been submitted. Our pastoral elders and care team will connect with you shortly.";
        setMessage({ type: "success", text });
        showAlert("Visitation Request Received", text, "success");
        setVisitationForm({
          requester_name: "",
          phone_number: "",
          email: "",
          visitation_type: "pastoral",
          preferred_date: "",
          preferred_time: "",
          latitude: null,
          longitude: null,
          notes: "",
        });
      } else {
        const data = await response.json().catch(() => ({}));
        const text = data.detail || "Unable to submit visitation request. Please verify inputs.";
        setMessage({ type: "error", text });
        showAlert("Request Error", text, "error");
      }
    } catch {
      const text = "Network error. Please try again.";
      setMessage({ type: "error", text });
      showAlert("Network Error", text, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/requests"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Requests</span>
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          {tab === "prayer" ? "Prayer Request" : "Request Visitation"}
        </h1>
        <p className="mt-3 text-lg leading-8 text-[#617068]">
          {tab === "prayer"
            ? "You do not have to carry it alone."
            : "Request us to visit and pray with you."}
        </p>

        {/* 2 Toggles */}
        <div className="mt-6 flex rounded-2xl bg-[#eef2ed] p-1 gap-1 max-w-md">
          <button
            type="button"
            onClick={() => {
              setTab("prayer");
              setMessage(null);
            }}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === "prayer" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
            }`}
          >
            Prayer Request
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("visitation");
              setMessage(null);
            }}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === "visitation" ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
            }`}
          >
            Request Visitation
          </button>
        </div>

        <section className="mt-6 rounded-3xl border border-[#dfdbd1] bg-white p-5 shadow-sm ring-1 ring-[#dfdbd1] sm:p-8">
          {message && (
            <div
              className={`mb-6 rounded-2xl p-4 text-sm font-medium ${
                message.type === "success" ? "bg-[#eef2ed] text-[#26352f]" : "bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {tab === "prayer" ? (
            <form onSubmit={submitPrayerRequest} className="space-y-5">
              {/* Anonymous toggle */}
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  role="checkbox"
                  aria-checked={anonymous}
                  tabIndex={0}
                  onClick={() => setAnonymous(!anonymous)}
                  onKeyDown={(e) => e.key === " " && setAnonymous(!anonymous)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    anonymous ? "bg-[#b36b3c]" : "bg-[#c9c5bb]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      anonymous ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </div>
                <span className="text-sm font-medium">Submit anonymously</span>
              </label>

              {/* Name & phone — hidden when anonymous */}
              {!anonymous && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Your name
                    <input
                      type="text"
                      value={prayerName}
                      onChange={(e) => setPrayerName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                      placeholder="Optional"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Phone number
                    <input
                      type="tel"
                      value={prayerPhone}
                      onChange={(e) => setPrayerPhone(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 outline-none focus:border-[#b36b3c]"
                      placeholder="07XX XXX XXX"
                    />
                  </label>
                </div>
              )}

              <label className="block text-sm font-medium">
                Your prayer request
                <textarea
                  required
                  rows={4}
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 outline-none focus:border-[#b36b3c]"
                  placeholder="Share what is on your heart..."
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-[#b36b3c] px-6 py-3.5 font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send Prayer Request"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitVisitationRequest} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Full Name</label>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={visitationForm.requester_name}
                    onChange={(e) => setVisitationForm({ ...visitationForm, requester_name: e.target.value })}
                    placeholder="Your full name"
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Phone / Contact Number</label>
                  <input
                    type="tel"
                    required
                    maxLength={40}
                    value={visitationForm.phone_number}
                    onChange={(e) => setVisitationForm({ ...visitationForm, phone_number: e.target.value })}
                    placeholder="e.g. 07XX XXX XXX"
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Type of Visitation</label>
                  <select
                    value={visitationForm.visitation_type}
                    onChange={(e) => setVisitationForm({ ...visitationForm, visitation_type: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                  >
                    <option value="pastoral">Pastoral Care &amp; Prayer</option>
                    <option value="sick">Sick / Hospital Visitation</option>
                    <option value="bereavement">Bereavement / Grief Support</option>
                    <option value="family">Home Blessing / Family Visit</option>
                    <option value="other">Other Request</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Email Address (Optional)</label>
                  <input
                    type="email"
                    value={visitationForm.email}
                    onChange={(e) => setVisitationForm({ ...visitationForm, email: e.target.value })}
                    placeholder="Email address"
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Preferred Date (Optional)</label>
                  <input
                    type="date"
                    value={visitationForm.preferred_date}
                    onChange={(e) => setVisitationForm({ ...visitationForm, preferred_date: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#26352f]">Preferred Time (Optional)</label>
                  <input
                    type="text"
                    value={visitationForm.preferred_time}
                    onChange={(e) => setVisitationForm({ ...visitationForm, preferred_time: e.target.value })}
                    placeholder="e.g. Afternoon, 4:00 PM, Sabbath evening"
                    className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f] mb-2">Pin Location</label>
                <LocationMapPicker
                  latitude={visitationForm.latitude}
                  longitude={visitationForm.longitude}
                  onChange={(lat, lng) => setVisitationForm({ ...visitationForm, latitude: lat, longitude: lng })}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">
                  Additional Notes or Special Needs (Optional)
                </label>
                <textarea
                  rows={3}
                  value={visitationForm.notes}
                  onChange={(e) => setVisitationForm({ ...visitationForm, notes: e.target.value })}
                  placeholder="Any special details for the elders or care team..."
                  className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-[#5f8067] py-3.5 text-center font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
              >
                {loading ? "Submitting..." : "Submit Visitation Request"}
              </button>
            </form>
          )}
        </section>

        {tab === "prayer" && (
          <blockquote className="mt-8 border-l-2 border-[#b36b3c] pl-6 text-lg leading-7 text-[#3d5148]">
            &ldquo;Prayer is the opening of the heart to God as to a friend.&rdquo;
            <footer className="mt-2 text-sm font-semibold text-[#b36b3c]">
              &mdash; Ellen G. White, <cite>Steps to Christ</cite>
            </footer>
          </blockquote>
        )}
      </div>
    </main>
  );
}

export default function CommunityPrayerPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">
          Loading request options...
        </main>
      }
    >
      <PrayerAndVisitationContent />
    </Suspense>
  );
}
