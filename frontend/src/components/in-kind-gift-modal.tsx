"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The accounts an in-kind gift can be recorded against — the same list the
    in-kind page offers, so a gift is filed the same way wherever it is given. */
export const IN_KIND_PURPOSES = [
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
  // Who this gift is for: the giver themselves (the default), or another
  // person it is written on — the same choice the money giving form offers.
  const [forSomeone, setForSomeone] = useState(false);
  // The name read from the giver's own account, kept so switching back to a
  // personal gift restores it after the field named the other person.
  const [myName, setMyName] = useState("");
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
    setForSomeone(false);
    const token = localStorage.getItem("access_token");
    if (!token) return;
    let alive = true;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!alive || !me) return;
        const full = `${me.first_name || ""} ${me.last_name || ""}`.trim() || me.username || "";
        setMyName(full);
        setDonorName(full);
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

          {/* The same question the money form asks: this gift can be the
              giver's own, or written in another person's name. */}
          <div>
            <label className="block text-xs font-semibold text-bark">Who is this for?</label>
            <select
              value={forSomeone ? "for_someone" : "myself"}
              onChange={(event) => {
                const givingForSomeone = event.target.value === "for_someone";
                setForSomeone(givingForSomeone);
                // The name field belongs to whoever the gift is for: the
                // giver's own name returns the moment it is their gift again.
                setDonorName(givingForSomeone ? "" : myName);
              }}
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
            >
              <option value="myself">Give for myself</option>
              <option value="for_someone">Give for someone</option>
            </select>
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
              <label className="block text-xs font-semibold text-bark">
                {forSomeone ? "Their name" : "Your name"}
              </label>
              <input
                type="text"
                required={forSomeone}
                value={donorName}
                onChange={(event) => setDonorName(event.target.value)}
                placeholder={forSomeone ? "The person this gift is for" : "Leave blank to give anonymously"}
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
