"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Landmark, Smartphone, X } from "lucide-react";
import { localDate } from "@/lib/dates";
import { useRouter, useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";
import { thankYouPath } from "@/lib/giving-thanks";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { PublicSectionNav } from "@/components/public-section-nav";
import { stewardshipLinks } from "@/config/site-sections";
import { PENDING_GIVINGS_KEY } from "@/components/my-givings";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const defaultPurposes = [
  "Tithe",
  "Combined Offering",
  "13th Sabbath",
  "Camp Expenses",
  "Camp Goal",
  "Local Church Budget",
];

type MethodOfGiving = "mpesa" | "bank_transfer";

/** One row from /giving-accounts/: the label givers read and the short account name M-Pesa shows. */
type GivingAccountOption = {
  id: number;
  name: string;
  label: string;
  account: string;
  account_type: string;
  account_type_display: string;
};

/** Safaricom's prefixes on the Communications Authority number plan — the
 * only lines an M-Pesa push can reach, so the account phone pre-fills the
 * field only when it belongs to one. */
const SAFARICOM_PREFIXES = ["070", "071", "072", "074", "079"];

/** The member's stored phone as this field wants it (07XXXXXXXX), or "".
 *
 * Profiles carry the number in whatever shape it was collected (07…, 2547…,
 * +2547…), and an Airtel/Telkom/Equitel line cannot receive an M-Pesa prompt
 * — pre-filling one would only produce a failed push, so it stays empty.
 */
function safaricomPhoneOf(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local =
    digits.length === 12 && digits.startsWith("254") ? `0${digits.slice(3)}`
    : digits.length === 10 && digits.startsWith("0") ? digits
    : digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1")) ? `0${digits}`
    : "";
  return local && SAFARICOM_PREFIXES.some((prefix) => local.startsWith(prefix)) ? local : "";
}

function GivePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawPurposeParam = searchParams.get("purpose");
  const linkedPurpose = (rawPurposeParam ?? "").trim();
  // No default: the giver must pick a purpose ("-- select --" placeholder). A
  // ministry-style name falls through the ministry mapping below; an exact
  // account name is kept as it is, so a link to "Local Church Budget" cannot
  // be turned into the differently-named "Budget".
  const normalizedPurpose = linkedPurpose ? getMinistryGivingPurpose(linkedPurpose) : "";

  // A giver may support several accounts in one payment, so the choice is a list
  // and each chosen account carries its own amount. One M-Pesa prompt is sent,
  // for the total; the church records the split per account.
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(normalizedPurpose ? [normalizedPurpose] : []);
  const [accountAmounts, setAccountAmounts] = useState<Record<string, string>>({});
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const accountPickerRef = useRef<HTMLDivElement | null>(null);
  const [methodOfGiving, setMethodOfGiving] = useState<MethodOfGiving>("mpesa");
  const [purposes, setPurposes] = useState<GivingAccountOption[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bankRefNumber, setBankRefNumber] = useState("");
  const [senderBankName, setSenderBankName] = useState("");
  const [transferDate, setTransferDate] = useState(() => localDate());
  // Receipts are addressed from the signed-in member's account, and an
  // anonymous giver's receipt rides the phone they give with, so the form
  // asks for neither name nor email — except when a signed-in account has no
  // email at all. That is the one thing the member alone can fix (the only
  // way an email receipt can ever reach them), so it keeps a small field.
  const [donorEmail, setDonorEmail] = useState("");
  // The address currently on the member's account.
  const [accountEmail, setAccountEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // A tickable switch that keeps the gift from the giver: when ticked, the
  // request says it is not about this person, and the ledger records the gift
  // against the phone it was paid from alone — never their name or email.
  const [anonymous, setAnonymous] = useState(false);

  // Giving form modal (opened via Give Now or a ?purpose= deep link)
  const [showGiveModal, setShowGiveModal] = useState(false);


  // ── Who is giving ────────────────────────────────────────────────────────────
  // The record itself lives on its own route now (/member/givings, linked
  // from the account menu). All this page needs to know is whether there is
  // an account behind the gift: it decides the toast, the redirect and the
  // link to that record.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (token) setSignedIn(true);
  }, []);

  // A signed-in giver's receipt is addressed from their account, so the form
  // only needs to know whether that account carries an email — it shows the
  // add-an-email field when it does not.
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!me) return;
        setAccountEmail(me.email || "");
        // The phone the M-Pesa prompt goes to: pre-filled from the account
        // when it is a Safaricom number, left empty otherwise.
        setPhoneNumber((current) => (current ? current : safaricomPhoneOf(me.phone_number || "")));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (rawPurposeParam) {
      const mapped = getMinistryGivingPurpose(rawPurposeParam);
      setSelectedAccounts([mapped]);
      setShowGiveModal(true);
    }
  }, [rawPurposeParam]);

  /**
   * The account list behaves like a dropdown: tapping anywhere outside it — the
   * rest of the form, the amount rows it opens over, the backdrop — closes it,
   * and so does Escape. The trigger is inside the ref, so its own tap still
   * toggles rather than closing and instantly reopening.
   */
  useEffect(() => {
    if (!showAccountPicker) return;
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
  }, [showAccountPicker]);

  // Opening the form never wears the previous attempt's message: a success is
  // announced by its toast alone, and a stale error is not the new form's news.
  useEffect(() => {
    if (showGiveModal) setMessage("");
  }, [showGiveModal]);

  const toggleAccount = (account: string) => {
    setSelectedAccounts((current) =>
      current.includes(account) ? current.filter((item) => item !== account) : [...current, account]
    );
  };

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
    bank_name: "KCB Bank Kenya",
    bank_account_name: "SDA Church Main Account",
    bank_account_number: "1122334455",
    bank_branch: "Meru",
    bank_swift_code: "KCBKNEN",
    // Blank by default: the church hides its manual M-Pesa details by leaving
    // the paybill unset, and the card below disappears with it.
    mpesa_paybill_number: "",
  });

  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setChurchBankDetails({
            bank_name: data.bank_name || "KCB Bank Kenya",
            bank_account_name: data.bank_account_name || "SDA Church Main Account",
            bank_account_number: data.bank_account_number || "1122334455",
            bank_branch: data.bank_branch || "Nairobi West",
            bank_swift_code: data.bank_swift_code || "KCBKNEN",
            mpesa_paybill_number: data.mpesa_paybill_number || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  /**
   * The published list, plus the account this visit was linked to.
   *
   * A support link (?purpose=) can name an account that is not in the published
   * list — a ministry account, say. Without this the picker would fall back to
   * its first option and the giver would support the wrong account entirely.
   */
  const ensureLinkedPurpose = (list: GivingAccountOption[], wanted: string) =>
    wanted && !list.some((option) => option.label.toLowerCase() === wanted.toLowerCase())
      ? [{ id: -1, name: wanted.slice(0, 12), label: wanted, account: wanted.slice(0, 12), account_type: "other", account_type_display: "Other" }, ...list]
      : list;

  useEffect(() => {
    // Treasury accounts are the one source of giving accounts, priority-ordered
    // by the API (Tithe, offerings, budget, camp funds, then the rest).
    fetch(`${API_URL}/api/members/giving-accounts/`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: GivingAccountOption[]) => {
        const published = data.length ? data : defaultPurposes.map((name) => ({ id: -1, name: name.slice(0, 12), label: name, account: name.slice(0, 12), account_type: "other", account_type_display: "Other" }));
        const exact = linkedPurpose
          ? published.find((option) => option.label.toLowerCase() === linkedPurpose.toLowerCase())
          : undefined;
        if (exact) setSelectedAccounts([exact.label]);
        setPurposes(ensureLinkedPurpose(published, exact?.label ?? normalizedPurpose));
      })
      .catch(() => setPurposes(ensureLinkedPurpose(
        defaultPurposes.map((name) => ({ id: -1, name: name.slice(0, 12), label: name, account: name.slice(0, 12), account_type: "other", account_type_display: "Other" })),
        normalizedPurpose,
      )));
  }, [linkedPurpose, normalizedPurpose]);

  async function submitGiving(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    // One stamp for both methods: the record page polls quietly for the new
    // row until this window lapses (the PIN lands a minute or two later).
    const watchUntil = String(Date.now() + 5 * 60 * 1000);
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

      // The receipt is addressed from the account (the API ignores any address
      // sent in the payload). The one edit this form makes is adding an email
      // to an account that has none — the field only exists for that case — so
      // it is saved before the gift is initiated and the callback's ledger row
      // and receipt already carry it. It never clears an existing address.
      const typedEmail = donorEmail.trim();
      if (signedIn && !anonymous && token && !accountEmail.trim() && typedEmail) {
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
        // The stamp that keeps this gift off the giver's own record: the
        // backend drops the name and email when it sees it.
        ...(anonymous ? { anonymous: true } : {}),
      };
      // Neither name nor email rides the payload: a signed-in gift is recorded
      // against the member's account, and an anonymous one against the phone
      // it was paid from — the ledger greets it "Dear friend" and the receipt
      // goes by SMS. The API derives both from the request itself.

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
        setShowGiveModal(false);
        setLoading(false);
        if (signedIn) {
          const promptMessage = data.message ?? "M-Pesa prompt sent. Enter your PIN on your phone to complete the payment.";
          // The toast carries it; printing the same sentence into the form as
          // well left it waiting at the top of the next visit to the modal.
          showAlert("M-Pesa prompt sent", promptMessage, "info", {
            toast: true,
            position: "top-end",
            timer: 7000,
            showConfirmButton: false,
          });
          // The PIN usually lands within a minute or two: stamp the moment so
          // My Givings polls quietly for the new row when it is opened.
          localStorage.setItem(PENDING_GIVINGS_KEY, watchUntil);
        } else {
          // A visitor has no record to poll; they land on the public
          // confirmation page, which carries the drive context home.
          router.push(thankYouPath({ kind: "money", method: "mpesa", title: allocations[0]?.purpose }));
        }
      } else {
        setShowGiveModal(false);
        setLoading(false);
        if (signedIn) {
          const successMsg = data.message ?? "Thank you! Your Bank Transfer contribution details have been recorded.";
          showAlert("Contribution Received", successMsg, "success");
          localStorage.setItem(PENDING_GIVINGS_KEY, watchUntil);
        } else {
          router.push(thankYouPath({ kind: "money", method: "bank", title: allocations[0]?.purpose }));
        }
      }
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

  return (
    <main className={signedIn ? "flex h-full min-h-0 flex-col overflow-hidden bg-white text-bark" : "min-h-screen bg-sand text-bark"}>
      {/* /give pins at every width (scrollModeForPath): the document never
          scrolls, so the page carries its own scroller — the button and the
          two manual-giving cards move as one, whatever the viewport. */}
      <div className={signedIn ? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-8 pt-4 sm:px-8 sm:pt-5 lg:px-10" : "mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-12"}>
          <div className="space-y-6">
            {/* The strip names the page when signed in; visitors keep the title. */}
            <h1 className={signedIn ? "sr-only" : "mt-3 hidden shrink-0 text-3xl font-semibold tracking-tight sm:text-4xl md:block"}>
              Giving
            </h1>

            {/* ── Give Now: the direct path, in the middle of the page ── */}
            <div className="flex flex-col items-center justify-center gap-3 py-6 text-center sm:py-8">
              <p className="max-w-md text-sm text-moss">
                Give by M-Pesa or bank transfer in a moment: the form sends the M-Pesa prompt
                straight to your phone and records the gift against your account.
              </p>
              <button
                type="button"
                onClick={() => setShowGiveModal(true)}
                className="rounded-full bg-ember px-10 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-ember-deep"
              >
                Give Now
              </button>
              {signedIn && (
                <Link href="/member/givings" className="text-xs font-semibold text-ember hover:underline">
                  View my givings
                </Link>
              )}
            </div>

            {/* ── Give manually: the church's own accounts ──
                For a giver who would rather push the money themselves, both
                ways in sit under the button — Safaricom's paybill, which
                disappears while the church has not set one, and the bank. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {churchBankDetails.mpesa_paybill_number && (
                <article className="rounded-3xl border border-sand-line bg-white p-5 shadow-sm">
                  <p className="flex items-center gap-2 text-sm font-bold text-bark">
                    <Smartphone size={14} aria-hidden="true" /> Pay with Safaricom M-Pesa
                  </p>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-moss">Pay Bill number</dt>
                      <dd className="font-mono text-base font-bold text-bark">{churchBankDetails.mpesa_paybill_number}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-moss">Account number</dt>
                      <dd className="text-right font-semibold text-bark">
                        The account you are giving for — e.g. TITHE or Combined Offering
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 border-t border-sand-line pt-3 text-[11px] text-moss">
                    M-Pesa → Lipa na M-Pesa → Pay Bill, then enter the account above.
                  </p>
                </article>
              )}

              <article className="rounded-3xl border border-sand-line bg-white p-5 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-bold text-bark">
                  <Landmark size={14} aria-hidden="true" /> Pay by bank transfer
                </p>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-moss">Bank</dt>
                    <dd className="font-semibold text-bark">{churchBankDetails.bank_name}</dd>
                  </div>
                  <div>
                    <dt className="text-moss">Account name</dt>
                    <dd className="font-semibold text-bark">{churchBankDetails.bank_account_name}</dd>
                  </div>
                  <div>
                    <dt className="text-moss">Account no</dt>
                    <dd className="font-mono font-semibold text-bark">{churchBankDetails.bank_account_number}</dd>
                  </div>
                  <div>
                    <dt className="text-moss">Branch / Swift</dt>
                    <dd className="font-semibold text-bark">{churchBankDetails.bank_branch} / {churchBankDetails.bank_swift_code}</dd>
                  </div>
                </dl>
                <p className="mt-3 border-t border-sand-line pt-3 text-[11px] text-moss">
                  After transferring, tap Give Now → Bank-to-Bank and enter the reference so the
                  gift is recorded against your account.
                </p>
              </article>
            </div>

          </div>
      </div>

      {/* The public landing page offers the wider stewardship navigation; the authenticated shell hides it. */}
      <PublicSectionNav
        eyebrow="Stewardship & support"
        title="More ways to support the church"
        description="Beyond tithes and offerings: in-kind gifts, fund drives, the church budget and the treasury's published figures."
        links={stewardshipLinks}
        activeKey="give"
        className="public-section-nav border-t border-sand-line bg-white/60"
      />

      {/* ── Give Now modal ── */}
      {showGiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="give-modal-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-sand-line sm:p-8"
          >
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <div>
                {/* Phones open this modal short of room, so the eyebrow stays on wider screens. */}
                <p className="hidden text-[10px] font-extrabold uppercase tracking-wider text-ember sm:block">Giving</p>
                <h3 id="give-modal-title" className="text-lg font-bold text-bark">Give Now</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGiveModal(false)}
                disabled={loading}
                className="text-xl leading-none text-moss hover:text-bark"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <form
              id="give-form"
              onSubmit={submitGiving}
              className="mt-5 space-y-5"
            >
              {message && (
                <div className="rounded-2xl bg-sand border border-sand-line p-4 text-xs font-semibold text-bark">
                  {message}
                </div>
              )}

              {/* 1. Receipts — addressed from the account, not the form. A
                  signed-in member's receipt carries their account's name and
                  email; an anonymous giver's rides the phone they give with.
                  Only a member whose account has no email sees a field — the
                  one thing they alone can fix. An anonymous gift keeps even
                  that: nothing of theirs is saved. */}
              {signedIn && !anonymous && !accountEmail.trim() && (
                <label className="block text-sm font-medium text-bark">
                  Email for receipts <span className="font-normal text-moss">(optional)</span>
                  <input
                    type="email"
                    value={donorEmail}
                    onChange={(event) => setDonorEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-moss">
                    Saved to your account so a receipt can reach you by email. Leave it out and your receipt goes by SMS to the phone you give with.
                  </span>
                </label>
              )}

              {/* 2. How the money moves: anonymity first, then the method,
                  the phone the M-Pesa prompt goes to, and finally which
                  accounts it goes to. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {methodOfGiving === "mpesa" && (
                  <label className="flex cursor-pointer items-center gap-2 self-start rounded-xl border border-sand-mute bg-white px-4 py-3 text-sm font-medium text-bark">
                    <input
                      type="checkbox"
                      id="give-anonymously"
                      checked={anonymous}
                      onChange={(event) => setAnonymous(event.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-sand-mute text-ember focus:ring-ember"
                    />
                    <span className="text-sm">Give anonymously</span>
                  </label>
                )}

                <label className="block self-start text-sm font-medium text-bark">
                  Method of Giving
                  <select
                    value={methodOfGiving}
                    onChange={(event) => setMethodOfGiving(event.target.value as MethodOfGiving)}
                    className="mt-2 w-full rounded-xl border border-sand-mute bg-white px-4 py-3 text-sm outline-none focus:border-ember"
                  >
                    <option value="mpesa">M-Pesa</option>
                    <option value="bank_transfer">Bank-to-Bank</option>
                  </select>
                </label>

                {methodOfGiving === "mpesa" && (
                  <label className="block self-start text-sm font-medium text-bark">
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
                      className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                    />
                  </label>
                )}

                <div className="block self-start text-sm font-medium text-bark">
                  <span>Giving accounts</span>
                  <div className="relative mt-2" ref={accountPickerRef}>
                    <button
                      type="button"
                      onClick={() => setShowAccountPicker((open) => !open)}
                      aria-expanded={showAccountPicker}
                      aria-label="Choose giving accounts"
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-sand-mute bg-white px-4 py-3 text-left text-sm outline-none transition hover:border-ember focus:border-ember"
                    >
                      <span className={`min-w-0 truncate ${selectedAccounts.length ? "text-bark" : "text-moss-faint2"}`}>
                        {accountPickerLabel}
                      </span>
                      <ChevronDown size={10} className="shrink-0 text-moss" aria-hidden="true" />
                    </button>

                    {showAccountPicker && (
                      /* Opens upward: the fields that follow (amounts, M-Pesa
                         details, the submit button) sit under this row and the
                         list used to cover them. */
                      <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 flex flex-col overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xl">
                        <div className="max-h-56 overflow-y-auto p-2">
                          {purposes.map((item) => {
                            const checked = selectedAccounts.includes(item.label);
                            return (
                              <label
                                key={`${item.id}-${item.label}`}
                                className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition hover:bg-sand ${checked ? "bg-mist-select font-semibold text-bark" : "text-moss-dark"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAccount(item.label)}
                                  className="h-4 w-4 shrink-0 rounded border-sand-mute text-sage-strong focus:ring-sage-strong"
                                />
                                <span className="min-w-0 flex-1 truncate pr-1">{item.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {/* The instruction and the way out sit at the foot of
                            the list, where the eye lands after ticking. */}
                        <div className="flex items-center justify-between gap-2 border-t border-sand-line bg-white px-2.5 py-1.5">
                          {/* The phrase wraps rather than ellipsizing: on a phone
                              the Done button leaves it just short of one line. */}
                          <p className="min-w-0 flex-1 pr-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-ember">
                            Select the account(s) to give to
                          </p>
                          <button
                            type="button"
                            onClick={() => setShowAccountPicker(false)}
                            className="shrink-0 rounded-lg bg-bark px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-bark-900"
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
                  <p className="text-sm font-medium text-bark">Amount per account (KES)</p>
                  {selectedAccounts.map((account) => (
                    <div
                      key={account}
                      className="flex items-center gap-2 rounded-xl border border-sand-line bg-sand/60 px-3 py-2"
                    >
                      {/* One tap takes the account off the gift — placed at
                          the row's left so it never crowds the amount field. */}
                      <button
                        type="button"
                        onClick={() => toggleAccount(account)}
                        aria-label={`Remove ${account}`}
                        title={`Remove ${account}`}
                        className="shrink-0 rounded-full p-1 text-moss-faint2 transition hover:bg-sand-light hover:text-ember-deep"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-bark sm:text-sm">
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

              {/* 4. Method-Specific Details — bank instructions and the deposit
                  reference; the M-Pesa phone now sits beside the method above,
                  where the prompt will be sent. */}

              {methodOfGiving === "bank_transfer" && (
                <div className="space-y-4">
                  {/* Bank Account Info Card */}
                  <div className="rounded-2xl border border-sand-line bg-sand p-4 text-xs space-y-2">
                    <p className="font-bold text-bark text-sm flex items-center gap-2">
                      <Landmark size={14} aria-hidden="true" /> Church Bank Account Details
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-moss-dark pt-1">
                      <div><span className="font-semibold text-bark">Bank:</span> {churchBankDetails.bank_name}</div>
                      <div><span className="font-semibold text-bark">Account Name:</span> {churchBankDetails.bank_account_name}</div>
                      <div><span className="font-semibold text-bark">Account No:</span> {churchBankDetails.bank_account_number}</div>
                      <div><span className="font-semibold text-bark">Branch / Swift:</span> {churchBankDetails.bank_branch} / {churchBankDetails.bank_swift_code}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <label className="block text-sm font-medium text-bark">
                      Bank Deposit / Ref Number
                      <input
                        type="text"
                        required
                        placeholder="e.g. DEP-9012 or KCB-8812"
                        value={bankRefNumber}
                        onChange={(event) => setBankRefNumber(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block text-sm font-medium text-bark">
                      Your Bank Name
                      <input
                        type="text"
                        placeholder="e.g. Equity Bank, KCB, Absa, Co-op"
                        value={senderBankName}
                        onChange={(event) => setSenderBankName(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </label>

                    <label className="block text-sm font-medium text-bark">
                      Transfer Date
                      <input
                        type="date"
                        required
                        value={transferDate}
                        onChange={(event) => setTransferDate(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-sand-mute px-4 py-3 text-sm outline-none focus:border-ember"
                      />
                    </label>
                  </div>
                </div>
              )}
              {/* Sticky on phones: with several accounts the rows push the button
                  down, so it stays reachable at the foot of the modal instead of
                  scrolling out of sight. */}
              <div className="sticky bottom-0 -mx-6 mt-6 border-t border-sand-line bg-white/95 px-6 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                <button
                  disabled={loading}
                  className="w-full rounded-full bg-sage-strong px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-sage-deep2 disabled:opacity-60 sm:text-base"
                >
                  {submitButtonText}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}

export default function GivePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-moss">
          Loading giving options...
        </main>
      }
    >
      <GivePageContent />
    </Suspense>
  );
}
