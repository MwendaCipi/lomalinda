"use client";

import dynamic from "next/dynamic";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { showAlert } from "@/lib/alerts";
import { RequestsSidebar } from "@/components/sidebars/requests-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const LocationMapPicker = dynamic(() => import("@/components/location-map-picker"), { ssr: false });

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

function VisitationContent() {
  const [visitations, setVisitations] = useState<VisitationItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [fetchingList, setFetchingList] = useState(true);

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

  const fetchVisitations = async () => {
    setFetchingList(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_URL}/api/members/visitations/`, { headers });
      if (res.ok) {
        const data = await res.json();
        setVisitations(Array.isArray(data) ? data : []);
      } else {
        setVisitations([]);
      }
    } catch {
      setVisitations([]);
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
    fetchVisitations();
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) {
      handleLookup();
    }
  }, []);

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
        setShowForm(false);
        fetchVisitations();
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
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <RequestsSidebar />
        <div className="flex-1 min-w-0 h-full md:h-[calc(100vh-4rem)] bg-white p-5 sm:p-8 lg:p-10 md:overflow-y-auto custom-hover-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pastoral Visitation</h1>
              <p className="mt-1 text-sm text-[#617068]">
                Request a pastoral visit, home blessing, or grief support from our church care team and elders.
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
                + Request Pastoral Visitation
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
                  <h2 className="text-xl font-semibold text-[#26352f]">Request Pastoral Visit</h2>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded-lg p-1.5 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f] transition"
                  >
                    ✕
                  </button>
                </div>

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
                        className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-[#26352f]">Email (Optional)</label>
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
                        className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#26352f]">Type of Visit</label>
                      <select
                        value={visitationForm.visitation_type}
                        onChange={(e) => setVisitationForm({ ...visitationForm, visitation_type: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] bg-[#f7f4ee] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
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
                        type="time"
                        value={visitationForm.preferred_time}
                        onChange={(e) => setVisitationForm({ ...visitationForm, preferred_time: e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#26352f]">Location Coordinates (Click map to pin)</label>
                    <div className="mt-2 rounded-2xl border border-[#c9c5bb] overflow-hidden">
                      <LocationMapPicker
                        latitude={visitationForm.latitude}
                        longitude={visitationForm.longitude}
                        onChange={(lat, lng) => setVisitationForm({ ...visitationForm, latitude: lat, longitude: lng })}
                        onClear={() => setVisitationForm({ ...visitationForm, latitude: null, longitude: null })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#26352f]">Notes or Special Instructions (Optional)</label>
                    <textarea
                      rows={3}
                      value={visitationForm.notes}
                      onChange={(e) => setVisitationForm({ ...visitationForm, notes: e.target.value })}
                      placeholder="Add any additional details, directions, or prayer needs..."
                      className="mt-1.5 w-full rounded-xl border border-[#c9c5bb] px-4 py-2.5 text-sm outline-none focus:border-[#b36b3c]"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="rounded-full border border-[#c9c5bb] px-6 py-3.5 font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 rounded-full bg-[#5f8067] py-3.5 text-center font-semibold text-white transition hover:bg-[#4d6d55] disabled:opacity-60"
                    >
                      {loading ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <section className="mt-6">
              {fetchingList ? (
                <div className="rounded-3xl border border-[#dfdbd1] bg-white p-8 text-center text-sm text-[#617068]">
                  Loading visitation requests...
                </div>
              ) : visitations.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[#c9c5bb] bg-white p-8 sm:p-12 text-center">
                  <span className="text-4xl" aria-hidden="true">
                    🏠
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-[#26352f]">
                    No pastoral visitation requests submitted yet
                  </h3>
                  <p className="mt-1 text-sm text-[#617068]">
                    Submit a request to arrange a pastoral or home visit with our elders and care team.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="mt-5 rounded-full bg-[#5f8067] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4d6d55]"
                  >
                    + Request Pastoral Visitation
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {visitations.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-[#617068]">
                          <span className="font-semibold text-[#26352f]">{item.requester_name}</span>
                          <span className="capitalize rounded-full bg-[#f7f4ee] px-2.5 py-1 text-[11px] font-semibold text-[#5f8067]">
                            {item.visitation_type}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[#617068]">
                          📞 {item.phone_number} {item.email ? `• ✉️ ${item.email}` : ""}
                        </p>
                        {(item.preferred_date || item.preferred_time) && (
                          <p className="mt-1 text-xs text-[#617068]">
                            📅 Preferred: {item.preferred_date || ""} {item.preferred_time || ""}
                          </p>
                        )}
                        {item.notes && (
                          <p className="mt-2 text-xs leading-relaxed text-[#26352f] italic">
                            &ldquo;{item.notes}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#617068] pt-2 border-t border-[#dfdbd1]">
                        <span>Status: <strong className="capitalize text-[#b36b3c]">{item.status || "Pending Care Team"}</strong></span>
                        {item.created_at && (
                          <span>{new Date(item.created_at).toLocaleDateString()}</span>
                        )}
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

export default function StandaloneVisitationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-[#617068]">
          Loading visitation options...
        </main>
      }
    >
      <VisitationContent />
    </Suspense>
  );
}
