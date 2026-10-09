"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One request type — the four asking-for-something desks after Fellowship is merged. */
export type RequestType = "prayer" | "visitation" | "dedication" | "transfer";

const REQUEST_TYPES: { value: RequestType; label: string }[] = [
  { value: "prayer", label: "Prayer Request" },
  { value: "visitation", label: "Visitation Request" },
  { value: "dedication", label: "Child Dedication" },
  { value: "transfer", label: "Join / Transfer" },
];

/**
 * Visitation's own choices, spelled exactly as the model spells them —
 * `family` and `sick`, not the nicer-sounding "home"/"hospital". A value the
 * model does not list is rejected at the door with a 400.
 */
const VISITATION_TYPES = [
  ["pastoral", "Pastoral Care & Prayer"],
  ["family", "Home Blessing / Family Visit"],
  ["sick", "Hospital / Sick Visit"],
  ["bereavement", "Bereavement Support"],
  ["other", "Other Concern"],
] as const;

/** The transfer desk reads both directions: joining us, or moving on. */
const TRANSFER_TYPES = [
  ["incoming", "Joining SDA Loma Linda from another church"],
  ["outgoing", "Requesting a transfer out to another church"],
] as const;

const labelCls = "block text-xs font-semibold text-bark";
const fieldCls =
  "mt-1.5 w-full rounded-xl border border-sand-mute bg-white px-4 py-2.5 text-sm outline-none focus:border-ember";
const selectCls =
  "mt-1.5 w-full rounded-xl border border-sand-mute bg-sand px-4 py-2.5 text-sm font-semibold text-bark outline-none focus:border-ember";

const digits = (value: string) => value.replace(/\D/g, "");
const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * The four request forms, behind one type selector.
 *
 * Each type posts its own payload to its own endpoint with the fields that
 * endpoint actually reads: a dedication carries the child and the parents, a
 * visitation carries a contactable phone and a date, a transfer names the
 * church. Only prayer is a paragraph — the rest never were.
 */
export function RequestsModal({
  open,
  initialType = "prayer",
  onClose,
}: {
  open: boolean;
  /** The desk the caller opened, so clicking Child Dedication opens one. */
  initialType?: RequestType;
  onClose: () => void;
}) {
  const [requestType, setRequestType] = useState<RequestType>(initialType);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prayer, setPrayer] = useState({ request_text: "", audience: "elders", name: "" });
  const [visitation, setVisitation] = useState({
    requester_name: "",
    phone_number: "",
    email: "",
    visitation_type: "pastoral",
    preferred_date: "",
    preferred_time: "",
    notes: "",
  });
  const [dedication, setDedication] = useState({
    child_name: "",
    child_dob: "",
    father_name: "",
    mother_name: "",
    phone_number: "",
    notes: "",
  });
  const [transfer, setTransfer] = useState({
    member_name: "",
    transfer_type: "incoming",
    other_church: "",
    reason: "",
    phone_number: "",
  });

  // Every open starts from an empty form on the desk that was clicked, with a
  // signed-in member's own details in the contact fields — the way both desk
  // forms do it. The resets and the read live inside a deferred microtask, so
  // the effect body itself stays setState-free (the idiom the request forms
  // already use); setting state synchronously here would cascade a render.
  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(async () => {
      setRequestType(initialType);
      setError(null);
      setPrayer({ request_text: "", audience: "elders", name: "" });
      setVisitation({
        requester_name: "",
        phone_number: "",
        email: "",
        visitation_type: "pastoral",
        preferred_date: "",
        preferred_time: "",
        notes: "",
      });
      setDedication({ child_name: "", child_dob: "", father_name: "", mother_name: "", phone_number: "", notes: "" });
      setTransfer({ member_name: "", transfer_type: "incoming", other_church: "", reason: "", phone_number: "" });

      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/api/members/lookup/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json() : null;
        if (!data || !data.found) return;
        setPrayer((prev) => ({ ...prev, name: prev.name || data.name || "" }));
        setVisitation((prev) => ({
          ...prev,
          requester_name: prev.requester_name || data.name || "",
          email: prev.email || data.email || "",
          phone_number: prev.phone_number || data.phone_number || "",
        }));
        setTransfer((prev) => ({ ...prev, member_name: prev.member_name || data.name || "" }));
      } catch {
        // The forms still work signed out — the contact fields stay empty.
      }
    });
  }, [open, initialType]);

  if (!open) return null;

  /** The endpoint and body for the type on screen, or the reason to stop. */
  function buildRequest(): { endpoint: string; payload: Record<string, unknown> } | string {
    switch (requestType) {
      case "prayer": {
        const text = prayer.request_text.trim();
        if (text.length < 10) return "Please write your prayer request (at least 10 characters).";
        const name = prayer.name.trim();
        const payload: Record<string, unknown> = {
          request_text: text,
          audience: prayer.audience,
          // No name given means the request goes up without one.
          anonymous: !name,
        };
        if (name) payload.name = name;
        return { endpoint: `${API_URL}/api/members/prayer-requests/`, payload };
      }

      case "visitation": {
        const name = visitation.requester_name.trim();
        if (name.length < 2) return "Please enter your full name.";
        const phone = digits(visitation.phone_number);
        if (phone.length !== 10) return "Please enter a valid 10-digit phone number (e.g., 0712345678).";
        const payload: Record<string, unknown> = {
          requester_name: name,
          phone_number: phone,
          visitation_type: visitation.visitation_type,
          notes: visitation.notes.trim(),
        };
        if (visitation.email.trim()) payload.email = visitation.email.trim();
        if (visitation.preferred_date) payload.preferred_date = visitation.preferred_date;
        if (visitation.preferred_time) payload.preferred_time = visitation.preferred_time;
        return { endpoint: `${API_URL}/api/members/visitations/`, payload };
      }

      case "dedication": {
        const child = dedication.child_name.trim();
        if (child.length < 2) return "Please enter the child's name.";
        if (!dedication.child_dob) return "Please enter the child's date of birth.";
        if (dedication.child_dob > todayISO()) return "The date of birth cannot be in the future.";
        const phone = digits(dedication.phone_number);
        if (phone.length !== 10) return "Please enter a valid 10-digit phone number (e.g., 0712345678).";
        const payload: Record<string, unknown> = {
          child_name: child,
          child_dob: dedication.child_dob,
          phone_number: phone,
          father_name: dedication.father_name.trim(),
          mother_name: dedication.mother_name.trim(),
          notes: dedication.notes.trim(),
        };
        return { endpoint: `${API_URL}/api/members/child-dedications/`, payload };
      }

      case "transfer": {
        const church = transfer.other_church.trim();
        if (church.length < 2) return "Please name the church this transfer concerns.";
        const phone = digits(transfer.phone_number);
        if (transfer.phone_number && phone.length !== 10)
          return "Please enter a valid 10-digit phone number (e.g., 0712345678), or leave it blank.";
        const payload: Record<string, unknown> = {
          member_name: transfer.member_name.trim(),
          transfer_type: transfer.transfer_type,
          other_church: church,
          reason: transfer.reason.trim(),
        };
        if (phone) payload.phone_number = phone;
        // The server fills the identity of a signed-in member itself; a
        // visitor's request still has to say who is asking.
        if (!payload.member_name && typeof window !== "undefined" && !localStorage.getItem("access_token")) {
          return "Please enter your full name so the office knows who to reply to.";
        }
        return { endpoint: `${API_URL}/api/members/transfers/`, payload };
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const request = buildRequest();
    if (typeof request === "string") {
      setError(request);
      showAlert("Check the form", request, "warning");
      return;
    }

    setSubmitting(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const response = await fetch(request.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request.payload),
      });

      if (response.ok) {
        const text = `Your ${REQUEST_TYPES.find((t) => t.value === requestType)?.label.toLowerCase()} has been sent to the church. The right team will be in touch.`;
        showAlert("Request Received", text, "success");
        onClose();
      } else {
        const data = await response.json().catch(() => ({}));
        const text =
          data.detail ||
          Object.values(data).flat().join(" ") ||
          `Unable to submit your request. Please try again.`;
        setError(text);
        showAlert("Request Error", text, "error");
      }
    } catch {
      const text = "Network error. Please check your connection and try again.";
      setError(text);
      showAlert("Network Error", text, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="requests-modal-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ember">Requests</p>
            <h3 id="requests-modal-title" className="text-lg font-bold text-bark">
              {REQUEST_TYPES.find((t) => t.value === requestType)?.label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="text-xl leading-none text-moss hover:text-bark"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">{error}</p>
        )}

        <form onSubmit={submit} className="mt-4 space-y-5 text-sm">
          {/* The first field in the modal: the request type. */}
          <div>
            <label className={labelCls} htmlFor="request-type">
              Request type <span className="text-moss">*</span>
            </label>
            <select
              id="request-type"
              value={requestType}
              onChange={(e) => {
                setRequestType(e.target.value as RequestType);
                setError(null);
              }}
              className={selectCls}
            >
              {REQUEST_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {requestType === "prayer" && (
            <>
              <div>
                <label className={labelCls} htmlFor="prayer-text">
                  Your prayer request <span className="text-moss">*</span>
                </label>
                <textarea
                  id="prayer-text"
                  required
                  rows={5}
                  value={prayer.request_text}
                  onChange={(e) => setPrayer({ ...prayer, request_text: e.target.value })}
                  placeholder="Share what is on your heart..."
                  className={`${fieldCls} px-4 py-3`}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="prayer-audience">
                  Who should pray with you?
                </label>
                <select
                  id="prayer-audience"
                  value={prayer.audience}
                  onChange={(e) => setPrayer({ ...prayer, audience: e.target.value })}
                  className={selectCls}
                >
                  <option value="elders">Elders Desk</option>
                  <option value="pastor">Pastor</option>
                  <option value="church">The Church</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="prayer-name">
                  Your name <span className="text-moss">(optional)</span>
                </label>
                <input
                  id="prayer-name"
                  type="text"
                  maxLength={160}
                  value={prayer.name}
                  onChange={(e) => setPrayer({ ...prayer, name: e.target.value })}
                  placeholder="Leave blank to send it anonymously"
                  className={fieldCls}
                />
              </div>
            </>
          )}

          {requestType === "visitation" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="visit-name">
                    Full name <span className="text-moss">*</span>
                  </label>
                  <input
                    id="visit-name"
                    required
                    type="text"
                    maxLength={160}
                    value={visitation.requester_name}
                    onChange={(e) => setVisitation({ ...visitation, requester_name: e.target.value })}
                    placeholder="Your full name"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="visit-phone">
                    Phone number <span className="text-moss">*</span>
                  </label>
                  <input
                    id="visit-phone"
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={visitation.phone_number}
                    onChange={(e) => setVisitation({ ...visitation, phone_number: e.target.value })}
                    placeholder="0712345678"
                    className={fieldCls}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="visit-email">
                    Email <span className="text-moss">(optional)</span>
                  </label>
                  <input
                    id="visit-email"
                    type="email"
                    value={visitation.email}
                    onChange={(e) => setVisitation({ ...visitation, email: e.target.value })}
                    placeholder="you@example.com"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="visit-type">
                    Type of visit
                  </label>
                  <select
                    id="visit-type"
                    value={visitation.visitation_type}
                    onChange={(e) => setVisitation({ ...visitation, visitation_type: e.target.value })}
                    className={selectCls}
                  >
                    {VISITATION_TYPES.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="visit-date">
                    Preferred date <span className="text-moss">(optional)</span>
                  </label>
                  <input
                    id="visit-date"
                    type="date"
                    min={todayISO()}
                    value={visitation.preferred_date}
                    onChange={(e) => setVisitation({ ...visitation, preferred_date: e.target.value })}
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="visit-time">
                    Preferred time <span className="text-moss">(optional)</span>
                  </label>
                  <input
                    id="visit-time"
                    type="time"
                    value={visitation.preferred_time}
                    onChange={(e) => setVisitation({ ...visitation, preferred_time: e.target.value })}
                    className={fieldCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="visit-notes">
                  Anything we should know <span className="text-moss">(optional)</span>
                </label>
                <textarea
                  id="visit-notes"
                  rows={3}
                  value={visitation.notes}
                  onChange={(e) => setVisitation({ ...visitation, notes: e.target.value })}
                  placeholder="Who is unwell, where to come, best time to knock..."
                  className={fieldCls}
                />
              </div>
            </>
          )}

          {requestType === "dedication" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="dedication-child">
                    Child&apos;s full name <span className="text-moss">*</span>
                  </label>
                  <input
                    id="dedication-child"
                    required
                    type="text"
                    maxLength={160}
                    value={dedication.child_name}
                    onChange={(e) => setDedication({ ...dedication, child_name: e.target.value })}
                    placeholder="e.g. Maria Mwangi"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="dedication-dob">
                    Date of birth <span className="text-moss">*</span>
                  </label>
                  <input
                    id="dedication-dob"
                    required
                    type="date"
                    max={todayISO()}
                    value={dedication.child_dob}
                    onChange={(e) => setDedication({ ...dedication, child_dob: e.target.value })}
                    className={fieldCls}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="dedication-father">
                    Father&apos;s name <span className="text-moss">(optional)</span>
                  </label>
                  <input
                    id="dedication-father"
                    type="text"
                    maxLength={160}
                    value={dedication.father_name}
                    onChange={(e) => setDedication({ ...dedication, father_name: e.target.value })}
                    placeholder="e.g. Joseph Mwangi"
                    className={fieldCls}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="dedication-mother">
                    Mother&apos;s name <span className="text-moss">(optional)</span>
                  </label>
                  <input
                    id="dedication-mother"
                    type="text"
                    maxLength={160}
                    value={dedication.mother_name}
                    onChange={(e) => setDedication({ ...dedication, mother_name: e.target.value })}
                    placeholder="e.g. Grace Mwangi"
                    className={fieldCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="dedication-phone">
                  Phone number <span className="text-moss">*</span>
                </label>
                <input
                  id="dedication-phone"
                  required
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={dedication.phone_number}
                  onChange={(e) => setDedication({ ...dedication, phone_number: e.target.value })}
                  placeholder="0712345678"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="dedication-notes">
                  Notes <span className="text-moss">(optional)</span>
                </label>
                <textarea
                  id="dedication-notes"
                  rows={3}
                  value={dedication.notes}
                  onChange={(e) => setDedication({ ...dedication, notes: e.target.value })}
                  placeholder="Any preferences for the ceremony, or anything the team should know..."
                  className={fieldCls}
                />
              </div>
            </>
          )}

          {requestType === "transfer" && (
            <>
              <div>
                <label className={labelCls} htmlFor="transfer-type">
                  What are you asking for?
                </label>
                <select
                  id="transfer-type"
                  value={transfer.transfer_type}
                  onChange={(e) => setTransfer({ ...transfer, transfer_type: e.target.value })}
                  className={selectCls}
                >
                  {TRANSFER_TYPES.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="transfer-name">
                  Your full name <span className="text-moss">*</span>
                </label>
                <input
                  id="transfer-name"
                  required
                  type="text"
                  maxLength={160}
                  value={transfer.member_name}
                  onChange={(e) => setTransfer({ ...transfer, member_name: e.target.value })}
                  placeholder="The name on your church records"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="transfer-church">
                  {transfer.transfer_type === "incoming" ? "The church you are coming from" : "The church you are moving to"}{" "}
                  <span className="text-moss">*</span>
                </label>
                <input
                  id="transfer-church"
                  required
                  type="text"
                  maxLength={160}
                  value={transfer.other_church}
                  onChange={(e) => setTransfer({ ...transfer, other_church: e.target.value })}
                  placeholder="e.g. SDA Kiganjo"
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="transfer-reason">
                  Reason <span className="text-moss">(optional)</span>
                </label>
                <textarea
                  id="transfer-reason"
                  rows={3}
                  value={transfer.reason}
                  onChange={(e) => setTransfer({ ...transfer, reason: e.target.value })}
                  placeholder="Tell us why you are requesting the transfer..."
                  className={fieldCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="transfer-phone">
                  Phone number <span className="text-moss">(optional)</span>
                </label>
                <input
                  id="transfer-phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={transfer.phone_number}
                  onChange={(e) => setTransfer({ ...transfer, phone_number: e.target.value })}
                  placeholder="0712345678"
                  className={fieldCls}
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-full bg-ember px-6 py-3.5 font-semibold text-white transition hover:bg-ember-dark disabled:opacity-60"
            >
              {submitting ? "Sending..." : `Send ${REQUEST_TYPES.find((t) => t.value === requestType)?.label ?? "Request"}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-sand-mute px-6 py-3.5 font-semibold text-bark transition hover:bg-sand"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
