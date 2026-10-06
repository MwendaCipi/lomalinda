"use client";

import { FormEvent, useState } from "react";
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

/** The request type selector is the first field in the modal — the member picks which request they are filling in. */
export function RequestsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [requestType, setRequestType] = useState<RequestType>("prayer");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setMessage(null);
    setSubmitting(true);

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    let endpoint = "";
    let payload: Record<string, unknown> = {};

    switch (requestType) {
      case "prayer":
        endpoint = `${API_URL}/api/members/prayer-requests/`;
        payload = { request_text: message || "No text provided", anonymous: false };
        break;
      case "visitation":
        endpoint = `${API_URL}/api/members/visitations/`;
        payload = {
          requester_name: message || "Anonymous",
          phone_number: "0000000000",
          visitation_type: "pastoral",
        };
        break;
      case "dedication":
        endpoint = `${API_URL}/api/members/support-submissions/?type=dedication`;
        payload = {
          submission_type: "dedication",
          content: "Child dedication request submitted via Requests modal.",
          name: "Church member",
          phone_number: "0000000000",
        };
        break;
      case "transfer":
        endpoint = `${API_URL}/api/members/transfers/`;
        payload = { transfer_type: "outgoing", other_church: "Unknown church", reason: "Requested from the Requests modal" };
        break;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showAlert("Request Received", "Your request has been sent to the church. The relevant team will be in touch.", "success");
        onClose();
      } else {
        const errorData = await response.json().catch(() => ({}));
        const text = errorData.detail || `Unable to submit your ${requestType} request. Please try again.`;
        setMessage(text);
        showAlert("Request Error", text, "error");
      }
    } catch {
      setMessage("Network error. Please check your connection and try again.");
      showAlert("Network Error", "Network error. Please try again.", "error");
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
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-sand-line bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ember">Requests</p>
            <h3 id="requests-modal-title" className="text-lg font-bold text-bark">Send a request</h3>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="text-xl leading-none text-moss hover:text-bark">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {message && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">{message}</p>
        )}

        <form onSubmit={submit} className="space-y-5 text-sm">
          {/* The first field in the modal: the request type dropdown. */}
          <div>
            <label className="block text-xs font-semibold text-bark" htmlFor="request-type">
              Request type <span className="text-moss">*</span>
            </label>
            <select
              id="request-type"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as RequestType)}
              className="mt-1.5 w-full rounded-xl border border-sand-mute bg-sand px-4 py-2.5 text-sm font-semibold text-bark outline-none focus:border-ember"
            >
              {REQUEST_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {requestType === "prayer" && (
            <label className="block text-xs font-semibold text-bark" htmlFor="prayer-text">
              Your prayer request
            </label>
          )}

          {requestType === "visitation" && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-bark" htmlFor="visitation-type">
                Type of visit
              </label>
              <select
                id="visitation-type"
                defaultValue="pastoral"
                className="mt-1 w-full rounded-xl border border-sand-mute bg-sand px-4 py-2.5 text-sm font-semibold text-bark outline-none focus:border-ember"
              >
                <option value="pastoral">Pastoral Visit</option>
                <option value="home">Home / Family Visit</option>
                <option value="hospital">Hospital / Sick Visit</option>
                <option value="bereavement">Bereavement Support</option>
                <option value="other">Other Concern</option>
              </select>
            </div>
          )}

          {requestType === "dedication" && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-bark" htmlFor="dedication-child">
                Child&apos;s name
              </label>
              <input
                id="dedication-child"
                required
                type="text"
                placeholder="e.g. Maria Mwangi"
                className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
              />
              <label className="block text-xs font-semibold text-bark" htmlFor="dedication-dob">
                Child&apos;s date of birth
              </label>
              <input
                id="dedication-dob"
                required
                type="date"
                className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
              />
              <label className="block text-xs font-semibold text-bark" htmlFor="dedication-notes">
                Notes or special instructions (optional)
              </label>
              <textarea
                id="dedication-notes"
                rows={3}
                placeholder="Include parents&apos; names and any preferences..."
                className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
              />
            </div>
          )}

          {requestType === "transfer" && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-bark" htmlFor="transfer-church">
                Destination church
              </label>
              <input
                id="transfer-church"
                required
                type="text"
                placeholder="The SDA church you are moving to"
                className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
              />
              <label className="block text-xs font-semibold text-bark" htmlFor="transfer-reason">
                Reason for transfer
              </label>
              <textarea
                id="transfer-reason"
                required
                rows={3}
                placeholder="Tell us why you are requesting the transfer..."
                className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
              />
            </div>
          )}

          {requestType === "prayer" && (
            <label className="block text-xs font-semibold text-bark" htmlFor="prayer-text">
              <textarea
                id="prayer-text"
                required
                rows={5}
                placeholder="Share what is on your heart..."
                className="mt-1 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
              />
            </label>
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
