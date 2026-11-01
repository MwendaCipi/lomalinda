"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, MessageSquare, Phone, X } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { ComboboxPopover } from "@/components/combobox-popover";
import { ContactModal, waMeNumber } from "@/components/contact-modal";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { openConversation } from "@/lib/chat";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** One paybill payment held for a treasurer's assignment. */
export type HeldPayment = {
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
 *  hides an account from the picker. */
export type AccountOption = {
  id: number;
  name: string;
  label: string;
  department_id: number | null;
};

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
 * The assignment modal: the account combo, the giver's contact slots, and the
 * receipt — one press files the gift and thanks the giver.
 *
 * The combo is the same ticking popover the desk used inline: tick an account,
 * type its share, and the amounts must add up to the payment. The email slot
 * is filled with the payer's address as Safaricom sent it; the phone slot
 * offers the SMS channel. Both empty means no receipt — the assignment still
 * stands, the giver just hears nothing from this press.
 */
export function AssignPaymentModal({
  row,
  accounts,
  defaultReceipt,
  onClose,
  onAssigned,
  reassign = false,
}: {
  row: HeldPayment;
  accounts: AccountOption[];
  defaultReceipt: string;
  onClose: () => void;
  onAssigned: (row: HeldPayment) => void;
  reassign?: boolean;
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
        reassign: reassign ? true : undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const receipt = data.receipt as { email_sent?: boolean; sms_sent?: boolean } | null;
          const thanked = receipt ? [receipt.email_sent && "email", receipt.sms_sent && "SMS"].filter(Boolean).join(" and ") : "";
          showAlert(
            reassign ? "Payment reassigned" : "Payment assigned",
            thanked
              ? `Credited across ${picked.length} account(s). Receipt sent by ${thanked}.`
              : data.detail || `Credited across ${picked.length} account(s).`,
            "success",
            { toast: true, timer: 3500, showConfirmButton: false },
          );
          onAssigned(row);
          onClose();
        } else {
          showAlert(reassign ? "Could not reassign" : "Could not assign", data.detail || "Try again.", "error");
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
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-sand-line px-6 pb-3 pt-6 sm:px-8 sm:pt-8">
          <div>
            <p className="hidden text-[10px] font-extrabold uppercase tracking-wider text-ember sm:block">
              {reassign ? "Reassign payment" : "Unassigned payment"}
            </p>
            <h3 id="assign-payment-title" className="text-lg font-bold text-bark">
              {reassign ? "Reassign" : "Assign"} KES {Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-5 sm:px-8">
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

        </div>
        {/* The always-visible assign row at the foot — the requests modals' pattern. */}
        <div className="shrink-0 border-t border-sand-line px-6 pb-5 pt-3 sm:px-8">
          <button
            type="button"
            onClick={assign}
            disabled={sending}
            className="w-full rounded-xl bg-ember px-5 py-3 text-sm font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
          >
            {sending ? (reassign ? "Reassigning…" : "Assigning…") : (reassign ? "Reassign" : "Assign")}
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
export function ContactGiverModal({ row, onClose }: { row: HeldPayment; onClose: () => void }) {
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
 * The treasury keeps many church accounts, so a table of inline checkboxes
 * would bury the payment under them. The trigger hugs one line — the picked
 * account's name, or a count — and the popover carries the ticking and the
 * amount for each tick, the way the users table's role picker does. Where the
 * assignment modal hosts it, the popover's footer button carries the press
 * home (``footerLabel``).
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
