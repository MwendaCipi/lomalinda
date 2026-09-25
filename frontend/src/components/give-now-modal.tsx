"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type MethodOfGiving = "mpesa" | "bank_transfer";

type GivingAccountOption = {
  id: number;
  name: string;
  label: string;
  account: string;
  account_type: string;
  account_type_display: string;
};

/** The fallback list, only reached if the accounts endpoint is unreachable. */
const defaultPurposes = [
  "Tithe",
  "Combined Offering",
  "Local Church Budget",
  "Camp Offering",
  "Thanksgiving",
  "Other",
];

export type GiveNowModalProps = {
  open: boolean;
  onClose: () => void;
  /** The account a support link named, preselected in the picker. */
  presetAccount?: string;
};

/**
 * The give-now payment modal, extracted from the money-giving page so any
 * stewardship surface — live reports' "Support this account" above all — can
 * open it in place. Cancelling returns the member to whatever page they were
 * reading instead of navigating anywhere.
 */
export function GiveNowModal({ open, onClose, presetAccount }: GiveNowModalProps) {
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(presetAccount ? [presetAccount] : []);
  const [accountAmounts, setAccountAmounts] = useState<Record<string, string>>({});
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const accountPickerRef = useRef<HTMLDivElement | null>(null);
  const [methodOfGiving, setMethodOfGiving] = useState<MethodOfGiving>("mpesa");
  const [purposes, setPurposes] = useState<GivingAccountOption[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bankRefNumber, setBankRefNumber] = useState("");
  const [senderBankName, setSenderBankName] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  // The address currently on the member's account, kept apart from what they
  // have typed so the form can tell "the same" from "changed, and not saved yet".
  const [accountEmail, setAccountEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  const toggleAccount = (account: string) => {
    setSelectedAccounts((current) =>
      current.includes(account) ? current.filter((item) => item !== account) : [...current, account]
    );
  };

  // Opening the modal never wears the previous attempt's message, and each
  // opening adopts the account the caller named.
  useEffect(() => {
    if (!open) return;
    setMessage("");
    if (presetAccount) setSelectedAccounts([presetAccount]);
  }, [open, presetAccount]);

  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem("access_token");
    if (token) {
      setSignedIn(true);
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((me) => {
          if (!me) return;
          const full = `${me.first_name || ""} ${me.last_name || ""}`.trim() || me.username || "";
          setDonorName((current) => (current ? current : full));
          setAccountEmail(me.email || "");
          setDonorEmail((current) => (current ? current : me.email || ""));
        })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Treasury accounts are the one source of giving accounts, priority-ordered
    // by the API (Tithe, offerings, budget, camp funds, then the rest).
    fetch(`${API_URL}/api/members/giving-accounts/`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: GivingAccountOption[]) => {
        setPurposes(data.length ? data : defaultPurposes.map((name) => ({ id: -1, name: name.slice(0, 12), label: name, account: name.slice(0, 12), account_type: "other", account_type_display: "Other" })));
      })
      .catch(() => setPurposes(defaultPurposes.map((name) => ({ id: -1, name: name.slice(0, 12), label: name, account: name.slice(0, 12), account_type: "other", account_type_display: "Other" }))));
  }, [open]);

  // The account list behaves like a dropdown: tapping anywhere outside it —
  // the rest of the form, the amount rows it opens over, the backdrop — closes
  // it, and so does Escape. The trigger is inside the ref, so its own tap
  // still toggles rather than closing and instantly reopening.
  useEffect(() => {
    if (!open || !showAccountPicker) return;
    const closeOnOutsideTap = (event: PointerEvent) => {
      if (!accountPickerRef.current?.contains(event.target as Node)) setShowAccountPicker(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAccountPicker(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideTap);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideTap);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, showAccountPicker]);

  // Escape closes the whole modal when the picker is not open.
  useEffect(() => {
    if (!open || showAccountPicker) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, showAccountPicker, onClose]);

  /**
   * Phones: lift the focused field clear of the software keyboard.
   *
   * The keyboard overlays the page rather than resizing it on a phone, so a
   * field near the foot of the modal ends up underneath it — you type blind.
   * The browser's own scroll happens while the keyboard is still animating, so
   * this waits for it to settle and then centres the field in the modal.
   */
  function liftAboveKeyboard(event: React.FocusEvent<HTMLInputElement>) {
    const field = event.currentTarget;
    if (window.innerWidth >= 640) return;
    window.setTimeout(() => {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 350);
  }

  const allocationTotal = selectedAccounts.reduce(
    (sum, account) => sum + (Number(accountAmounts[account]) || 0),
    0
  );

  const accountPickerLabel =
    selectedAccounts.length === 0
      ? "-- select --"
      : selectedAccounts.length === 1
        ? selectedAccounts[0]
        : `${selectedAccounts[0]} +${selectedAccounts.length - 1} more`;

  const [churchBankDetails, setChurchBankDetails] = useState({
    bank_name: "—",
    bank_account_name: "—",
    bank_account_number: "—",
    bank_branch: "—",
    bank_swift_code: "—",
  });

  useEffect(() => {
    if (!open) return;
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data) return;
        setChurchBankDetails({
          bank_name: data.bank_name || "—",
          bank_account_name: data.bank_account_name || "—",
          bank_account_number: data.bank_account_number || "—",
          bank_branch: data.bank_branch || "—",
          bank_swift_code: data.bank_swift_code || "—",
        });
      })
      .catch(() => {});
  }, [open]);

  async function submitGiving(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    try {
      if (selectedAccounts.length === 0) {
        showAlert("Choose an account", "Select at least one account to give to.", "warning");
        setLoading(false);
        return;
      }
      const withoutAmount = selectedAccounts.find((account) => (Number(accountAmounts[account]) || 0) < 1);
      if (withoutAmount) {
        showAlert("Amount needed", `Enter an amount of at least KES 1 for ${withoutAmount}.`, "warning");
        setLoading(false);
        return;
      }
      // The ledger records the wording givers read (the description); the
      // M-Pesa prompt shows the account, which Safaricom caps at 12 characters.
      const accountByName = new Map(purposes.map((option) => [option.label, option.account]));
      const allocations = selectedAccounts.map((account) => ({
        purpose: account,
        account: accountByName.get(account) || account.slice(0, 12),
        amount: Number(accountAmounts[account]) || 0,
      }));

      if (methodOfGiving === "mpesa") {
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        if (cleanPhone.length !== 10) {
          showAlert("Invalid Phone Number", "Please enter a valid 10-digit phone number.", "warning");
          setLoading(false);
          return;
        }
      }

      // The receipt is addressed from the account, so an address typed here IS
      // a change to the account — saved before the gift is initiated, while the
      // ledger row and the M-Pesa callback would still read the old one. A
      // blank field deliberately clears it, leaving the phone as the receipt.
      const typedEmail = donorEmail.trim();
      if (signedIn && token && typedEmail.toLowerCase() !== accountEmail.trim().toLowerCase()) {
        const saveResponse = await fetch(`${API_URL}/api/members/me/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: typedEmail }),
        });
        if (!saveResponse.ok) {
          const problem = await saveResponse.json().catch(() => ({}));
          throw new Error(
            problem.email?.[0] || problem.detail || "That email address could not be saved to your account."
          );
        }
        const saved = await saveResponse.json().catch(() => null);
        setAccountEmail(saved?.email ?? typedEmail);
      }

      let descriptionPayload = "";
      if (methodOfGiving === "bank_transfer") {
        const details = [
          bankRefNumber ? `Ref: ${bankRefNumber}` : "",
          senderBankName ? `From: ${senderBankName}` : "",
          transferDate ? `Date: ${transferDate}` : "",
        ].filter(Boolean).join(" | ");
        descriptionPayload = details || "Bank Transfer";
      }

      const payload: Record<string, unknown> = {
        giving_type: "financial",
        payment_method: methodOfGiving,
        // The whole gift, split per account. The API totals it for the prompt.
        allocations,
        amount: allocationTotal,
        purpose: allocations[0].purpose,
        phone_number: phoneNumber,
        item_description: descriptionPayload,
        donor_email: donorEmail,
      };

      const response = await fetch(`${API_URL}/api/members/contributions/initiate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || Object.values(data).flat().join(" ") || "We could not start the giving request.");
      }

      if (methodOfGiving === "mpesa") {
        const promptMessage = data.message ?? "M-Pesa prompt sent. Enter your PIN on your phone to complete the payment.";
        setLoading(false);
        // The toast carries it; printing the same sentence into the form as well
        // left it waiting at the top of the next visit to the modal.
        showAlert("M-Pesa prompt sent", promptMessage, "info", {
          toast: true,
          position: "top-end",
          timer: 7000,
          showConfirmButton: false,
        });
      } else {
        const successMsg = data.message ?? "Thank you! Your Bank Transfer contribution details have been recorded.";
        showAlert("Contribution Received", successMsg, "success");
        setLoading(false);
      }
      onClose();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unable to connect to the giving service.";
      setMessage(errorMsg);
      showAlert("Giving Error", errorMsg, "error");
      setLoading(false);
    }
  }

  let submitButtonText = "Submit Bank-to-Bank Giving";
  if (loading) submitButtonText = "Submitting...";
  else if (methodOfGiving === "mpesa") submitButtonText = "Continue with M-Pesa";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="give-modal-title"
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-[#dfdbd1] sm:p-8"
      >
        <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3">
          <div>
            {/* Phones open this modal short of room, so the eyebrow stays on wider screens. */}
            <p className="hidden text-[10px] font-extrabold uppercase tracking-wider text-[#b36b3c] sm:block">Money Giving</p>
            <h3 id="give-modal-title" className="text-lg font-bold text-[#26352f]">Give Now</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-xl leading-none text-[#617068] hover:text-[#26352f]"
          >
            ✕
          </button>
        </div>

        <form
          id="give-form"
          onSubmit={submitGiving}
          className="mt-5 space-y-5"
        >
          {message && (
            <div className="rounded-2xl bg-[#f7f4ee] border border-[#dfdbd1] p-4 text-xs font-semibold text-[#26352f]">
              {message}
            </div>
          )}

          {/* 1. Who is giving — asked first, and prefilled for a signed-in
              member. The email is the one on their account, because that is
              where a receipt is addressed from; it stays editable so a
              member without one can add it and still be receipted. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-[#26352f]">
              Your name
              <input
                value={donorName}
                onChange={(event) => setDonorName(event.target.value)}
                placeholder="Full name"
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
              />
            </label>

            {signedIn ? (
              <label className="block text-sm font-medium text-[#26352f]">
                Email
                <input
                  type="email"
                  value={donorEmail}
                  onChange={(event) => setDonorEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
                <span className="mt-1 block text-[11px] font-normal text-[#617068]">
                  {!donorEmail.trim()
                    ? "No email — receipts only go by SMS to the phone you give with. Type one here and we'll save it to your account."
                    : donorEmail.trim().toLowerCase() === accountEmail.trim().toLowerCase()
                      ? "This is the address on your account; your receipt goes here."
                      : "We'll save this to your account so your receipt can reach you."}
                </span>
              </label>
            ) : (
              <div className="flex flex-col justify-end pb-1 text-[11px] font-normal leading-relaxed text-[#617068]">
                Receipts are only emailed to the verified address on a member&apos;s account. Sign in and this field fills itself in.
              </div>
            )}
          </div>

          {/* 2. Method of Giving & Giving Accounts — how the money moves
              is asked for first, then which accounts it goes to. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block self-start text-sm font-medium text-[#26352f]">
              Method of Giving
              <select
                value={methodOfGiving}
                onChange={(event) => setMethodOfGiving(event.target.value as MethodOfGiving)}
                className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
              >
                <option value="mpesa">M-Pesa</option>
                <option value="bank_transfer">Bank-to-Bank</option>
              </select>
            </label>

            <div className="block self-start text-sm font-medium text-[#26352f]">
              <span>Giving accounts</span>
              <div className="relative mt-2" ref={accountPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowAccountPicker((open) => !open)}
                  aria-expanded={showAccountPicker}
                  aria-label="Choose giving accounts"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-left text-sm outline-none transition hover:border-[#b36b3c] focus:border-[#b36b3c]"
                >
                  <span className={`min-w-0 truncate ${selectedAccounts.length ? "text-[#26352f]" : "text-[#8a948d]"}`}>
                    {accountPickerLabel}
                  </span>
                  <span className="shrink-0 text-[10px] text-[#617068]">▼</span>
                </button>

                {showAccountPicker && (
                  /* Opens upward: the fields that follow (amounts, M-Pesa
                     details, the submit button) sit under this row and the
                     list used to cover them. */
                  <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 flex flex-col overflow-hidden rounded-2xl border border-[#dfdbd1] bg-white shadow-xl">
                    <div className="max-h-56 overflow-y-auto p-2">
                      {purposes.map((item) => {
                        const checked = selectedAccounts.includes(item.label);
                        return (
                          <label
                            key={`${item.id}-${item.label}`}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition hover:bg-[#f7f4ee] ${checked ? "bg-[#eef2ed] font-semibold text-[#26352f]" : "text-[#3d5148]"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAccount(item.label)}
                              className="h-4 w-4 shrink-0 rounded border-[#c9c5bb] text-[#3d7146] focus:ring-[#3d7146]"
                            />
                            <span className="min-w-0 flex-1 truncate pr-1">{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    {/* The instruction and the way out sit at the foot of
                        the list, where the eye lands after ticking. */}
                    <div className="flex items-center justify-between gap-2 border-t border-[#dfdbd1] bg-white px-2.5 py-1.5">
                      {/* The phrase wraps rather than ellipsizing: on a phone
                          the Done button leaves it just short of one line. */}
                      <p className="min-w-0 flex-1 pr-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-[#b36b3c]">
                        Select the account(s) to give to
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAccountPicker(false)}
                        className="shrink-0 rounded-lg bg-[#26352f] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#1e2a25]"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. One amount per chosen account — the account and its amount
              share the row, on phones as well as wide screens. */}
          {selectedAccounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[#26352f]">Amount per account (KES)</p>
              {selectedAccounts.map((account) => (
                <div
                  key={account}
                  className="flex items-center gap-2 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee]/60 px-3 py-2"
                >
                  {/* One tap takes the account off the gift — placed at
                      the row's left so it never crowds the amount field. */}
                  <button
                    type="button"
                    onClick={() => toggleAccount(account)}
                    aria-label={`Remove ${account}`}
                    title={`Remove ${account}`}
                    className="shrink-0 rounded-full p-1 text-[#8a948d] transition hover:bg-[#f2efe8] hover:text-[#96552c]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#26352f] sm:text-sm">
                    {account}
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    required
                    placeholder="Amount"
                    aria-label={`Amount for ${account}`}
                    value={accountAmounts[account] ?? ""}
                    onChange={(event) =>
                      setAccountAmounts((current) => ({ ...current, [account]: event.target.value }))
                    }
                    className="w-24 shrink-0 rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-2 text-right text-sm outline-none focus:border-[#b36b3c] sm:w-32"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between px-1 pt-1 text-sm">
                <span className="font-medium text-[#617068]">Total</span>
                <span className="font-bold text-[#26352f]">KES {allocationTotal.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* 4. Method-Specific Fields & Details */}
          {methodOfGiving === "mpesa" && (
            <div className="grid grid-cols-1 gap-4">
              <label className="block text-sm font-medium text-[#26352f]">
                Phone number
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  minLength={10}
                  required
                  placeholder="e.g. 0712345678"
                  value={phoneNumber}
                  onFocus={liftAboveKeyboard}
                  onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                />
              </label>
            </div>
          )}

          {methodOfGiving === "bank_transfer" && (
            <div className="space-y-4">
              {/* Bank Account Info Card */}
              <div className="rounded-2xl border border-[#dfdbd1] bg-[#f7f4ee] p-4 text-xs space-y-2">
                <p className="font-bold text-[#26352f] text-sm flex items-center gap-2">
                  <span>🏦</span> Church Bank Account Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#3d5148] pt-1">
                  <div><span className="font-semibold text-[#26352f]">Bank:</span> {churchBankDetails.bank_name}</div>
                  <div><span className="font-semibold text-[#26352f]">Account Name:</span> {churchBankDetails.bank_account_name}</div>
                  <div><span className="font-semibold text-[#26352f]">Account No:</span> {churchBankDetails.bank_account_number}</div>
                  <div><span className="font-semibold text-[#26352f]">Branch / Swift:</span> {churchBankDetails.bank_branch} / {churchBankDetails.bank_swift_code}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <label className="block text-sm font-medium text-[#26352f]">
                  Bank Deposit / Ref Number
                  <input
                    type="text"
                    required
                    placeholder="e.g. DEP-9012 or KCB-8812"
                    value={bankRefNumber}
                    onChange={(event) => setBankRefNumber(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-[#26352f]">
                  Your Bank Name
                  <input
                    type="text"
                    placeholder="e.g. Equity Bank, KCB, Absa, Co-op"
                    value={senderBankName}
                    onChange={(event) => setSenderBankName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </label>

                <label className="block text-sm font-medium text-[#26352f]">
                  Transfer Date
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(event) => setTransferDate(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </label>
              </div>
            </div>
          )}
          {/* Sticky on phones: with several accounts the rows push the button
              down, so it stays reachable at the foot of the modal instead of
              scrolling out of sight. */}
          <div className="sticky bottom-0 -mx-6 mt-6 border-t border-[#dfdbd1] bg-white/95 px-6 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            <button
              disabled={loading}
              className="w-full rounded-full bg-[#3d7146] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#305a38] disabled:opacity-60 sm:text-base"
            >
              {submitButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
