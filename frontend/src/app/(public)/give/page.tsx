"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Eye, EyeOff, Landmark, Printer, Receipt, RotateCw, SlidersHorizontal, X } from "lucide-react";
import { brand } from "@/lib/brand";
import { localDate, firstDayOfMonth, dayFirstTime } from "@/lib/dates";
import { useRouter, useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";
import { thankYouPath } from "@/lib/giving-thanks";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { PublicSectionNav } from "@/components/public-section-nav";
import { stewardshipLinks } from "@/config/site-sections";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Remembers the eye toggle across visits: revealing the record is a
    deliberate act, so the choice to show it sticks until hidden again. */
const GIVINGS_VISIBLE_KEY = "my_givings_visible";

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

type MyGiving = {
  id: number;
  amount: string | number;
  currency?: string;
  purpose: string;
  payment_method: string;
  status: string;
  mpesa_receipt_number?: string;
  paid_at?: string | null;
  created_at: string;
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

const methodLabel = (m: string) =>
  m === "mpesa" ? "M-Pesa" : m === "bank_transfer" ? "Bank-to-Bank" : m;

const statusLabel = (s: string) => {
  const v = (s || "").toLowerCase();
  return v === "completed" ? "Completed" : v === "failed" ? "Failed" : v === "cancelled" ? "Cancelled" : "Pending";
};

const statusBadge = (s: string) => {
  const v = (s || "").toLowerCase();
  const styles =
    v === "completed"
      ? "bg-mist-select text-sage-strong"
      : v === "failed" || v === "cancelled"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${styles}`}>{statusLabel(s)}</span>;
};

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

  // Giving form modal (opened via Give Now or a ?purpose= deep link)
  const [showGiveModal, setShowGiveModal] = useState(false);


  // ── My Givings ────────────────────────────────────────────────────────────
  const [signedIn, setSignedIn] = useState(false);
  const [myGivings, setMyGivings] = useState<MyGiving[]>([]);
  const [loadingGivings, setLoadingGivings] = useState(false);
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(() => localDate());
  const [givingSearch, setGivingSearch] = useState("");
  // Status filter replaces the old purpose dropdown: Successful by default,
  // with Failed and All for reviewing attempts that never completed. Purpose
  // filtering is covered by the search box, which matches purpose text.
  const [givingStatusFilter, setGivingStatusFilter] = useState<"successful" | "failed" | "all">("successful");
  const [showStatusFilterMenu, setShowStatusFilterMenu] = useState(false);
  // Privacy first: a member's giving record starts hidden, shown only while
  // the eye is open — screensharing a phone at church shouldn't expose it.
  const [givingsVisible, setGivingsVisible] = useState(false);
  // Until this instant, refresh the record quietly after an M-Pesa gift: the
  // prompt must be answered (PIN) before the contribution exists, so the list
  // is polled until the new row lands — or the window lapses.
  const [pendingRefreshUntil, setPendingRefreshUntil] = useState<number | null>(null);

  const loadMyGivings = (opts?: { silent?: boolean }) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    // Silent loads (polling) never show the spinner or blank the list on a
    // hiccup — only deliberate refreshes do.
    if (!opts?.silent) setLoadingGivings(true);
    fetch(`${API_URL}/api/members/contributions/?include_failed=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMyGivings(Array.isArray(data) ? data : []))
      .catch(() => {
        if (!opts?.silent) setMyGivings([]);
      })
      .finally(() => setLoadingGivings(false));
  };

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    setSignedIn(true);
    // A member who chose to reveal their record keeps that choice on their
    // next visit; read only while signed in, since the eye guards nothing
    // for visitors.
    if (localStorage.getItem(GIVINGS_VISIBLE_KEY) === "1") setGivingsVisible(true);
    loadMyGivings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While a just-sent M-Pesa prompt is pending, quietly re-fetch the record
  // so the completed gift appears on its own — no pull-to-refresh needed.
  useEffect(() => {
    if (pendingRefreshUntil === null) return;
    const deadline = pendingRefreshUntil;
    const tick = setInterval(() => {
      if (Date.now() > deadline) {
        clearInterval(tick);
        setPendingRefreshUntil(null);
        return;
      }
      loadMyGivings({ silent: true });
    }, 10000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRefreshUntil]);

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

  const givingDateOf = (g: MyGiving) => (g.paid_at || g.created_at || "").slice(0, 10);

  const filteredGivings = myGivings.filter((g) => {
    const d = givingDateOf(g);
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    const status = (g.status || "").toLowerCase();
    if (givingStatusFilter === "successful" && status !== "completed") return false;
    if (givingStatusFilter === "failed" && status !== "failed" && status !== "cancelled") return false;
    const q = givingSearch.toLowerCase();
    if (q && !`${g.purpose} ${g.payment_method} ${g.mpesa_receipt_number || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // Totals count money actually given; failed attempts stay visible but never inflate the sum.
  const givingTotal = filteredGivings.reduce((sum, g) => ((g.status || "").toLowerCase() === "completed" ? sum + Number(g.amount || 0) : sum), 0);

  /** Download the server-rendered thermal receipt for one giving. The PDF
   *  arrives as a blob so the browser's download sheet opens on mobile too. */
  const handleDownloadReceipt = async (g: MyGiving) => {
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/contributions/${g.id}/receipt/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not generate the receipt.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Giving_Receipt_${(g.mpesa_receipt_number || g.id)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showAlert("Receipt Error", error instanceof Error ? error.message : "Could not generate the receipt.", "error");
    }
  };

  const fmtGivingDate = (g: MyGiving) => dayFirstTime(g.paid_at || g.created_at);

  const handlePrintMyReport = () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = filteredGivings
      .map(
        (g, i) =>
          `<tr><td>${i + 1}</td><td>${esc(fmtGivingDate(g))}</td><td>${esc(g.purpose || "—")}</td><td>${esc(methodLabel(g.payment_method))}</td><td>${esc(g.mpesa_receipt_number || "—")}</td><td style="text-align:right">KES ${Number(g.amount || 0).toLocaleString()}</td><td>${statusLabel(g.status)}</td></tr>`
      )
      .join("");
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>My Giving Report</title><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:${brand.bark};padding:32px;}
      h1{font-size:20px;margin:0 0 4px;} p{color:${brand.moss};font-size:12px;margin:0 0 20px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th{text-align:left;border-bottom:2px solid ${brand.ember};padding:8px 6px;text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:${brand.ember};}
      td{border-bottom:1px solid ${brand.sandSoft};padding:8px 6px;}
      .total{margin-top:16px;text-align:right;font-weight:700;}
    </style></head><body>
      <h1>My Giving Report</h1>
      <p>${dayFirstTime(fromDate)} to ${dayFirstTime(toDate)}</p>
      <table><thead><tr><th>#</th><th>Date</th><th>Account</th><th>Method</th><th>Receipt</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="total">Total: KES ${givingTotal.toLocaleString()}</p>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

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
      if (signedIn && token && !accountEmail.trim() && typedEmail) {
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
          loadMyGivings();
          // The PIN usually lands within a minute or two; keep the record
          // fresh until the pending entry shows up (or five minutes pass).
          setPendingRefreshUntil(Date.now() + 5 * 60 * 1000);
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
          loadMyGivings();
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
      {/* No bottom padding while signed in: the pinned footer bar meets the
          mobile tab bar directly (the shell already reserves the bar height).
          No phone top padding either: the shell's page strip sits directly
          above, and the card rides up under it. */}
      <div className={signedIn ? "flex min-h-0 flex-1 flex-col px-5 pb-0 sm:px-8 sm:pb-5 sm:pt-5 lg:px-10" : "mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-12"}>
          <div className={signedIn ? "flex min-h-0 flex-1 flex-col" : "space-y-6"}>
            {/* The strip names the page when signed in; visitors keep the title. */}
            <h1 className={signedIn ? "sr-only" : "mt-3 hidden shrink-0 text-3xl font-semibold tracking-tight sm:text-4xl md:block"}>
              Giving
            </h1>

            {/* ── My Givings (signed-in members) ── */}
            {signedIn && (
              <section className={signedIn ? "mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-sand-line" : "mt-8 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-sand-line"}>
                {/* Everything above the action bar scrolls as one on a phone —
                    the title, the dates and filters, and the record itself —
                    so the buttons are the only part that stays put. On md+ the
                    wrapper clips again and the desktop table scrolls inside it
                    with the header pinned, as it always did. */}
                <div className={signedIn ? "custom-table-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain md:overflow-hidden" : ""}>
                <div className="shrink-0 space-y-3 border-b border-sand-line px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="text-lg font-bold text-bark">My Givings</h2>
                      {/* The record starts hidden; the eye reveals it. Show the
                          crossed eye while hidden, matching the state — not
                          the action. */}
                      <button
                        type="button"
                        onClick={() => {
                          const next = !givingsVisible;
                          setGivingsVisible(next);
                          try {
                            localStorage.setItem(GIVINGS_VISIBLE_KEY, next ? "1" : "0");
                          } catch {}
                        }}
                        aria-pressed={givingsVisible}
                        aria-label={givingsVisible ? "Hide my givings" : "Show my givings"}
                        title={givingsVisible ? "Hide my givings" : "Show my givings"}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sand-line bg-sand text-moss transition hover:border-ember hover:text-ember"
                      >
                        {givingsVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </div>
                    {/* Refresh, not Give Now: while the record is hidden the
                        empty middle becomes Give Now's home, and the header
                        keeps a quiet way to pull the latest rows. */}
                    <button
                      type="button"
                      onClick={() => loadMyGivings()}
                      title="Refresh my givings"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sand-line bg-sand px-3.5 py-2 text-xs font-semibold text-moss transition hover:border-ember hover:text-ember"
                    >
                      <RotateCw className={`h-3.5 w-3.5 ${loadingGivings ? "animate-spin" : ""}`} />
                      Refresh
                    </button>
                  </div>
                  <div className={signedIn ? `flex flex-col gap-2 md:flex-row md:items-center ${givingsVisible ? "" : "hidden"}` : "flex flex-col gap-2 md:flex-row md:items-center"}>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} title="From date" className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs focus:border-ember focus:outline-none" />
                      <ArrowRight size={12} className="shrink-0 text-moss" aria-hidden="true" />
                      <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} title="To date" className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs focus:border-ember focus:outline-none" />
                    </div>
                    <div className="relative flex min-w-0 flex-1 items-center gap-2">
                      {/* Mobile: the three statuses live behind one compact Filters button; the segmented control stays for desktop. */}
                      <div className="md:hidden">
                        <button
                          type="button"
                          onClick={() => setShowStatusFilterMenu((open) => !open)}
                          aria-expanded={showStatusFilterMenu}
                          aria-label="Filter by status"
                          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition ${
                            givingStatusFilter === "successful"
                              ? "border-sand-line bg-sand text-moss"
                              : "border-bark bg-bark text-white shadow-sm"
                          }`}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          {givingStatusFilter === "successful" ? "Filter" : givingStatusFilter === "failed" ? "Failed" : "All"}
                        </button>
                        {showStatusFilterMenu && (
                          <div className="absolute z-20 mt-2 w-36 overflow-hidden rounded-xl border border-sand-line bg-white shadow-lg">
                            {(["successful", "failed", "all"] as const).map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setGivingStatusFilter(key);
                                  setShowStatusFilterMenu(false);
                                }}
                                className={`flex w-full items-center justify-between px-3 py-2.5 text-[11px] font-semibold transition ${
                                  givingStatusFilter === key
                                    ? "bg-mist-select text-bark"
                                    : "text-moss hover:bg-sand hover:text-bark"
                                }`}
                              >
                                <span className="capitalize">{key}</span>
                                {givingStatusFilter === key && <Check className="h-3.5 w-3.5 text-ember" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Desktop: one independent button per status. */}
                      <div className="hidden h-9 shrink-0 items-center gap-1.5 md:flex" role="group" aria-label="Filter by status">
                        {(["successful", "failed", "all"] as const).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setGivingStatusFilter(key)}
                            aria-pressed={givingStatusFilter === key}
                            className={`h-8 rounded-xl px-2.5 text-[11px] font-semibold capitalize transition ${
                              givingStatusFilter === key
                                ? "bg-bark text-white shadow-sm"
                                : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                            }`}
                          >
                            {key}
                          </button>
                        ))}
                      </div>
                      <input type="text" placeholder="Search account, method or receipt…" value={givingSearch} onChange={(e) => setGivingSearch(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none" />
                    </div>
                  </div>
                </div>

                {signedIn && !givingsVisible ? (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5 py-3">
                    <p className="text-xs text-moss">Your giving record is hidden. Tap the eye beside “My Givings” to show it.</p>
                    <button
                      type="button"
                      onClick={() => setShowGiveModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-deep"
                    >
                      Give Now
                    </button>
                  </div>
                ) : (
                <div className={signedIn ? "flex flex-col px-5 py-3 md:min-h-0 md:flex-1 md:overflow-hidden" : "px-5 py-3"}>
                  {/* Desktop table */}
                  <div className={signedIn ? "hidden min-h-0 flex-1 overflow-y-auto custom-table-scrollbar md:block" : "hidden md:block"}>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-sand-line">
                        <tr className="text-[11px] font-bold uppercase tracking-wider text-ember">
                          <th className="pb-3 pr-4 font-bold w-8">#</th>
                          <th className="pb-3 pr-4 font-bold">Date</th>
                          <th className="pb-3 pr-4 font-bold">Account</th>
                          <th className="pb-3 pr-4 font-bold">Method</th>
                          <th className="pb-3 pr-4 font-bold">Receipt</th>
                          <th className="pb-3 pr-4 text-right font-bold">Amount</th>
                          <th className="pb-3 font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sand-soft">
                        {loadingGivings ? (
                          <tr><td colSpan={7} className="py-8 text-center text-xs text-moss">Loading your givings...</td></tr>
                        ) : filteredGivings.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center">
                              <p className="text-xs font-semibold text-bark">No givings in this period</p>
                              <p className="mt-1 text-[11px] text-moss">Adjust the dates above or tap Give Now.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredGivings.map((g, idx) => (
                            <tr key={g.id} className="hover:bg-sand">
                              <td className="py-3 pr-4 text-moss w-8">{idx + 1}</td>
                              <td className="py-3 pr-4 text-moss">{fmtGivingDate(g)}</td>
                              <td className="py-3 pr-4 font-semibold text-bark">{g.purpose || "—"}</td>
                              <td className="py-3 pr-4 text-moss">{methodLabel(g.payment_method)}</td>
                              <td className="py-3 pr-4 font-mono text-moss">{g.mpesa_receipt_number || "—"}</td>
                              <td className="py-3 pr-4 text-right font-semibold text-bark">KES {Number(g.amount || 0).toLocaleString()}</td>
                              <td className="py-3 pr-2 text-right">
                                {(g.status || "").toLowerCase() === "completed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadReceipt(g)}
                                    title="Download receipt"
                                    className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                                  >
                                    <Receipt size={10} className="inline" aria-hidden="true" /> Receipt
                                  </button>
                                )}
                              </td>
                              <td className="py-3">{statusBadge(g.status)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  {/* Mobile cards — one scroller with the header above them:
                      everything above the action bar moves together. */}
                  {/* Mobile cards ride the wrapper's scroller — one scroll for
                      everything above the action bar. */}
                  <div className={signedIn ? "grid gap-3 pb-2 md:hidden" : "grid gap-3 md:hidden"}>
                    {loadingGivings ? (
                      <div className="py-8 text-center text-xs text-moss">Loading your givings...</div>
                    ) : filteredGivings.length === 0 ? (
                      <div className="py-8 text-center text-xs text-moss">No givings in this period.</div>
                    ) : (
                      filteredGivings.map((g) => (
                        <div key={g.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-bark">{g.purpose || "—"}</h3>
                            {statusBadge(g.status)}
                          </div>
                          <p className="text-xs text-moss">{fmtGivingDate(g)} · {methodLabel(g.payment_method)}</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-ember">KES {Number(g.amount || 0).toLocaleString()}</p>
                            {(g.status || "").toLowerCase() === "completed" && (
                              <button
                                type="button"
                                onClick={() => handleDownloadReceipt(g)}
                                title="Download receipt"
                                className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                              >
                                <Receipt size={10} className="inline" aria-hidden="true" /> Receipt
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                )}
                </div>

                {/* Footer actions — hidden with the record: the count and
                    total would leak the giving it conceals. */}
                {givingsVisible && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sand-line px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <p className="text-[11px] text-moss">{dayFirstTime(fromDate)} <ArrowRight size={10} className="inline" aria-hidden="true" /> {dayFirstTime(toDate)}</p>
                    <p className="text-[11px] font-semibold text-bark">
                      {loadingGivings ? "Loading your givings..." : `${filteredGivings.length} giving${filteredGivings.length === 1 ? "" : "s"} · KES ${givingTotal.toLocaleString()}`}
                    </p>
                  </div>
                  {/* On a phone the two actions split the row evenly. */}
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={handlePrintMyReport}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-sand-mute bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand sm:flex-none"
                    >
                      <Printer size={12} className="inline" aria-hidden="true" /> Print My Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGiveModal(true)}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep sm:flex-none"
                    >
                      Give Now
                    </button>
                  </div>
                </div>
                )}
              </section>
            )}

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
                  one thing they alone can fix. */}
              {signedIn && !accountEmail.trim() && (
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

              {/* 2. How the money moves first — method, then the phone the
                  M-Pesa prompt goes to — and only then which accounts it
                  goes to. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
