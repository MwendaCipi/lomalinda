"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Mail, MessageSquare, Phone, Trash2, X } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { ComboboxPopover } from "@/components/combobox-popover";
import { ContactModal, waMeNumber } from "@/components/contact-modal";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { openConversation } from "@/lib/chat";
import { UNASSIGNED_CHANGED_EVENT } from "@/components/treasury-nav";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** One paybill payment held for a treasurer's assignment. */
type HeldPayment = {
  id: number;
  amount: string;
  currency: string;
  typed_reference: string;
  mpesa_receipt_number: string;
  donor_name: string;
  donor_email: string;
  phone_number: string;
  member_id: number | null;
  paid_at: string;
};

/** The accounts a held payment can be assigned to — the same list Treasury →
 *  Church Accounts shows, every treasury account in priority order.
 *  ``department_id`` marks a department's or ministry's fund; it no longer
 *  hides an account from this desk. */
type AccountOption = {
  id: number;
  name: string;
  label: string;
  department_id: number | null;
};

/** A held payment's amount as the desk reads it — the row's own words. */
function amountOf(row: HeldPayment): string {
  return `KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

/** dd/mm/yyyy from an ISO timestamp — the desk's own date reading. */
function dmy(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** An account the treasurer has checked, with the amount credited to it. */
type PickedAccount = { accountId: number; amount: string };

/** The church's receipt template, filled for this payment — the same
    placeholder words the backend renders, so what the desk reads in the
    textarea is what the giver receives. */
function renderReceiptTemplate(
  template: string,
  vars: { name: string; amount: string; account: string }
): string {
  return template
    .replaceAll("{name}", vars.name)
    .replaceAll("{name)", vars.name)
    .replaceAll("{amount}", vars.amount)
    .replaceAll("{amount)", vars.amount)
    .replaceAll("{account}", vars.account)
    .replaceAll("{account)", vars.account)
    .replaceAll("{purpose}", vars.account)
    .replaceAll("{purpose)", vars.account)
    .replace(/\{[a-z_]+[})]/g, "");
}

/**
 * The treasurer's queue of unassigned paybill payments.
 *
 * Safaricom delivers every paybill payment — typed references included — and a
 * reference that names no treasury account (a typo, a blank, a ministry kept
 * outside the treasury) lands here rather than being credited to nothing. The
 * row no longer carries the assignment itself: **Assign** opens a modal with
 * the account combo, the giver's contact slots and the receipt message, so one
 * press both files the gift and thanks the giver; **Contact** opens the
 * church's standard contact sheet for the payer; **Delete** takes a payment
 * the church is not going to keep off the desk altogether — see `removeRow`.
 */
export function UnassignedPaymentsPanel({ onAssigned }: { onAssigned?: () => void }) {
  const [rows, setRows] = useState<HeldPayment[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  /** The payment the assignment modal is open for. */
  const [assigningRow, setAssigningRow] = useState<HeldPayment | null>(null);
  /** The payment the contact sheet is open for. */
  const [contactingRow, setContactingRow] = useState<HeldPayment | null>(null);
  /** The church's default receipt message, prefilled into the modal. */
  const [defaultReceipt, setDefaultReceipt] = useState("");

  const load = () => {
    fetch(`${API_URL}/api/members/treasury/unassigned/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch(`${API_URL}/api/members/giving-accounts/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.default_receipt_message) setDefaultReceipt(data.default_receipt_message);
      })
      .catch(() => {});
  }, []);

  /** Every treasury account, exactly as Treasury → Church Accounts lists
   *  them (LCB and the department funds included). */
  const churchAccounts = accounts;

  const dropRow = (row: HeldPayment) => {
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    onAssigned?.();
    // The strip that leads here is drawn above this desk and counts its rows
    // from its own read: tell it the queue moved, or its badge keeps counting
    // a payment the desk has already filed or removed.
    if (typeof window !== "undefined") window.dispatchEvent(new Event(UNASSIGNED_CHANGED_EVENT));
  };

  /**
   * Take a payment off the desk for good: the office's own test row, a
   * Safaricom message delivered twice, money already returned to the sender by
   * hand. The row is credited to no account and receipted never, so no fund is
   * short by removing it — but it does leave the church's ledger, so the press
   * is confirmed first and says so.
   */
  const removeRow = async (row: HeldPayment) => {
    const amount = `KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
    const result = await showAlert(
      "Remove this payment?",
      `${amount} · ${row.mpesa_receipt_number || "no receipt number"}. It is credited to no account and removes the row from the church's ledger for good.`,
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Remove",
        cancelButtonText: "Keep",
        confirmButtonColor: brand.ember,
      },
    );
    if (!result.isConfirmed) return;
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/unassigned/${row.id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not remove", data.detail || "Try again.", "error");
        return;
      }
      dropRow(row);
      showAlert("Payment removed", data.detail || "It is off the unassigned desk.", "success", {
        toast: true,
        timer: 3500,
        showConfirmButton: false,
      });
    } catch {
      showAlert("Network error", "Could not reach the server.", "error");
    }
  };

  if (!loading && rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Check className="mx-auto h-8 w-8 text-ember" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-bark">Every payment is assigned</p>
          <p className="mt-1 text-xs leading-5 text-moss">
            Paybill payments whose reference names a treasury account land there directly. Anything Safaricom
            sends with an unknown reference waits here for the treasurer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 custom-table-scrollbar sm:px-6">
        {/* Phone cards */}
        <div className="space-y-3 lg:hidden">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-bark">{amountOf(row)}</p>
                  <p className="mt-0.5 text-xs text-moss">
                    Typed: <span className="font-semibold text-bark">{row.typed_reference || "(blank)"}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-moss">
                    {row.mpesa_receipt_number} · {dmy(row.paid_at)}
                  </p>
                  {(row.donor_name || row.phone_number) && (
                    <p className="mt-0.5 text-[11px] text-moss">
                      {[row.donor_name, row.phone_number].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <AlertTriangle className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAssigningRow(row)}
                  className="flex-1 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep"
                >
                  Assign
                </button>
                <button
                  type="button"
                  onClick={() => setContactingRow(row)}
                  className="flex-1 rounded-xl border border-sand-line bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
                >
                  Contact
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(row)}
                  aria-label={`Remove the payment of ${amountOf(row)}`}
                  title="Remove this payment"
                  className="rounded-xl border border-sand-line bg-white px-3 py-2 text-moss transition hover:border-red-300 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-sand-line text-xs uppercase tracking-wider text-moss">
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Typed reference</th>
                <th className="py-2 pr-3">Receipt</th>
                <th className="py-2 pr-3">Paid</th>
                <th className="py-2 pr-3">Giver</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-sand-line/60 align-middle hover:bg-sand">
                  <td className="py-2.5 pr-3 text-xs font-semibold text-bark">{amountOf(row)}</td>
                  <td className="py-2.5 pr-3 text-xs text-bark">
                    <span className="inline-flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
                      {row.typed_reference || "(blank)"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[11px] text-moss">{row.mpesa_receipt_number}</td>
                  <td className="py-2.5 pr-3 text-xs text-moss">{dmy(row.paid_at)}</td>
                  <td className="py-2.5 pr-3 text-xs text-moss">
                    {[row.donor_name, row.phone_number].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAssigningRow(row)}
                        className="rounded-xl bg-ember px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ember-deep"
                      >
                        Assign
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactingRow(row)}
                        className="rounded-xl border border-sand-line bg-white px-3 py-1.5 text-[11px] font-semibold text-bark transition hover:border-ember hover:text-ember"
                      >
                        Contact
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row)}
                        aria-label={`Remove the payment of ${amountOf(row)}`}
                        title="Remove this payment"
                        className="rounded-xl border border-sand-line bg-white px-2.5 py-1.5 text-moss transition hover:border-red-300 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {assigningRow && (
        <AssignPaymentModal
          row={assigningRow}
          accounts={churchAccounts}
          defaultReceipt={defaultReceipt}
          onClose={() => setAssigningRow(null)}
          onAssigned={dropRow}
        />
      )}
      {contactingRow && (
        <ContactGiverModal row={contactingRow} onClose={() => setContactingRow(null)} />
      )}
    </div>
  );
}

/**
 * The assignment modal: the account combo, the giver's contact slots, and the
 * receipt — one press files the gift and thanks the giver.
 *
 * The combo is the same ticking popover the desk used inline: tick an account,
 * type its share, and the amounts must add up to the payment. The email slot
 * is filled with the payer's address as Safaricom sent it; the phone slot
 * offers the SMS channel. Both empty means no receipt — the assignment still
 * stands, the giver just hears nothing from this press.
 */
function AssignPaymentModal({
  row,
  accounts,
  defaultReceipt,
  onClose,
  onAssigned,
}: {
  row: HeldPayment;
  accounts: AccountOption[];
  defaultReceipt: string;
  onClose: () => void;
  onAssigned: (row: HeldPayment) => void;
}) {
  const [picked, setPicked] = useState<PickedAccount[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [email, setEmail] = useState(row.donor_email || "");
  const [phone, setPhone] = useState(row.phone_number || "");
  // The message the desk will send, prefilled with the church's own words
  // rendered for this giver; editing it is the whole point of the slot.
  const [message, setMessage] = useState(() =>
    renderReceiptTemplate(defaultReceipt || "Dear {name},\n\nYour contribution of {amount} towards {account} has been received. Thank you, and may God bless you abundantly", {
      name: row.donor_name || "friend",
      amount: `${row.currency} ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`,
      account: row.typed_reference || "the church",
    })
  );
  const [sending, setSending] = useState(false);

  // The church's default may arrive after the first render (the settings
  // fetch races the tap). Fill the slot only while it still holds what this
  // component generated, never a live edit — adjusted during render rather
  // than by an effect, so a late template still lands in an untouched box.
  const [seededWith, setSeededWith] = useState(defaultReceipt);
  if (defaultReceipt && seededWith !== defaultReceipt) {
    setSeededWith(defaultReceipt);
    setMessage(
      renderReceiptTemplate(defaultReceipt, {
        name: row.donor_name || "friend",
        amount: `${row.currency} ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`,
        account: row.typed_reference || "the church",
      })
    );
  }

  const pickedTotal = picked.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const amountsFit = picked.length > 0 && Math.abs(pickedTotal - Number(row.amount)) < 0.01;
  /** What is left of the gift to appropriate — it falls with every figure
   *  typed, and goes negative the moment the split outgives the giver. */
  const remaining = Number(row.amount) - pickedTotal;

  const toggleAccount = (account: AccountOption) => {
    setPicked((current) => {
      const existing = current.find((p) => p.accountId === account.id);
      if (existing) return current.filter((p) => p.accountId !== account.id);
      // New account: an empty slot reading 0 — ticking alone appropriates
      // nothing; the treasurer types each share by hand.
      return [...current, { accountId: account.id, amount: "0" }];
    });
  };

  const updateAmount = (accountId: number, amount: string) => {
    setPicked((current) => current.map((p) => (p.accountId === accountId ? { ...p, amount } : p)));
  };

  const assign = () => {
    if (picked.length === 0) {
      showAlert("Choose an account", "Check at least one account to credit.", "warning");
      return;
    }
    if (picked.some((p) => (parseFloat(p.amount) || 0) <= 0)) {
      showAlert("Enter an amount", "Every chosen account needs an amount above zero.", "warning");
      return;
    }
    if (pickedTotal > Number(row.amount)) {
      showAlert(
        "More than the giver gave",
        `The allocations add up to KES ${pickedTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}, but the gift is only KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}.`,
        "warning",
      );
      return;
    }
    if (!amountsFit) {
      showAlert(
        "Amounts don't add up",
        `The amounts you entered (KES ${pickedTotal.toLocaleString("en-KE")}) must equal the payment (KES ${Number(row.amount).toLocaleString("en-KE")}).`,
        "warning",
      );
      return;
    }
    setSending(true);
    fetch(`${API_URL}/api/members/treasury/contributions/${row.id}/assign/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        allocations: picked.map((p) => ({ account_id: p.accountId, amount: p.amount })),
        receipt_email: email.trim(),
        receipt_phone: phone.trim(),
        receipt_message: message.trim(),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const receipt = data.receipt as { email_sent?: boolean; sms_sent?: boolean } | null;
          const thanked = receipt ? [receipt.email_sent && "email", receipt.sms_sent && "SMS"].filter(Boolean).join(" and ") : "";
          showAlert(
            "Payment assigned",
            thanked
              ? `Credited across ${picked.length} account(s). Receipt sent by ${thanked}.`
              : data.detail || `Credited across ${picked.length} account(s).`,
            "success",
            { toast: true, timer: 3500, showConfirmButton: false },
          );
          onAssigned(row);
          onClose();
        } else {
          showAlert("Could not assign", data.detail || "Try again.", "error");
        }
      })
      .catch(() => showAlert("Network error", "Could not reach the server.", "error"))
      .finally(() => setSending(false));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-payment-title"
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-sand-line pb-3">
          <div>
            <p className="hidden text-[10px] font-extrabold uppercase tracking-wider text-ember sm:block">
              Unassigned payment
            </p>
            <h3 id="assign-payment-title" className="text-lg font-bold text-bark">
              Assign KES {Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
            </h3>
            <p className="mt-0.5 text-[11px] text-moss">
              Typed: {row.typed_reference || "(blank)"} · {row.mpesa_receipt_number} · {dmy(row.paid_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            className="text-xl leading-none text-moss hover:text-bark"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* The account combo — the same ticking popover, now inside the
              modal so the row itself stays one line of text. */}
          <div>
            <label className="block text-xs font-semibold text-bark">Account{picked.length === 1 ? "" : "s"}</label>
            <div className="mt-1.5">
              <AccountsPicker
                accounts={accounts}
                paymentAmount={row.amount}
                remaining={remaining}
                picked={picked}
                onToggle={toggleAccount}
                onAmount={updateAmount}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                fill
                footerLabel="Assign"
                onFooterAction={() => {
                  setPickerOpen(false);
                  assign();
                }}
              />
            </div>
            <PickedSummary picked={picked} accounts={accounts} className="mt-1.5" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-bark">Email the receipt to</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={row.donor_email || "No email on file"}
                className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-bark">SMS the receipt to (optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder={row.phone_number || "No number on file"}
                className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none"
              />
            </div>
          </div>
          {!email.trim() && !phone.trim() && (
            <p className="text-[11px] text-moss">
              No contact yet. The gift will be filed, but the giver will not be thanked from here.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-bark">Receipt message</label>
            <textarea
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-sand-line bg-sand px-4 py-3 text-xs focus:border-ember focus:outline-none"
            />
          </div>

          {/* What is left of the gift to appropriate — it falls with every
              allocation, and a negative figure means the split would take
              more than the giver gave (which Assign then refuses). */}
          <div
            className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs ${
              remaining < -0.005
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-sand-line bg-sand text-moss"
            }`}
          >
            <span className="font-semibold">Available to appropriate</span>
            <span className="font-bold">
              KES {remaining.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <button
            type="button"
            onClick={assign}
            disabled={sending}
            className="w-full rounded-xl bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            {sending ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The payer's contact sheet — the church's standard options, on the payment's
 * own details. Chat appears only where the payer turned out to be a member
 * with an account; the rest work off whatever Safaricom sent.
 */
function ContactGiverModal({ row, onClose }: { row: HeldPayment; onClose: () => void }) {
  const giver = row.donor_name || "the giver";
  const chatHere = async () => {
    onClose();
    try {
      await openConversation({ kind: "dm", member_id: row.member_id as number });
      window.location.href = `/chat?dm=${row.member_id}`;
    } catch (error) {
      showAlert("Could not open chat", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  return (
    <ContactModal
      onClose={onClose}
      title={`Contact ${giver}`}
      subtitle={[row.mpesa_receipt_number, `KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`].filter(Boolean).join(" · ")}
      actions={[
        {
          key: "call",
          icon: <Phone size={14} className="shrink-0 text-ember" aria-hidden="true" />,
          label: "Call",
          detail: row.phone_number || "No phone number on this payment",
          href: row.phone_number ? `tel:${row.phone_number}` : undefined,
          disabled: !row.phone_number,
          onClick: onClose,
        },
        ...(row.member_id
          ? [
              {
                key: "chat-here",
                icon: <MessageSquare size={14} className="shrink-0 text-ember" aria-hidden="true" />,
                label: "Chat here",
                detail: "Open a direct message in this app",
                onClick: chatHere,
              },
            ]
          : []),
        {
          key: "whatsapp",
          icon: <WhatsAppIcon className="shrink-0 text-ember" />,
          label: "WhatsApp",
          detail: row.phone_number
            ? `${row.phone_number}${row.donor_name ? "" : " (number on payment)"}`
            : "No number on this payment",
          href: row.phone_number ? `https://wa.me/${waMeNumber(row.phone_number)}` : undefined,
          disabled: !row.phone_number,
          onClick: onClose,
        },
        {
          key: "email",
          icon: <Mail size={14} className="shrink-0 text-ember" aria-hidden="true" />,
          label: "Email",
          detail: row.donor_email || "No email on this payment",
          href: row.donor_email ? `mailto:${row.donor_email}` : undefined,
          disabled: !row.donor_email,
          onClick: onClose,
        },
      ]}
    />
  );
}

/**
 * One row's account picker: a combo box whose popover holds the checkboxes.
 *
 * The unassigned desk lists every church account the treasury keeps, so a
 * table of inline checkboxes grows with each account and buries the payment
 * rows. The trigger hugs one line — the picked account's name, or a count —
 * and the popover carries the ticking and the amount for each tick, the way
 * the users table's role picker does. Where the assignment modal hosts it,
 * the popover's footer button carries the press home (``footerLabel``).
 */
function AccountsPicker({
  accounts,
  paymentAmount,
  remaining,
  picked,
  onToggle,
  onAmount,
  open,
  onOpenChange,
  fill = false,
  footerLabel = "Done",
  onFooterAction,
}: {
  accounts: AccountOption[];
  paymentAmount: string;
  /** Left of the gift — negative once the ticks outgive it. */
  remaining: number;
  picked: PickedAccount[];
  onToggle: (account: AccountOption) => void;
  onAmount: (accountId: number, amount: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fill?: boolean;
  /** The popover footer's button word — "Done" standalone, "Assign" in the modal. */
  footerLabel?: string;
  /** Runs (then closes) instead of merely closing, when the press should submit. */
  onFooterAction?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body (see ComboboxPopover), so outside-click
  // must count it as inside or the first click inside would close the picker.
  const panelRef = useRef<HTMLDivElement>(null);
  /** Only the breakpoint twin on screen owns the popover: the phone cards and
   *  the desktop table both mount a picker per row, and the hidden twin's
   *  zero-size anchor would measure to the page's corner and float a second
   *  popover there. */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(open && (containerRef.current?.offsetWidth ?? 0) > 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        onOpenChange(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  const paymentTotal = parseFloat(paymentAmount) || 0;
  const credited = picked.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const names = picked
    .map((p) => accounts.find((a) => a.id === p.accountId)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className={`relative ${fill ? "block" : "inline-block"}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`${fill ? "flex w-full justify-between" : "inline-flex"} items-center gap-1.5 rounded-xl border border-sand-line bg-white px-2.5 py-1.5 text-xs font-medium text-bark transition hover:border-ember focus:border-ember focus:outline-none`}
      >
        <span className="min-w-0 truncate">
          {picked.length === 0
            ? "Choose accounts"
            : picked.length === 1
              ? names[0] ?? "1 account"
              : `${names[0] ?? "Accounts"} +${picked.length - 1} more`}
        </span>
        <svg className={`h-3 w-3 shrink-0 text-moss transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <ComboboxPopover
        anchorRef={containerRef}
        panelRef={panelRef}
        open={mounted}
        minW={300}
        panelClassName="rounded-xl border border-sand-line bg-white shadow-lg overflow-hidden"
      >
        <div className="max-h-72 overflow-y-auto custom-table-scrollbar">
          <div className="sticky top-0 z-10 border-b border-sand-paper bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-moss">
            Church account
          </div>
          {accounts.map((a) => {
            const entry = picked.find((p) => p.accountId === a.id);
            const checked = Boolean(entry);
            const detail = a.label && a.label !== a.name ? a.label : "";
            return (
              <div key={a.id} className={`flex items-center gap-2 pr-2.5 ${checked ? "bg-mist-select" : "hover:bg-sand"}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => onToggle(a)}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-left text-xs transition ${
                    checked ? "font-semibold text-bark" : "text-moss-dark"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      checked ? "border-ember bg-ember text-white" : "border-sand-mute bg-white"
                    }`}
                  >
                    {checked && (
                      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{a.name}</span>
                    {detail && <span className="block truncate text-[10px] font-normal text-moss">{detail}</span>}
                  </span>
                </button>
                {checked && (
                  <input
                    type="number"
                    min="0"
                    max={paymentTotal}
                    step="0.01"
                    value={entry?.amount ?? ""}
                    onChange={(e) => onAmount(a.id, e.target.value)}
                    className="w-20 shrink-0 rounded-lg border border-sand-line bg-white px-2 py-1 text-xs font-semibold text-bark text-right outline-none focus:border-ember"
                    aria-label={`Amount for ${a.name}`}
                  />
                )}
              </div>
            );
          })}
          {accounts.length === 0 && (
            <p className="px-3 py-3 text-xs text-moss">No church accounts yet.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-sand-paper bg-white px-3 py-2">
          <span
            className={`text-[10px] ${
              remaining < -0.005
                ? "font-semibold text-red-700"
                : credited > 0
                  ? "font-semibold text-ember"
                  : "text-moss"
            }`}
          >
            {remaining < -0.005
              ? `KES ${(-remaining).toLocaleString("en-KE", { minimumFractionDigits: 2 })} more than the gift`
              : credited > 0
                ? `KES ${credited.toLocaleString("en-KE", { minimumFractionDigits: 2 })} of KES ${paymentTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`
                : "Tick an account to credit"}
          </span>
          <button
            type="button"
            onClick={() => {
              if (onFooterAction) {
                onFooterAction();
                return;
              }
              onOpenChange(false);
            }}
            className="rounded-xl bg-bark px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-ember"
          >
            {footerLabel}
          </button>
        </div>
      </ComboboxPopover>
    </div>
  );
}

/** The accounts this payment will be credited to, one compact line each —
 *  the picker closed, the treasurer still sees the split before Assign. */
function PickedSummary({
  picked,
  accounts,
  className = "",
}: {
  picked: PickedAccount[];
  accounts: AccountOption[];
  className?: string;
}) {
  if (picked.length === 0) return null;
  return (
    <ul className={`space-y-0.5 ${className}`}>
      {picked.map((p) => {
        const account = accounts.find((a) => a.id === p.accountId);
        return (
          <li key={p.accountId} className="text-[11px] text-moss">
            <span className="font-semibold text-bark">{account?.name ?? "Account"}</span>
            {" · KES "}
            {(parseFloat(p.amount) || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
          </li>
        );
      })}
    </ul>
  );
}
