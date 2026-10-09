"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState } from "react";
import { HandHelping, Home, Phone, X } from "lucide-react";

import { showAlert } from "@/lib/alerts";
import { dayFirstTime } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const LocationMapPicker = dynamic(() => import("@/components/location-map-picker"), { ssr: false });

/** One prayer request, as the ledger holds it. */
export type PrayerItem = {
  id: number;
  name?: string;
  anonymous?: boolean;
  request_text: string;
  created_at: string;
  status?: string;
};

/** One visitation request, as the ledger holds it. */
export type VisitationItem = {
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

/** The modal shell both request forms share. */
function FormModal({
  title,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className={`max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8`}
      >
        <div className="mb-6 flex items-center justify-between border-b border-sand-line pb-4">
          <h2 className="text-xl font-semibold text-bark">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-moss transition hover:bg-sand hover:text-bark"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * The prayer request form — opened by the Prayer page's action button. It
 * carries its own profile read, so the page behind it stays a plain ledger.
 */
export function PrayerRequestForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  /** Fired on a successful submit; the page shows the message and refreshes. */
  onSuccess: (message: string) => void;
}) {
  const [requestText, setRequestText] = useState("");
  const [profileName, setProfileName] = useState("");
  const [optionalName, setOptionalName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  // Who the request is for: the elders' desk (the default), the pastor, or the
  // whole congregation. The desk it names is who is told it is waiting.
  const [audience, setAudience] = useState<"elders" | "pastor" | "church">("elders");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    // Deferred by a microtask: the effect's own body stays setState-free, so
    // the profile read cannot cascade a render from inside the effect.
    void Promise.resolve().then(async () => {
      setIsLoggedIn(true);
      try {
        const res = await fetch(`${API_URL}/api/members/me/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json() : null;
        if (!data) return;
        const name =
          data.full_name ||
          `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
          data.name ||
          data.username ||
          "";
        setProfileName(name);
      } catch {
        // The form still works signed out — the name field just stays empty.
      }
    });
  }, []);

  async function submitPrayerRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    setLoading(true);
    setError(null);

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
      audience,
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
        showAlert("Prayer Request Received", text, "success");
        onSuccess(text);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const text = errorData.detail || "We could not submit your prayer request. Please check the form.";
        setError(text);
        showAlert("Request Error", text, "error");
      }
    } catch {
      const text = "Network error. Please try again.";
      setError(text);
      showAlert("Network Error", text, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormModal title="Request Prayer" onClose={onClose}>
      <form onSubmit={submitPrayerRequest} className="space-y-5">
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{error}</p>
        )}

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
          Send request to
          <select
            value={audience}
            onChange={(event) => setAudience(event.target.value as "elders" | "pastor" | "church")}
            className="mt-2 w-full rounded-xl border border-sand-mute bg-sand px-4 py-2.5 text-sm outline-none focus:border-ember"
          >
            <option value="elders">Elders Desk</option>
            <option value="pastor">Pastor</option>
            <option value="church">The Church</option>
          </select>
        </label>

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
            onClick={onClose}
            className="rounded-full border border-sand-mute px-6 py-3.5 font-semibold text-bark transition hover:bg-sand"
          >
            Cancel
          </button>
        </div>
      </form>
    </FormModal>
  );
}

/**
 * The visitation request form — opened by the Visitation page's action
 * button. A known phone or email fills the rest in from the register.
 */
export function VisitationRequestForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  /** Fired on a successful submit; the page shows the message and refreshes. */
  onSuccess: (message: string) => void;
}) {
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
  const [error, setError] = useState<string | null>(null);

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
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    // Deferred by a microtask, as the prayer form's profile read is.
    void Promise.resolve().then(() => handleLookup());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitVisitationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanPhone = visitationForm.phone_number.replace(/\D/g, "");
      if (cleanPhone.length !== 10) {
        const text = "Please enter a valid 10-digit phone number (e.g., 0712345678).";
        setError(text);
        showAlert("Invalid Phone Number", text, "warning");
        setLoading(false);
        return;
      }

      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
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
        showAlert("Visitation Request Received", text, "success");
        onSuccess(text);
      } else {
        const data = await response.json().catch(() => ({}));
        const text = data.detail || "Unable to submit visitation request. Please verify inputs.";
        setError(text);
        showAlert("Request Error", text, "error");
      }
    } catch {
      const text = "Network error. Please try again.";
      setError(text);
      showAlert("Network Error", text, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormModal title="Request a Visit" wide onClose={onClose}>
      <form onSubmit={submitVisitationRequest} className="space-y-5">
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700">{error}</p>
        )}

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
              {/* The model's own choices: `family` and `sick`, not the
                  nicer-sounding "home"/"hospital" — an unlisted value is a 400. */}
              <option value="pastoral">Pastoral Visit</option>
              <option value="family">Home / Family Visit</option>
              <option value="sick">Hospital / Sick Visit</option>
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
            onClick={onClose}
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
    </FormModal>
  );
}

/** One prayer request as a ledger card — the prayer page's list row. */
export function PrayerRequestCard({ item }: { item: PrayerItem }) {
  return (
    <div className="flex flex-col justify-between space-y-3 rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
      <div>
        <div className="flex items-center justify-between text-xs text-moss">
          <span className="rounded-full bg-ember/10 px-2.5 py-1 font-semibold text-ember">Prayer</span>
          {item.created_at && <span>{dayFirstTime(item.created_at)}</span>}
        </div>
        <p className="mt-2 text-sm leading-6 text-bark">{item.request_text}</p>
      </div>
      <div className="flex items-center justify-between border-t border-sand-line pt-2 text-xs text-moss">
        <span>
          {item.anonymous ? "Anonymous" : item.name || "Church member"} ·{" "}
          <strong className="capitalize text-sage">{item.status || "Received"}</strong>
        </span>
        <span className="inline-flex items-center gap-1"><HandHelping size={12} aria-hidden="true" /> Praying</span>
      </div>
    </div>
  );
}

/** One visitation request as a ledger card — the visitation page's list row. */
export function VisitationRequestCard({ item }: { item: VisitationItem }) {
  return (
    <div className="flex flex-col justify-between space-y-3 rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
      <div>
        <div className="flex items-center justify-between text-xs text-moss">
          <span className="rounded-full bg-sage/10 px-2.5 py-1 font-semibold capitalize text-sage-bright">
            {item.visitation_type} visit
          </span>
          {item.created_at && <span>{dayFirstTime(item.created_at)}</span>}
        </div>
        <p className="mt-2 text-sm font-semibold text-bark">{item.requester_name}</p>
        <p className="mt-0.5 text-xs text-moss">
          <Phone size={11} className="inline" aria-hidden="true" /> {item.phone_number}
          {(item.preferred_date || item.preferred_time) &&
            ` · ${item.preferred_date || ""} ${item.preferred_time || ""}`}
        </p>
        {item.notes && (
          <p className="mt-2 text-xs italic leading-relaxed text-bark">&ldquo;{item.notes}&rdquo;</p>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-sand-line pt-2 text-xs text-moss">
        <span>
          Status: <strong className="capitalize text-ember">{item.status || "Pending care team"}</strong>
        </span>
        <span className="inline-flex items-center gap-1"><Home size={12} aria-hidden="true" /> Visit</span>
      </div>
    </div>
  );
}
