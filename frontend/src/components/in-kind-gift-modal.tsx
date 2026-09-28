"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The accounts an in-kind gift can be recorded against — the same list the
    in-kind page offers, so a gift is filed the same way wherever it is given. */
const IN_KIND_PURPOSES = [
  "In-Kind Offering",
  "Welfare & Charity",
  "Building Project Materials",
  "Children Ministry Supplies",
  "Other",
];

export type InKindGiftModalProps = {
  open: boolean;
  onClose: () => void;
  /** The account this gift belongs to — an announcement's support account,
      say. It is added to the list when it is not one of the standard five. */
  defaultPurpose?: string;
  /** The announcement the gift was given from, for the record's own note. */
  announcementTitle?: string;
  onRecorded?: () => void;
};

/**
 * The in-kind gift form as a modal, so a member can hand over goods without
 * leaving whatever asked for them. It is the same form the in-kind page opens:
 * one item per line, the account, who is giving, and a note.
 */
export function InKindGiftModal({
  open,
  onClose,
  defaultPurpose,
  announcementTitle,
  onRecorded,
}: InKindGiftModalProps) {
  const [items, setItems] = useState("");
  const [purpose, setPurpose] = useState(IN_KIND_PURPOSES[0]);
  const [donorName, setDonorName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Opening fills the account the announcement asked for and the giver's own
  // name, and never wears the previous attempt's error.
  useEffect(() => {
    if (!open) return;
    setMessage("");
    setPurpose(defaultPurpose || IN_KIND_PURPOSES[0]);
    setNotes(announcementTitle ? `In response to: ${announcementTitle}` : "");
    const token = localStorage.getItem("access_token");
    if (!token) return;
    let alive = true;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!alive || !me) return;
        const full = `${me.first_name || ""} ${me.last_name || ""}`.trim();
        setDonorName(full || me.username || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, defaultPurpose, announcementTitle]);

  if (!open) return null;

  const itemCount = items.split("\n").filter((line) => line.trim()).length;
  const accounts = defaultPurpose && !IN_KIND_PURPOSES.includes(defaultPurpose)
    ? [defaultPurpose, ...IN_KIND_PURPOSES]
    : IN_KIND_PURPOSES;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting || itemCount === 0) return;
    setMessage("");
    setSubmitting(true);
    const token = localStorage.getItem("access_token");
    try {
      const response = await fetch(`${API_URL}/api/members/in-kind/`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items,
          purpose,
          donor_name: donorName,
          notes,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setItems("");
        setNotes("");
        onRecorded?.();
        onClose();
        showAlert("Gift recorded", "Thank you! Your in-kind giving has been recorded.", "success");
      } else {
        const detail = data.detail || Object.values(data).flat().join(" ") || "Failed to record in-kind giving.";
        setMessage(detail);
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="in-kind-gift-title"
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <p className="hidden text-[10px] font-extrabold uppercase tracking-wider text-ember sm:block">
              In-Kind Giving
            </p>
            <h3 id="in-kind-gift-title" className="text-lg font-bold text-bark">Give in kind</h3>
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

          <div>
            <label className="block text-xs font-semibold text-bark">
              Items donated <span className="text-moss">({itemCount} item{itemCount === 1 ? "" : "s"})</span> *
            </label>
            <textarea
              required
              rows={5}
              value={items}
              onChange={(event) => setItems(event.target.value)}
              placeholder={"One item per row, e.g.\n2 bags of maize flour\n1 carton of cooking oil\n50 exercise books"}
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-3 text-sm focus:border-ember focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-moss">Write each item on its own line.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-bark">Account</label>
              <select
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
              >
                {accounts.map((account) => (
                  <option key={account}>{account}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-bark">Your name</label>
              <input
                type="text"
                value={donorName}
                onChange={(event) => setDonorName(event.target.value)}
                placeholder="Leave blank to give anonymously"
                className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-bark">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything the stewardship team should know"
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || itemCount === 0}
            className="w-full rounded-xl bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            {submitting ? "Recording…" : "Record In-Kind Gift"}
          </button>
        </form>
      </div>
    </div>
  );
}
