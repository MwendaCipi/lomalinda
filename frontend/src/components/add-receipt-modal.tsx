"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());

// Only reached if the accounts endpoint is unreachable: the church's core
// funds plus "Other" for anything else. The live list comes from treasury
// accounts, so new drives and departments appear here automatically.
const fallbackPurposes = [
  "Tithe",
  "Combined Offering",
  "Local Church Budget",
  "Farewell",
  "Welfare",
  "Other",
];

export type AddReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  /** Preselects the Giving Purpose dropdown — a fund drive passes its name. */
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
 */
export function AddReceiptModal({ open, onClose, presetPurpose, onSaved }: AddReceiptModalProps) {
  const [saving, setSaving] = useState(false);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [otherPurposes, setOtherPurposes] = useState(false);
  const [cashForm, setCashForm] = useState({ amount: "", purpose: presetPurpose || "Combined Offering", donor_name: "", giver_phone: "", giver_email: "", received_on: localDate() });
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
          .filter(Boolean);
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

  // Adopt the caller's preset purpose when the modal opens (a fund drive's
  // account name) — after the purposes list settles.
  useEffect(() => {
    if (!open) return;
    if (presetPurpose) {
      setOtherPurposes(false);
      setCashForm((prev) => ({ ...prev, purpose: presetPurpose }));
    } else {
      setOtherPurposes(false);
    }
  }, [open, presetPurpose]);

  const formatReceiptDefaultMsg = (name: string, amt: string, purp: string, custPurp: string) => {
    const nameVal = name.trim() || "{name}";
    const amountVal = amt.trim() ? `kes ${amt.trim()}` : "kes {amount}";
    const purposeVal = otherPurposes ? (custPurp.trim() || "{purpose}") : (purp || "{purpose}");
    return settingsReceiptTemplate
      .replace("{name}", nameVal)
      .replace("{amount}", amountVal)
      .replace("{purpose}", purposeVal);
  };

  useEffect(() => {
    if (open && !isCustomMessage) {
      setReceiptMessage(formatReceiptDefaultMsg(cashForm.donor_name, cashForm.amount, cashForm.purpose, customPurpose));
    }
  }, [open, isCustomMessage, cashForm.donor_name, cashForm.amount, cashForm.purpose, customPurpose, otherPurposes]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);

    const finalPurpose = otherPurposes && customPurpose.trim() ? customPurpose.trim() : cashForm.purpose;
    if (otherPurposes && customPurpose.trim()) {
      const words = customPurpose.trim().split(/\s+/);
      if (words.length > 2) {
        showAlert("Too Many Words", "Custom giving purpose must be at most 2 words (e.g. 'Youth' or 'Camp Goal').", "error");
        setSaving(false);
        return;
      }
      if (customPurpose.trim().length > 20) {
        showAlert("Too Long", "Custom giving purpose must be at most 20 characters.", "error");
        setSaving(false);
        return;
      }
    }

    const response = await fetch(`${API_URL}/api/members/treasury/cash-contributions/`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        ...cashForm,
        purpose: finalPurpose,
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
      showAlert("Could Not Save Receipt", body.amount?.[0] || body.detail || "Please check the details and try again.", "error");
      return;
    }

    const deliveryMessage = (await response.clone().json().catch(() => ({}))).receipt_delivery_message || "Receipt saved successfully.";
    onSaved?.(deliveryMessage, { received_on: cashForm.received_on });
    setCashForm({ amount: "", purpose: presetPurpose || "Combined Offering", donor_name: "", giver_phone: "", giver_email: "", received_on: localDate() });
    setPaymentMethod("cash");
    setCustomPurpose("");
    setOtherPurposes(false);
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
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-[#dfdbd1]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
          <div>
            <h2 className="text-xl font-semibold text-[#26352f]">Add Receipt</h2>
            <p className="mt-0.5 text-xs text-[#617068]">Record a manual payment or contribution for treasury reconciliation.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Method of Giving */}
          <label className="text-sm font-medium text-[#26352f]">
            Method of Giving
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
            >
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="bank_transfer">Bank-to-Bank</option>
              <option value="cheque">Cheque</option>
            </select>
          </label>

          {/* Receipt Date */}
          <label className="text-sm font-medium text-[#26352f]">
            Receipt Date
            <input
              type="date"
              required
              value={cashForm.received_on}
              onChange={(e) => setCashForm({ ...cashForm, received_on: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
            />
          </label>

          {/* Giving Purpose */}
          <label className="text-sm font-medium text-[#26352f]">
            Giving Purpose
            {otherPurposes ? (
              <input
                required
                placeholder="Enter custom purpose..."
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
              />
            ) : (
            <select
              required
              value={cashForm.purpose}
              onChange={(e) => {
                if (e.target.value === "__other__") {
                  setOtherPurposes(true);
                  setCustomPurpose("");
                } else {
                  setOtherPurposes(false);
                  setCashForm({ ...cashForm, purpose: e.target.value });
                }
              }}
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
            >
                {purposes.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__other__">Other…</option>
              </select>
            )}
          </label>

          {/* Amount */}
          <label className="text-sm font-medium text-[#26352f]">
            Amount (KES)
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              value={cashForm.amount}
              onChange={(e) => setCashForm({ ...cashForm, amount: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
              placeholder="0.00"
            />
          </label>

          <label className="text-sm font-medium text-[#26352f]">
            Giver Full Name
            <input
              required
              value={cashForm.donor_name}
              onChange={(e) => setCashForm({ ...cashForm, donor_name: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
              placeholder="e.g. Jane Doe"
            />
          </label>

          <label className="text-sm font-medium text-[#26352f]">
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
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
            />
          </label>

          <label className="text-sm font-medium text-[#26352f]">
            Email (optional)
            <input
              type="email"
              placeholder="giver@example.com"
              value={cashForm.giver_email}
              onChange={(e) => setCashForm({ ...cashForm, giver_email: e.target.value })}
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
            />
          </label>

          <div className="rounded-xl bg-[#f4f7f4] px-3 py-2 text-xs text-[#617068] sm:col-span-2">
            <p className="font-semibold text-[#26352f]">Send receipt through</p>
            <div className="mt-2 flex gap-5">
              <label className="flex items-center gap-2"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} /> SMS</label>
            </div>
            <p className="mt-1">SMS will report that only email was sent until an SMS gateway is configured.</p>
          </div>

          {/* Receipt Notes Textarea */}
          <label className="text-sm font-medium text-[#26352f] sm:col-span-2">
            <div className="flex items-center justify-between pb-1">
              <span>Receipt Notes</span>
              {isCustomMessage && (
                <button
                  type="button"
                  onClick={() => setIsCustomMessage(false)}
                  className="text-xs font-semibold text-[#b36b3c] hover:underline"
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
              className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c] leading-relaxed"
            />
          </label>

          <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-4 border-t border-[#dfdbd1]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#c9c5bb] px-5 py-2 text-sm font-semibold text-[#617068] hover:bg-[#f7f4ee]"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              className="rounded-full bg-[#b36b3c] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Send Receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
