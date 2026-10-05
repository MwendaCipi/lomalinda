"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { localDate } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Only reached if the accounts endpoint is unreachable: the church's core
// funds plus "Other" for anything else. The live list comes from treasury
// accounts, so new drives and departments appear here automatically.
const fallbackPurposes = [
  "Tithe",
  "Combined Offering",
  "Local Church Budget",
  "Farewell",
  "Welfare",
];

// The one non-account entry: a purpose outside the configured list, named by
// the treasurer. It behaves like an account — ticked, given an amount, and
// listed in the split — with its name typed instead of chosen.
const OTHER_PURPOSE = "__other__";

export type AddReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  /** Preselects a giving purpose — a fund drive passes its account name. */
  presetPurpose?: string;
  /** Called after the receipt is saved; carries the honest delivery line and
   * the date the receipt was entered under. */
  onSaved?: (deliveryMessage: string, receipt: { received_on: string }) => void;
};

/**
 * The Add Receipt modal from the contributions ledger, shared so the fund
 * drives console can receipt money that arrived outside the platform. The
 * purpose may be preset by the caller; everything else matches the ledger's
 * modal field-for-field.
 *
 * A giver who handed over one sum for more than one thing is receipted once:
 * the purposes are ticked — the same account picker the give-money form uses —
 * each takes its own slice of the amount, and the whole entry is submitted as
 * one split so the ledger credits every account and the giver receives a
 * single letter listing the distribution.
 */
export function AddReceiptModal({ open, onClose, presetPurpose, onSaved }: AddReceiptModalProps) {
  const [saving, setSaving] = useState(false);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [purposeAmounts, setPurposeAmounts] = useState<Record<string, string>>({});
  const [showPurposePicker, setShowPurposePicker] = useState(false);
  const purposePickerRef = useRef<HTMLDivElement | null>(null);
  const [cashForm, setCashForm] = useState({ donor_name: "", giver_phone: "", giver_email: "", received_on: localDate() });
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "bank_transfer" | "cheque">("cash");
  const [customPurpose, setCustomPurpose] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [receiptMessage, setReceiptMessage] = useState("");
  const [isCustomMessage, setIsCustomMessage] = useState(false);
  const [settingsReceiptTemplate, setSettingsReceiptTemplate] = useState(
    "Thank you, {name}, for contributing {amount} towards {purpose}. May God bless you abundantly!"
  );

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` });

  // Purposes come from the live treasury accounts (the same list the giving
  // form reads, in the church's priority order), so fund drives like Farewell
  // and Welfare always appear. "Other" opens a free-text field for anything
  // outside the configured accounts.
  useEffect(() => {
    if (!open) return;
    fetch(`${API_URL}/api/members/giving-accounts/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { label?: string; account?: string }[]) => {
        const labels = data
          .map((item) => (item.label || item.account || "").trim())
          // "Other" is offered by the picker itself, typed rather than chosen.
          .filter((label) => Boolean(label) && label !== "Other");
        setPurposes(labels.length ? Array.from(new Set(labels)) : fallbackPurposes);
      })
      .catch(() => setPurposes(fallbackPurposes));

    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.default_receipt_message) {
          setSettingsReceiptTemplate(data.default_receipt_message);
        }
      })
      .catch(() => undefined);
  }, [open]);

  // Each opening starts empty — the treasurer ticks what the giver actually
  // gave for — with one exception: a purpose the caller names (a fund drive's
  // account) arrives already ticked, so keyed-in money lands in the drive.
  // Nothing else is ever presumed; amounts belong to the entry being written.
  useEffect(() => {
    if (!open) return;
    setSelectedPurposes(presetPurpose ? [presetPurpose] : []);
    setPurposeAmounts({});
    setCustomPurpose("");
    setShowPurposePicker(false);
  }, [open, presetPurpose]);

  // The purpose list behaves like a dropdown: tapping anywhere outside it —
  // the amount rows it opens over, the backdrop — closes it, and so does
  // Escape. The trigger sits inside the ref, so its own tap still toggles.
  useEffect(() => {
    if (!open || !showPurposePicker) return;
    const closeOnOutsideTap = (event: PointerEvent) => {
      if (!purposePickerRef.current?.contains(event.target as Node)) setShowPurposePicker(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPurposePicker(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, showPurposePicker]);

  // The delivery channel as one choice: the two switches behind a combo.
  const receiptChannel: "both" | "email" | "sms" | "none" =
    sendEmail && sendSms ? "both" : sendEmail ? "email" : sendSms ? "sms" : "none";

  // The phone as the form spells it: a ten-digit local number, however the
  // member's record stores it (+254…, 254…, 07…).
  const localPhone = (raw: string) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("254")) return `0${digits.slice(3)}`;
    if (digits.length === 9) return `0${digits}`;
    return digits.slice(0, 10);
  };

  // A phone or email identifies the giver: when either is entered, look the
  // member up and fill the details we hold — the name, and the other contact.
  // Only empty fields are filled, so nothing the desk typed is overwritten.
  useEffect(() => {
    if (!open) return;
    const phone = cashForm.giver_phone.trim();
    const email = cashForm.giver_email.trim();
    const byPhone = phone.length === 10;
    const byEmail = /.+@.+\..+/.test(email);
    if (!byPhone && !byEmail) return;
    const query = byEmail ? email : phone;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${API_URL}/api/members/lookup/?query=${encodeURIComponent(query)}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.found) return;
          setCashForm((prev) => {
            const donor_name = data.name && !prev.donor_name.trim() ? data.name : prev.donor_name;
            const giver_email = data.email && !prev.giver_email.trim() ? data.email : prev.giver_email;
            const giver_phone = data.phone_number && !prev.giver_phone.trim() ? localPhone(data.phone_number) : prev.giver_phone;
            if (donor_name === prev.donor_name && giver_email === prev.giver_email && giver_phone === prev.giver_phone) return prev;
            return { ...prev, donor_name, giver_email, giver_phone };
          });
        })
        .catch(() => undefined);
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, cashForm.giver_phone, cashForm.giver_email]);

  // The name a purpose goes by: its account label, or the typed custom name.
  const purposeName = (key: string) =>
    key === OTHER_PURPOSE ? customPurpose.trim() || "Other" : key;

  const allocationTotal = selectedPurposes.reduce(
    (sum, key) => sum + (Number(purposeAmounts[key]) || 0),
    0
  );

  const togglePurpose = (key: string) => {
    setSelectedPurposes((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const purposeKey = selectedPurposes.join("|");
  useEffect(() => {
    if (!open || isCustomMessage) return;
    const nameVal = cashForm.donor_name.trim() || "{name}";
    const amountVal = allocationTotal > 0 ? `kes ${allocationTotal}` : "kes {amount}";
    const purposeVal =
      selectedPurposes
        .map((key) => (key === OTHER_PURPOSE ? customPurpose.trim() || "Other" : key))
        .join(", ") || "{purpose}";
    setReceiptMessage(
      settingsReceiptTemplate
        .replace("{name}", nameVal)
        .replace("{amount}", amountVal)
        // The shipped template names the purpose {account} — the app's own
        // word for it — while older wording uses {purpose}; fill both.
        .replace("{account}", purposeVal)
        .replace("{purpose}", purposeVal)
    );
  }, [open, isCustomMessage, cashForm.donor_name, allocationTotal, purposeKey, customPurpose, settingsReceiptTemplate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (selectedPurposes.length === 0) {
      showAlert("Choose a Purpose", "Select at least one giving purpose.", "warning");
      return;
    }
    const customName = customPurpose.trim();
    if (selectedPurposes.includes(OTHER_PURPOSE)) {
      if (!customName) {
        showAlert("Name the Purpose", "Type the custom giving purpose, or untick it.", "warning");
        return;
      }
      if (customName.split(/\s+/).length > 2) {
        showAlert("Too Many Words", "Custom giving purpose must be at most 2 words (e.g. 'Youth' or 'Camp Goal').", "error");
        return;
      }
      if (customName.length > 20) {
        showAlert("Too Long", "Custom giving purpose must be at most 20 characters.", "error");
        return;
      }
    }

    // The whole receipt, split per ticked purpose. The header amount is the
    // sum of the parts so the ledger reads the one sum the giver handed over.
    const allocations = selectedPurposes.map((key) => ({
      purpose: key === OTHER_PURPOSE ? customName : key,
      amount: Number(purposeAmounts[key]) || 0,
    }));
    const short = allocations.find((row) => row.amount < 0.01);
    if (short) {
      showAlert("Amount Needed", `Enter an amount of at least KES 0.01 for ${short.purpose}.`, "warning");
      return;
    }
    const total = allocations.reduce((sum, row) => sum + row.amount, 0);

    setSaving(true);
    const response = await fetch(`${API_URL}/api/members/treasury/cash-contributions/`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        ...cashForm,
        amount: total,
        purpose: allocations[0].purpose,
        allocations,
        notes: receiptMessage,
        entry_type: "individual",
        payment_method: paymentMethod,
        item_description: "",
        send_sms: sendSms,
        send_email: sendEmail,
      }),
    });
    setSaving(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const allocationProblem = typeof body.allocations?.[0] === "string" ? body.allocations[0] : undefined;
      showAlert(
        "Could Not Save Receipt",
        allocationProblem || body.amount?.[0] || body.detail || "Please check the details and try again.",
        "error"
      );
      return;
    }

    const data = await response.json().catch(() => ({}));
    const deliveryMessage = data.receipt_delivery_message || "Receipt saved successfully.";
    onSaved?.(deliveryMessage, { received_on: cashForm.received_on });
    setCashForm({ donor_name: "", giver_phone: "", giver_email: "", received_on: localDate() });
    setPaymentMethod("cash");
    setSelectedPurposes([]);
    setPurposeAmounts({});
    setCustomPurpose("");
    setShowPurposePicker(false);
    setReceiptMessage("");
    setIsCustomMessage(false);
    setSendSms(true);
    setSendEmail(true);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-sand-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-4">
          <div>
            <h2 className="text-xl font-semibold text-bark">Add Receipt</h2>
            <p className="mt-0.5 text-xs text-moss">Record a manual payment or contribution for treasury reconciliation.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-moss hover:bg-sand hover:text-bark"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Method of Giving */}
          <label className="text-sm font-medium text-bark">
            Method of Giving
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
            >
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="bank_transfer">Bank-to-Bank</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>

          {/* Receipt Date */}
          <label className="text-sm font-medium text-bark">
            Receipt Date
            <input
              type="date"
              required
              value={cashForm.received_on}
              onChange={(e) => setCashForm({ ...cashForm, received_on: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </label>

          {/* Giving Purposes — ticked like the give-money form's account
              picker, so one receipt may carry several purposes. */}
          <div className="sm:col-span-2" ref={purposePickerRef}>
            <span className="text-sm font-medium text-bark">Giving Purposes</span>
            <div className="relative mt-1">
              <button
                type="button"
                onClick={() => setShowPurposePicker((open) => !open)}
                aria-expanded={showPurposePicker}
                aria-label="Choose giving purposes"
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-sand-mute bg-white px-3 py-2 text-left text-sm outline-none transition hover:border-ember focus:border-ember"
              >
                <span className={`min-w-0 truncate ${selectedPurposes.length ? "text-bark" : "text-moss"}`}>
                  {selectedPurposes.length === 0
                    ? "-- select --"
                    : selectedPurposes.length === 1
                      ? purposeName(selectedPurposes[0])
                      : `${purposeName(selectedPurposes[0])} +${selectedPurposes.length - 1} more`}
                </span>
                <ChevronDown size={14} className="shrink-0 text-moss" aria-hidden="true" />
              </button>

              {showPurposePicker && (
                <div className="mt-1.5 overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
                  <div className="max-h-52 overflow-y-auto p-2">
                    {purposes.map((item) => {
                      const checked = selectedPurposes.includes(item);
                      return (
                        <label
                          key={item}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition hover:bg-sand ${checked ? "bg-mist-select font-semibold text-bark" : "text-moss-dark"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePurpose(item)}
                            className="h-4 w-4 shrink-0 rounded border-sand-mute text-sage-strong focus:ring-sage-strong"
                          />
                          <span className="min-w-0 flex-1 truncate pr-1">{item}</span>
                        </label>
                      );
                    })}
                    <label
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition hover:bg-sand ${selectedPurposes.includes(OTHER_PURPOSE) ? "bg-mist-select font-semibold text-bark" : "text-moss-dark"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPurposes.includes(OTHER_PURPOSE)}
                        onChange={() => togglePurpose(OTHER_PURPOSE)}
                        className="h-4 w-4 shrink-0 rounded border-sand-mute text-sage-strong focus:ring-sage-strong"
                      />
                      <span className="min-w-0 flex-1 truncate pr-1">Other…</span>
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-sand-line bg-white px-2.5 py-1.5">
                    <p className="min-w-0 flex-1 pr-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-ember">
                      Tick each purpose the giver gave for
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPurposePicker(false)}
                      className="shrink-0 rounded-lg bg-bark px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-bark-900"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedPurposes.includes(OTHER_PURPOSE) && (
            <label className="text-sm font-medium text-bark sm:col-span-2">
              Custom Purpose
              <input
                required
                placeholder="Enter custom purpose..."
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2 text-sm outline-none focus:border-ember"
              />
              <span className="mt-1 block text-[11px] font-normal text-moss">
                At most 2 words (e.g. &apos;Youth&apos; or &apos;Camp Goal&apos;), up to 20 characters.
              </span>
            </label>
          )}

          {/* One amount per ticked purpose — the total is the sum the giver
              handed over, and the backend splits the credit to match. */}
          {selectedPurposes.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium text-bark">Amount per purpose (KES)</p>
              {selectedPurposes.map((key) => (
                <div key={key} className="flex items-center gap-2 rounded-xl border border-sand-line bg-sand/60 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => togglePurpose(key)}
                    aria-label={`Remove ${purposeName(key)}`}
                    title={`Remove ${purposeName(key)}`}
                    className="shrink-0 rounded-full p-1 text-moss-faint2 transition hover:bg-sand-light hover:text-ember-deep"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-bark sm:text-sm">
                    {purposeName(key)}
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    required
                    placeholder="Amount"
                    aria-label={`Amount for ${purposeName(key)}`}
                    value={purposeAmounts[key] ?? ""}
                    onChange={(e) => setPurposeAmounts((current) => ({ ...current, [key]: e.target.value }))}
                    className="w-24 shrink-0 rounded-lg border border-sand-mute bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-ember sm:w-32"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between px-1 pt-1 text-sm">
                <span className="font-medium text-moss">Total</span>
                <span className="font-bold text-bark">KES {allocationTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          <label className="text-sm font-medium text-bark">
            Giver Full Name
            <input
              required
              value={cashForm.donor_name}
              onChange={(e) => setCashForm({ ...cashForm, donor_name: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2 text-sm outline-none focus:border-ember"
              placeholder="e.g. Jane Doe"
            />
          </label>

          <label className="text-sm font-medium text-bark">
            Phone (optional)
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              minLength={10}
              placeholder="07XXXXXXXX"
              value={cashForm.giver_phone}
              onChange={(e) => setCashForm({ ...cashForm, giver_phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </label>

          <label className="text-sm font-medium text-bark">
            Email (optional)
            <input
              type="email"
              placeholder="giver@example.com"
              value={cashForm.giver_email}
              onChange={(e) => setCashForm({ ...cashForm, giver_email: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2 text-sm outline-none focus:border-ember"
            />
          </label>

          {/* The delivery channel, a combo in the same row as the email it
              sends to. */}
          <label className="text-sm font-medium text-bark">
            Send Receipt Through
            <select
              value={receiptChannel}
              onChange={(e) => {
                const channel = e.target.value as "both" | "email" | "sms" | "none";
                setSendEmail(channel === "both" || channel === "email");
                setSendSms(channel === "both" || channel === "sms");
              }}
              className="mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
            >
              <option value="both">Email &amp; SMS</option>
              <option value="email">Email only</option>
              <option value="sms">SMS only</option>
              <option value="none">Do not send</option>
            </select>
          </label>

          {/* Receipt Notes Textarea */}
          <label className="text-sm font-medium text-bark sm:col-span-2">
            <div className="flex items-center justify-between pb-1">
              <span>Receipt Notes</span>
              {isCustomMessage && (
                <button
                  type="button"
                  onClick={() => setIsCustomMessage(false)}
                  className="text-xs font-semibold text-ember hover:underline"
                >
                  Reset default
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={receiptMessage}
              onChange={(e) => {
                setReceiptMessage(e.target.value);
                setIsCustomMessage(true);
              }}
              placeholder="Thank you, {name}, for contributing {amount} towards {purpose}. May God bless you abundantly!"
              className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2 text-sm outline-none focus:border-ember leading-relaxed"
            />
          </label>

          <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-4 border-t border-sand-line">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-sand-mute px-5 py-2 text-sm font-semibold text-moss hover:bg-sand"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              className="rounded-full bg-ember px-6 py-2 text-sm font-semibold text-white transition hover:bg-ember-dark disabled:opacity-60"
            >
              {saving ? "Saving..." : "Send Receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
