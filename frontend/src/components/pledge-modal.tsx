"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { dayFirst } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type PledgeTarget = {
  id: number;
  title: string;
  action_type?: string | null;
  support_account_display?: string | null;
  event_date_from?: string | null;
  event_date_to?: string | null;
};

type Pledge = {
  id: number;
  amount: number | null;
  due_date: string | null;
  redeemed: boolean;
  redeemed_via: string;
};

export type PledgeModalProps = {
  open: boolean;
  onClose: () => void;
  target: PledgeTarget | null;
  onPledged?: () => void;
};

/** Today, as the date input wants it. */
function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function prettyDay(iso: string | null | undefined) {
  return dayFirst(iso, "");
}

function money(value: number) {
  return `KES ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Pledging, as a modal: what the member promises and the day they will have
 * given it by.
 *
 * That day never runs past the event the announcement is about — a gift
 * promised after the drive closed is no help to the drive — so the event's
 * last date is both the default and the ceiling, and the field says so when
 * the two disagree. A member who has already pledged sees what they promised
 * instead of being asked twice: they can tick it off themselves if they gave
 * in cash, and the church's own records close it when the gift arrives.
 */
export function PledgeModal({ open, onClose, target, onPledged }: PledgeModalProps) {
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [loadingPledge, setLoadingPledge] = useState(false);

  const today = todayIso();
  // The event's last day is the deadline; with no event, a fortnight is a
  // sensible promise rather than an open-ended one.
  const deadline = target?.event_date_to || target?.event_date_from || null;
  const latest = deadline || addDays(today, 14);

  useEffect(() => {
    if (!open || !target) return;
    setMessage("");
    setAmount("");
    setDueDate(latest < today ? today : latest);
    setPledge(null);
    const token = localStorage.getItem("access_token");
    if (!token) return;
    let alive = true;
    setLoadingPledge(true);
    fetch(`${API_URL}/api/members/announcements/${target.id}/pledge/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.pledge) setPledge(data.pledge);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingPledge(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  if (!open || !target) return null;

  const towards = target.support_account_display || target.title;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !amount) return;
    setBusy(true);
    setMessage("");
    const token = localStorage.getItem("access_token");
    try {
      const response = await fetch(`${API_URL}/api/members/announcements/${target!.id}/action/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          action_type: target!.action_type || "none",
          pledge_amount: parseFloat(amount),
          pledge_due_date: dueDate,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.pledge_due_date || data.detail || "Unable to record your pledge.");
      }
      setPledge({ id: data.id, amount: parseFloat(amount), due_date: dueDate, redeemed: false, redeemed_via: "" });
      setMessage(`Thank you — your pledge of ${money(parseFloat(amount))} is recorded for ${prettyDay(dueDate)}.`);
      onPledged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  async function markGiven() {
    if (!pledge || busy) return;
    setBusy(true);
    setMessage("");
    const token = localStorage.getItem("access_token");
    try {
      const response = await fetch(`${API_URL}/api/members/pledges/${pledge.id}/redeem/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ redeemed: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not update the pledge.");
      setPledge({ ...pledge, redeemed: true, redeemed_via: data.redeemed_via || "member" });
      setMessage(data.detail || "Pledge marked as given.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the pledge.");
    } finally {
      setBusy(false);
    }
  }

  const overdue = pledge && !pledge.redeemed && pledge.due_date && pledge.due_date < today;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pledge-modal-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-7"
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-line pb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ember">Pledge</p>
            <h3 id="pledge-modal-title" className="truncate text-lg font-bold text-bark">{target.title}</h3>
            <p className="mt-0.5 truncate text-xs text-moss">towards {towards}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-xl leading-none text-moss hover:text-bark"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {loadingPledge ? (
          <p className="py-6 text-center text-sm text-moss">Checking your pledge…</p>
        ) : pledge ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-sand-deep bg-sand-veil p-4">
              <p className="text-sm font-semibold text-bark">
                You pledged {pledge.amount ? money(pledge.amount) : "—"}
                {pledge.due_date ? ` by ${prettyDay(pledge.due_date)}` : ""}.
              </p>
              {pledge.redeemed ? (
                <p className="mt-1 text-xs font-semibold text-sage-strong">
                  <Check className="inline h-3 w-3" aria-hidden="true" /> Marked as given
                  {pledge.redeemed_via === "giving" ? " — we saw your gift come in." : "."}
                </p>
              ) : (
                <p className="mt-1 text-xs text-moss">
                  {overdue
                    ? "That day has passed and we have not seen the gift yet. If you have already given it, tell us below."
                    : "We will remind you the day before. If you give through M-Pesa, this closes itself."}
                </p>
              )}
            </div>

            {message && (
              <p className={`rounded-xl p-3 text-xs font-semibold ${
                message.startsWith("Thank you") || message.includes("marked as given")
                  ? "bg-mist-select text-moss-dark"
                  : "bg-red-50 text-red-700"
              }`}>
                {message}
              </p>
            )}

            {!pledge.redeemed && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={markGiven}
                  disabled={busy}
                  className="rounded-full bg-sage-strong px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sage-shade disabled:opacity-60"
                >
                  {busy ? "Saving…" : "I have given this"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm font-semibold text-moss hover:underline"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-bark">Pledge amount (KES) *</label>
              <input
                type="number"
                min="1"
                required
                placeholder="e.g. 5000"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-bark">I will give it by *</label>
              <input
                type="date"
                required
                min={today}
                max={deadline || undefined}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-sm focus:border-ember focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-moss">
                {deadline
                  ? `The event is on ${prettyDay(deadline)} — a pledge cannot run past it. We will remind you the day before.`
                  : "We will remind you the day before if the gift has not come in."}
              </p>
            </div>

            {message && (
              <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{message}</p>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !amount}
                className="rounded-full bg-ember px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ember-dark disabled:opacity-50"
              >
                {busy ? "Saving…" : "Record pledge"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold text-moss hover:underline"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
