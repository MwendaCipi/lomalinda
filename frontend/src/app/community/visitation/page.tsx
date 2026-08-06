"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const LocationMapPicker = dynamic(() => import("@/components/location-map-picker"), { ssr: false });

export default function VisitationPage() {
  const [form, setForm] = useState({
    requester_name: "",
    phone_number: "",
    email: "",
    visitation_type: "pastoral",
    preferred_date: "",
    preferred_time: "",
    location_description: "",
    latitude: null as number | null,
    longitude: null as number | null,
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/api/members/visitations/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (response.ok) {
        setMessage({
          type: "success",
          text: "Thank you! Your visitation request has been submitted. Our pastoral elders and care team will connect with you shortly.",
        });
        setForm({
          requester_name: "",
          phone_number: "",
          email: "",
          visitation_type: "pastoral",
          preferred_date: "",
          preferred_time: "",
          location_description: "",
          latitude: null,
          longitude: null,
          notes: "",
        });
      } else {
        const data = await response.json();
        setMessage({ type: "error", text: data.detail || "Unable to submit visitation request. Please verify inputs." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pt-10 pb-16 text-[#26352f] lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link href="/share" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]">
          <span>&larr;</span>
          <span>Back to Share & Care</span>
        </Link>

        <header className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b36b3c]">Pastoral & Care Ministry</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">Request Visitation</h1>
          <p className="mt-4 text-base leading-7 text-[#617068] sm:text-lg">
            Would you or your family like a pastor, elder, or church care team to visit, pray, or offer encouragement? Fill in your details below.
          </p>
        </header>

        <section className="mt-8 rounded-3xl border border-[#dfdbd1] bg-white p-7 shadow-sm sm:p-10">
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
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Full Name</label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={form.requester_name}
                  onChange={(e) => setForm({ ...form, requester_name: e.target.value })}
                  placeholder="Your full name"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Phone / Contact Number</label>
                <input
                  type="tel"
                  required
                  maxLength={40}
                  value={form.phone_number}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  placeholder="e.g. 07XX XXX XXX"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Type of Visitation</label>
                <select
                  value={form.visitation_type}
                  onChange={(e) => setForm({ ...form, visitation_type: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                >
                  <option value="pastoral">Pastoral Care & Prayer</option>
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
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Email address"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Preferred Date (Optional)</label>
                <input
                  type="date"
                  value={form.preferred_date}
                  onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#26352f]">Preferred Time (Optional)</label>
                <input
                  type="text"
                  value={form.preferred_time}
                  onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
                  placeholder="e.g. Afternoon, 4:00 PM, Sabbath evening"
                  className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#26352f]">Location Description & Directions</label>
              <textarea
                required
                rows={3}
                value={form.location_description}
                onChange={(e) => setForm({ ...form, location_description: e.target.value })}
                placeholder="Describe your location, landmarks, estate name, gate description, or hospital ward details..."
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
              />
            </div>

            {/* Leaflet Location Map Picker */}
            <div>
              <label className="block text-sm font-semibold text-[#26352f] mb-2">Map Location Pin</label>
              <p className="mb-3 text-xs text-[#617068]">
                Tap anywhere on the map or use your GPS location to drop a pin so our care team can easily find your location.
              </p>
              <LocationMapPicker
                latitude={form.latitude}
                longitude={form.longitude}
                onChange={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#26352f]">Additional Notes or Special Needs (Optional)</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any special details for the elders or care team..."
                className="mt-2 w-full rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#b36b3c] py-4 text-center font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
            >
              {loading ? "Submitting request..." : "Submit request"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
