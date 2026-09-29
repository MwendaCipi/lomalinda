"use client";

import dynamic from "next/dynamic";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { CalendarDays, HandHelping, Home, Phone, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const LocationMapPicker = dynamic(() => import("@/components/location-map-picker"), { ssr: false });

type PrayerItem = {
  id: number;
  name?: string;
  anonymous?: boolean;
  request_text: string;
  created_at: string;
  status?: string;
};

type VisitationItem = {
  id: number;
  requester_name: string;
  phone_number: string;
  email?: string;
  visitation_type: string;
  preferred_date?: string;
  preferred_time?: string;
  notes?: string;
  created_at?: string;
  status?: string;
};

/** One row in the merged table: either kind, tagged. */
type MergedRow =
  | ({ kind: "prayer" } & PrayerItem)
  | ({ kind: "visitation" } & VisitationItem);

type Filter = "all" | "prayer" | "visitation";

function PrayerVisitationContent() {
  const [prayerRequests, setPrayerRequests] = useState<PrayerItem[]>([]);
  const [visitations, setVisitations] = useState<VisitationItem[]>([]);
  const [activeForm, setActiveForm] = useState<null | "prayer" | "visitation">(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [fetchingList, setFetchingList] = useState(true);

  // Prayer form state
  const [requestText, setRequestText] = useState("");
  const [profileName, setProfileName] = useState("");
  const [optionalName, setOptionalName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  // Visitation form state
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

  const fetchAll = async () => {
    setFetchingList(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const [prayerRes, visitRes] = await Promise.allSettled([
      fetch(`${API_URL}/api/members/prayer-requests/`, { headers }),
      fetch(`${API_URL}/api/members/visitations/`, { headers }),
    ]);

    if (prayerRes.status === "fulfilled" && prayerRes.value.ok) {
      const data = await prayerRes.value.json().catch(() => []);
      setPrayerRequests(Array.isArray(data) ? data : []);
    } else {
      setPrayerRequests([]);
    }
    if (visitRes.status === "fulfilled" && visitRes.value.ok) {
      const data = await visitRes.value.json().catch(() => []);
      setVisitations(Array.isArray(data) ? data : []);
    } else {
      setVisitations([]);
    }
    setFetchingList(false);
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
          setVisitationForm((prev) => ({
            ...prev,
            requester_name: prev.requester_name || data.name || "",
            email: prev.email || data.email || "",
            phone_number: prev.phone_number || data.phone_number || "",
          }));
        }
      }
    } catch {
      // Ignore lookup errors
    }
  };

  useEffect(() => {
    fetchAll();
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      setIsLoggedIn(true);
      fetch(`${API_URL}/api/members/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            const name =
              data.full_name ||
              `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
              data.name ||
              data.username ||
              "";
            setProfileName(name);
          }
        })
        .catch(() => {});
      handleLookup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitPrayerRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = localStorage.getItem("access_token");
    setLoading(true);
    setMessage(null);

    let isAnonymous = false;
    let senderName = "";

    if (isLoggedIn) {
      isAnonymous = anonymous;
      if (!isAnonymous && profileName) {
        senderName = profileName;
      }
    } else if (optionalName.trim()) {
      isAnonymous = false;
      senderName = optionalName.trim();
    } else {
      isAnonymous = true;
    }

    const body: Record<string, unknown> = {
      request_text: requestText,
      anonymous: isAnonymous,
    };
    if (senderName) {
      body.name = senderName;
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
        setOptionalName("");
        setAnonymous(false);
        setActiveForm(null);
        setFilter("prayer");
        fetchAll();
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
      const cleanPhone = visitationForm.phone_number.replace(/\D/g, "");
      if (cleanPhone.length !== 10) {
        const text = "Please enter a valid 10-digit phone number (e.g., 0712345678).";
        setMessage({ type: "error", text });
        showAlert("Invalid Phone Number", text, "warning");
        setLoading(false);
        return;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_URL}/api/members/visitations/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...visitationForm, phone_number: cleanPhone }),
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
        setActiveForm(null);
        setFilter("visitation");
        fetchAll();
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

  // One table out of both ledgers, newest first.
  const rows: MergedRow[] = useMemo(() => {
    const merged: MergedRow[] = [
      ...prayerRequests.map((p) => ({ kind: "prayer" as const, ...p })),
      ...visitations.map((v) => ({ kind: "visitation" as const, ...v })),
    ];
    merged.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    if (filter === "all") return merged;
    return merged.filter((r) => r.kind === filter);
  }, [prayerRequests, visitations, filter]);

  const prayerCount = prayerRequests.length;
  const visitationCount = visitations.length;

  const filterButton = (value: Filter, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      className={`h-8 rounded-lg px-3 text-[11px] font-semibold capitalize transition ${
        filter === value
          ? "bg-bark text-white shadow-sm"
          : "text-moss hover:text-bark"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="min-h-screen md:h-screen bg-white text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        <div className="flex-1 min-w-0 h-full md:h-full bg-white p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Prayer &amp; Visitation Requests</h1>
              <p className="mt-1 text-sm text-moss">
                Send a prayer request or ask for a pastoral visit — the church walks with you through both.
              </p>
              {/* The two actions, side by side on every screen. */}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveForm("prayer")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ember-dark"
                >
                  Request Prayer
                </button>
                <button
                  type="button"
                  onClick={() => setActiveForm("visitation")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-sage px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sage-deep"
                >
                  Request Visitation
                </button>
              </div>
            </div>

            {message && (
              <div
                className={`rounded-2xl p-4 text-sm font-medium ${
                  message.type === "success" ? "bg-mist-select text-bark" : "bg-red-50 text-red-700"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* ── Prayer modal ── */}
            {activeForm === "prayer" && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8">
                  <div className="mb-6 flex items-center justify-between border-b border-sand-line pb-4">
                    <h2 className="text-xl font-semibold text-bark">Request Prayer</h2>
                    <button
                      type="button"
                      onClick={() => setActiveForm(null)}
                      className="rounded-lg p-1.5 text-moss transition hover:bg-sand hover:text-bark"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>

                  <form onSubmit={submitPrayerRequest} className="space-y-5">
                    {isLoggedIn && (
                      <label className="flex cursor-pointer items-center gap-3">
                        <div
                          role="checkbox"
                          aria-checked={anonymous}
                          tabIndex={0}
                          onClick={() => setAnonymous(!anonymous)}
                          onKeyDown={(e) => e.key === " " && setAnonymous(!anonymous)}
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            anonymous ? "bg-ember" : "bg-sand-mute"
                          }`}
                        >
                          <span
                            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              anonymous ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </div>
                        <span className="text-sm font-medium">Submit anonymously</span>
                      </label>
                    )}

                    {isLoggedIn && !anonymous && profileName && (
                      <p className="rounded-xl bg-sand px-4 py-2.5 text-xs text-moss">
                        Submitting as <span className="font-semibold text-bark">{profileName}</span>
                      </p>
                    )}

                    {!isLoggedIn && (
                      <label className="block text-xs font-medium text-bark">
                        Your Name <span className="font-normal text-moss">(optional — leave blank to submit anonymously)</span>
                        <input
                          type="text"
                          value={optionalName}
                          onChange={(e) => setOptionalName(e.target.value)}
                          placeholder="e.g. John Doe (or leave blank)"
                          className="mt-1 w-full rounded-xl border border-sand-mute px-4 py-2 text-sm outline-none focus:border-ember"
                        />
                      </label>
                    )}

                    <label className="block text-sm font-medium">
                      Your prayer request
                      <textarea
                        required
                        rows={5}
                        value={requestText}
                        onChange={(event) => setRequestText(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 outline-none focus:border-ember"
                        placeholder="Share what is on your heart..."
                      />
                    </label>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 rounded-full bg-ember px-6 py-3.5 font-semibold text-white transition hover:bg-ember-dark disabled:opacity-60"
                      >
                        {loading ? "Sending..." : "Send Prayer Request"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveForm(null)}
                        className="rounded-full border border-sand-mute px-6 py-3.5 font-semibold text-bark transition hover:bg-sand"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ── Visitation modal ── */}
            {activeForm === "visitation" && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8">
                  <div className="mb-6 flex items-center justify-between border-b border-sand-line pb-4">
                    <h2 className="text-xl font-semibold text-bark">Request a Visit</h2>
                    <button
                      type="button"
                      onClick={() => setActiveForm(null)}
                      className="rounded-lg p-1.5 text-moss transition hover:bg-sand hover:text-bark"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>

                  <form onSubmit={submitVisitationRequest} className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-bark">Full Name</label>
                        <input
                          type="text"
                          required
                          maxLength={160}
                          value={visitationForm.requester_name}
                          onChange={(e) => setVisitationForm({ ...visitationForm, requester_name: e.target.value })}
                          placeholder="Your full name"
                          className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-bark">Phone / Contact Number</label>
                        <input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]{10}"
                          maxLength={10}
                          minLength={10}
                          required
                          value={visitationForm.phone_number}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\D/g, "").slice(0, 10);
                            setVisitationForm({ ...visitationForm, phone_number: clean });
                            if (clean.length === 10) {
                              handleLookup(clean);
                            }
                          }}
                          onBlur={() => {
                            if (visitationForm.phone_number.length === 10) {
                              handleLookup(visitationForm.phone_number);
                            }
                          }}
                          placeholder="07XXXXXXXX"
                          className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-bark">Email (Optional)</label>
                        <input
                          type="email"
                          value={visitationForm.email}
                          onChange={(e) => setVisitationForm({ ...visitationForm, email: e.target.value })}
                          onBlur={() => {
                            if (visitationForm.email.includes("@") && visitationForm.email.includes(".")) {
                              handleLookup(visitationForm.email);
                            }
                          }}
                          placeholder="name@example.com"
                          className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-bark">Type of Visit</label>
                        <select
                          value={visitationForm.visitation_type}
                          onChange={(e) => setVisitationForm({ ...visitationForm, visitation_type: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-sand-mute bg-sand px-4 py-2.5 text-sm outline-none focus:border-ember"
                        >
                          <option value="pastoral">Pastoral Visit</option>
                          <option value="home">Home / Family Visit</option>
                          <option value="hospital">Hospital / Sick Visit</option>
                          <option value="bereavement">Bereavement Support</option>
                          <option value="other">Other Concern</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-semibold text-bark">Preferred Date (Optional)</label>
                        <input
                          type="date"
                          value={visitationForm.preferred_date}
                          onChange={(e) => setVisitationForm({ ...visitationForm, preferred_date: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-bark">Preferred Time (Optional)</label>
                        <input
                          type="time"
                          value={visitationForm.preferred_time}
                          onChange={(e) => setVisitationForm({ ...visitationForm, preferred_time: e.target.value })}
                          className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-bark">Location Coordinates (Click map to pin)</label>
                      <div className="mt-2 overflow-hidden rounded-2xl border border-sand-mute">
                        <LocationMapPicker
                          latitude={visitationForm.latitude}
                          longitude={visitationForm.longitude}
                          onChange={(lat, lng) => setVisitationForm({ ...visitationForm, latitude: lat, longitude: lng })}
                          onClear={() => setVisitationForm({ ...visitationForm, latitude: null, longitude: null })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-bark">Notes or Special Instructions (Optional)</label>
                      <textarea
                        rows={3}
                        value={visitationForm.notes}
                        onChange={(e) => setVisitationForm({ ...visitationForm, notes: e.target.value })}
                        placeholder="Add any additional details, directions, or prayer needs..."
                        className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveForm(null)}
                        className="rounded-full border border-sand-mute px-6 py-3.5 font-semibold text-bark transition hover:bg-sand"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 rounded-full bg-sage py-3.5 text-center font-semibold text-white transition hover:bg-sage-deep disabled:opacity-60"
                      >
                        {loading ? "Submitting..." : "Submit Request"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ── The merged table ── */}
            <section>
              {/* Filter: all, or one of the two kinds. */}
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex h-9 items-center rounded-xl border border-sand-line bg-sand p-0.5" role="group" aria-label="Filter requests">
                  {filterButton("all", `All (${prayerCount + visitationCount})`)}
                  {filterButton("prayer", `Prayer (${prayerCount})`)}
                  {filterButton("visitation", `Visitation (${visitationCount})`)}
                </div>
              </div>

              {fetchingList ? (
                <div className="rounded-3xl border border-sand-line bg-white p-8 text-center text-sm text-moss">
                  Loading requests...
                </div>
              ) : rows.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-sand-mute bg-white p-8 text-center sm:p-12">
                  <HandHelping size={36} className="text-moss-faint" aria-hidden="true" />
                  <h3 className="mt-3 text-lg font-semibold text-bark">
                    {filter === "all" ? "No requests yet" : filter === "prayer" ? "No prayer requests yet" : "No visitation requests yet"}
                  </h3>
                  <p className="mt-1 text-sm text-moss">
                    Use the buttons above to send a prayer request or arrange a pastoral visit.
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {rows.map((row) =>
                    row.kind === "prayer" ? (
                      <div key={`p-${row.id}`} className="flex flex-col justify-between space-y-3 rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
                        <div>
                          <div className="flex items-center justify-between text-xs text-moss">
                            <span className="rounded-full bg-ember/10 px-2.5 py-1 font-semibold text-ember">Prayer</span>
                            {row.created_at && <span>{new Date(row.created_at).toLocaleDateString()}</span>}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-bark">{row.request_text}</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-sand-line pt-2 text-xs text-moss">
                          <span>
                            {row.anonymous ? "Anonymous" : row.name || "Church member"} ·{" "}
                            <strong className="capitalize text-sage">{row.status || "Received"}</strong>
                          </span>
                          <span className="inline-flex items-center gap-1"><HandHelping size={12} aria-hidden="true" /> Praying</span>
                        </div>
                      </div>
                    ) : (
                      <div key={`v-${row.id}`} className="flex flex-col justify-between space-y-3 rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
                        <div>
                          <div className="flex items-center justify-between text-xs text-moss">
                            <span className="rounded-full bg-sage/10 px-2.5 py-1 font-semibold capitalize text-sage-bright">
                              {row.visitation_type} visit
                            </span>
                            {row.created_at && <span>{new Date(row.created_at).toLocaleDateString()}</span>}
                          </div>
                          <p className="mt-2 text-sm font-semibold text-bark">{row.requester_name}</p>
                          <p className="mt-0.5 text-xs text-moss">
                            <Phone size={11} className="inline" aria-hidden="true" /> {row.phone_number}
                            {(row.preferred_date || row.preferred_time) &&
                              ` · ${row.preferred_date || ""} ${row.preferred_time || ""}`}
                          </p>
                          {row.notes && (
                            <p className="mt-2 text-xs italic leading-relaxed text-bark">&ldquo;{row.notes}&rdquo;</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between border-t border-sand-line pt-2 text-xs text-moss">
                          <span>
                            Status: <strong className="capitalize text-ember">{row.status || "Pending care team"}</strong>
                          </span>
                          <span className="inline-flex items-center gap-1"><Home size={12} aria-hidden="true" /> Visit</span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>

            <blockquote className="border-l-2 border-ember pl-6 text-lg leading-7 text-moss-dark">
              &ldquo;Prayer is the opening of the heart to God as to a friend.&rdquo;
              <footer className="mt-2 text-sm font-semibold text-ember">
                &mdash; Ellen G. White, <cite>Steps to Christ</cite>
              </footer>
            </blockquote>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function PrayerVisitationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-moss">
          Loading requests...
        </main>
      }
    >
      <PrayerVisitationContent />
    </Suspense>
  );
}
