"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type DriveGiveTarget = {
  /** The drive's giving account, which the M-Pesa prompt and the account's
      ledger both answer to. */
  purpose: string;
  /** The drive's display name, shown in the modal's heading. */
  title: string;
};

type DriveGiveModalProps = {
  onClose: () => void;
  drive: DriveGiveTarget;
  /** Called once the prompt is on its way, so a host can refresh its figures. */
  onSent?: () => void;
};

/**
 * Giving money to a fund drive, without leaving the shelf.
 *
 * The same M-Pesa push the drive's own page sends, as a modal: an amount, the
 * number the prompt goes to (pre-filled from the member's account), and the
 * drive's giving account as the purpose — so the gift credits that account and
 * lands in the drive's total. A member is always signed in where this opens
 * (the shelf sits behind the gate), so the receipt rides their account. The
 * host mounts it only while a drive is chosen, so each opening starts clean.
 */
export function DriveGiveModal({ onClose, drive, onSent }: DriveGiveModalProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // On open, pre-fill the member's own phone and name from their account.
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

  async function handleDonate(event: FormEvent) {
    event.preventDefault();
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showAlert("Invalid amount", "Please enter a valid amount.", "error");
      return;
    }
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      showAlert("Invalid phone number", "Please enter a valid 10-digit M-Pesa number (e.g., 0712345678).", "error");
      return;
    }

    setIsSubmitting(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          amount: numericAmount,
          giving_type: "financial",
          purpose: drive.purpose,
          phone_number: phoneNumber,
          donor_name: donorName.trim(),
          payment_method: "mpesa",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || Object.values(data).flat().join(" ") || "Failed to initiate payment.");
      }

      onClose();
      showAlert(
        "M-Pesa Prompt Sent",
        "Check your phone for the M-Pesa PIN prompt to complete your contribution.",
        "success"
      );
      onSent?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment error";
      showAlert("Payment Error", msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-give-title"
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-7"
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-line pb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-ember">Give money</p>
            <h3 id="drive-give-title" className="truncate text-lg font-bold text-bark">{drive.title}</h3>
            <p className="mt-0.5 truncate text-xs text-moss">towards {drive.purpose}</p>
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

        <form onSubmit={handleDonate} className="mt-4 space-y-4">
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

          <label className="block text-sm font-medium text-bark">
            M-Pesa Phone Number *
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              minLength={10}
              required
              placeholder="e.g. 0712345678"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
              className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
            />
          </label>

          <label className="block text-sm font-medium text-bark">
            Contribution Amount (KES) *
            <input
              type="number"
              required
              min="1"
              placeholder="e.g. 1000"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-sand-mute px-4 py-2.5 text-sm outline-none focus:border-ember"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-sage px-8 text-sm font-medium text-white transition hover:bg-sage-deep disabled:opacity-60"
          >
            {isSubmitting ? "Processing..." : "Send M-Pesa Prompt"}
          </button>
        </form>
      </div>
    </div>
  );
}
