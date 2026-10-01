"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type TransferRequestModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called after the request is saved, so the host page can refresh its list. */
  onSubmitted?: () => void;
};

/**
 * The membership transfer request as a modal, for a member who is already
 * signed in. It asks only what the church cannot know — where they are going
 * and why — because the name, the email and the phone come from the account
 * they are logged in with, and there is no email to verify: the session *is*
 * the verification.
 *
 * A visitor who is not signed in still uses the full form on the page, which
 * can verify them by email.
 */
export function TransferRequestModal({ open, onClose, onSubmitted }: TransferRequestModalProps) {
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [memberName, setMemberName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Opening wipes the last attempt and reads the member's own identity, so the
  // form can greet them by name and the request can carry their contacts.
  // (The reset itself is the parent's `key` — every open is a fresh mount —
  // so this effect only fetches.)
  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;
    let alive = true;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!alive || !me) return;
        setMemberName(me.name || me.username || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    const token = localStorage.getItem("access_token");
    try {
      const response = await fetch(`${API_URL}/api/members/transfers/`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transfer_type: "outgoing",
          other_church: destination.trim(),
          reason: reason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Object.values(data).flat().join(" ") || "Unable to submit your request.");
      showAlert(
        "Request Received",
        "Your transfer request has been received. The church office will be in touch.",
        "success"
      );
      onSubmitted?.();
      onClose();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to submit your request.";
      setMessage(text);
      showAlert("Request error", text, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-request-title"
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <p className="hidden text-[10px] font-extrabold uppercase tracking-wider text-ember sm:block">
              Membership
            </p>
            <h3 id="transfer-request-title" className="text-lg font-bold text-bark">Request a transfer out</h3>
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

        <form onSubmit={submit} className="mt-5 space-y-4">
          {message && (
            <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{message}</p>
          )}

          {memberName && (
            <p className="rounded-xl bg-sand-linen p-3 text-xs text-moss">
              Requesting as <strong className="text-bark">{memberName}</strong> — your name, email and phone
              come from your account, so the office knows who is asking.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-bark" htmlFor="transfer-destination">
              Destination church *
            </label>
            <input
              id="transfer-destination"
              required
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="The SDA church you are moving to"
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-bark" htmlFor="transfer-reason">
              Reason for transfer *
            </label>
            <textarea
              id="transfer-reason"
              required
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Tell us why you are requesting the transfer..."
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !destination.trim() || !reason.trim()}
            className="w-full rounded-xl bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Request Transfer"}
          </button>
        </form>
      </div>
    </div>
  );
}
