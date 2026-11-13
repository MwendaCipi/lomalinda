"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The event a card's Enroll now / Register now button acts on. */
export type EventEnrollTarget = {
  /** The department event the seat is bought on. */
  event: number;
  /** The desk whose calendar holds it. */
  department: string;
  title: string;
  fee: string | number;
  deadline?: string | null;
};

/**
 * A seat on a registration event, paid for where the member read about it.
 *
 * The amount is the event's own, never typed by the member; the M-Pesa prompt
 * goes to their phone and Safaricom's callback writes the seat once the money
 * arrives. A register past its last day says so instead of taking the prompt.
 */
export function EventEnrollModal({
  target,
  onClose,
}: {
  target: EventEnrollTarget | null;
  onClose: () => void;
}) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [donorName, setDonorName] = useState("");
  // Whose seat is being bought: the member's own, or somebody they are paying
  // for — the same choice the giving form offers for a gift.
  const [who, setWho] = useState<"self" | "other">("self");
  const [attendeeName, setAttendeeName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // On open, the member's own phone and name arrive pre-filled.
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    let alive = true;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!alive || !me) return;
        if (me.phone_number) setPhoneNumber(me.phone_number);
        const full = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
        if (full) setDonorName(full);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!target) return null;

  const closed = Boolean(
    target.deadline && target.deadline < new Date().toISOString().slice(0, 10),
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    const attendee = who === "other" ? attendeeName.trim() : "";
    if (who === "other" && !attendee) {
      showAlert("Name needed", "Type the name of the person this seat is for.", "warning");
      return;
    }
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      showAlert("Invalid phone number", "Please enter a valid 10-digit M-Pesa number.", "error");
      return;
    }
    const token = localStorage.getItem("access_token");
    if (!token) {
      showAlert("Sign in", "Sign in to register for this event.", "info");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `${API_URL}/api/members/departments/${encodeURIComponent(target.department)}/events/${target.event}/enroll/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            phone_number: phoneNumber,
            donor_name: donorName.trim(),
            ...(attendee ? { attendee_name: attendee } : {}),
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldProblem = Array.isArray(data.phone_number)
          ? data.phone_number[0]
          : data.phone_number || data.attendee_name;
        throw new Error(
          data.detail || fieldProblem || "The registration could not be started.",
        );
      }
      showAlert(
        "M-Pesa Prompt Sent",
        data.message ||
          (attendee
            ? `Check your phone for the M-Pesa prompt; ${attendee}'s seat is written once it is paid.`
            : "Check your phone for the M-Pesa prompt; the seat is yours once it is paid."),
        "info",
        { toast: true, position: "top-end", timer: 7000, showConfirmButton: false },
      );
      onClose();
    } catch (error) {
      showAlert(
        "Registration Failed",
        error instanceof Error ? error.message : "Something went wrong.",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const feeLabel = Number(target.fee || 0).toLocaleString("en-KE");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-enroll-title"
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sand-line px-6 pb-3 pt-6 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ember">Register</p>
            <h3 id="event-enroll-title" className="truncate text-lg font-bold text-bark">
              {target.title}
            </h3>
            <p className="mt-0.5 text-xs text-moss">
              KES {feeLabel} per seat
              {target.deadline ? ` · register by ${target.deadline}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close"
            className="text-xl leading-none text-moss hover:text-bark"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {closed ? (
          <div className="space-y-4 px-6 py-6 sm:px-7">
            <p className="rounded-xl bg-sand px-4 py-3 text-sm text-moss">
              Registration for this event has closed. Speak to the desk that runs it.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full bg-bark px-6 py-2.5 text-sm font-semibold text-white"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 sm:px-7">
              <div>
                <p className="text-sm font-medium text-bark">Who is this seat for?</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["self", "Myself"],
                      ["other", "Another person"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setWho(value)}
                      aria-pressed={who === value}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        who === value
                          ? "border-ember bg-ember/10 text-ember"
                          : "border-sand-mute text-moss hover:border-ember hover:text-bark"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {who === "self" ? (
                <label className="block text-sm font-medium text-bark">
                  Name
                  <input
                    type="text"
                    placeholder="Your name"
                    value={donorName}
                    onChange={(event) => setDonorName(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                  />
                </label>
              ) : (
                <label className="block text-sm font-medium text-bark">
                  Their name *
                  <input
                    type="text"
                    required
                    placeholder="Full name of the person attending"
                    value={attendeeName}
                    onChange={(event) => setAttendeeName(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                  />
                </label>
              )}
              <label className="block text-sm font-medium text-bark">
                M-Pesa Phone Number *
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  required
                  placeholder="e.g. 0712345678"
                  value={phoneNumber}
                  onChange={(event) =>
                    setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
                />
              </label>
              <p className="text-[11px] leading-relaxed text-moss">
                {who === "other"
                  ? `The M-Pesa prompt goes to your phone; the seat is written in ${attendeeName.trim() || "their"} name once the payment lands, and your own seat stays yours.`
                  : "Your seat is written once the payment lands. The desk can also enroll you by hand on the day."}
              </p>
            </div>
            <div className="shrink-0 border-t border-sand-line px-6 pb-5 pt-3 sm:px-7">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-sage px-8 text-sm font-medium text-white transition hover:bg-sage-deep disabled:opacity-60"
              >
                {isSubmitting ? "Processing..." : `Pay KES ${feeLabel} & enroll`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
