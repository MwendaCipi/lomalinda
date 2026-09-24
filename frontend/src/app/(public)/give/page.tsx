"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { PublicSectionNav } from "@/components/public-section-nav";
import { stewardshipLinks } from "@/config/site-sections";

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

// First Sabbath = first Saturday of the current month.
function firstSabbathOfCurrentMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
      ? "bg-[#eef2ed] text-[#3d7146]"
      : v === "failed" || v === "cancelled"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${styles}`}>{statusLabel(s)}</span>;
};

function GivePageContent() {
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

  // Giving form modal (opened via Give Now or a ?purpose= deep link)
  const [showGiveModal, setShowGiveModal] = useState(false);


  // ── My Givings ────────────────────────────────────────────────────────────
  const [signedIn, setSignedIn] = useState(false);
  const [myGivings, setMyGivings] = useState<MyGiving[]>([]);
  const [loadingGivings, setLoadingGivings] = useState(false);
  const [fromDate, setFromDate] = useState(firstSabbathOfCurrentMonth);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [givingSearch, setGivingSearch] = useState("");
  // Status filter replaces the old purpose dropdown: Successful by default,
  // with Failed and All for reviewing attempts that never completed. Purpose
  // filtering is covered by the search box, which matches purpose text.
  const [givingStatusFilter, setGivingStatusFilter] = useState<"successful" | "failed" | "all">("successful");
  const [showStatusFilterMenu, setShowStatusFilterMenu] = useState(false);

  const loadMyGivings = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    setLoadingGivings(true);
    fetch(`${API_URL}/api/members/contributions/?include_failed=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMyGivings(Array.isArray(data) ? data : []))
      .catch(() => setMyGivings([]))
      .finally(() => setLoadingGivings(false));
  };

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    setSignedIn(true);
    loadMyGivings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed-in givers get their name and account email filled in for them. The
  // email is editable because it is the address on their account: receipts are
  // sent there, so a member whose account has none can add one and a member
  // whose address is stale can correct it (saved on submit, before the gift).
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
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

  const fmtGivingDate = (g: MyGiving) => {
    const raw = g.paid_at || g.created_at;
    return raw
      ? new Date(raw).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
      : "—";
  };

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
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:#26352f;padding:32px;}
      h1{font-size:20px;margin:0 0 4px;} p{color:#617068;font-size:12px;margin:0 0 20px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th{text-align:left;border-bottom:2px solid #b36b3c;padding:8px 6px;text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:#b36b3c;}
      td{border-bottom:1px solid #eeeae2;padding:8px 6px;}
      .total{margin-top:16px;text-align:right;font-weight:700;}
    </style></head><body>
      <h1>My Giving Report</h1>
      <p>${fromDate} to ${toDate}</p>
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

  const toggleAccount = (account: string) => {
    setSelectedAccounts((current) =>
      current.includes(account) ? current.filter((item) => item !== account) : [...current, account]
    );
  };

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
  // The M-Pesa paying-in details, as set in church settings; hidden when unset.
  const [churchMpesaDetails, setChurchMpesaDetails] = useState({
    mpesa_paybill_number: "",
    mpesa_account_number: "",
    mpesa_account_name: "",
    mpesa_phone_number: "",
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
          setChurchMpesaDetails({
            mpesa_paybill_number: data.mpesa_paybill_number || "",
            mpesa_account_number: data.mpesa_account_number || "",
            mpesa_account_name: data.mpesa_account_name || "",
            mpesa_phone_number: data.mpesa_phone_number || "",
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
      // The name rides the initiation context: Safaricom's push callback
      // does not carry it, so the form is where the giver says who they are.
      payload.donor_name = donorName;

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
        setShowGiveModal(false);
        setLoading(false);
        setMessage(promptMessage);
        showAlert("M-Pesa prompt sent", promptMessage, "info", {
          toast: true,
          position: "top-end",
          timer: 7000,
          showConfirmButton: false,
        });
        loadMyGivings();
      } else {
        const successMsg = data.message ?? "Thank you! Your Bank Transfer contribution details have been recorded.";
        setMessage(successMsg);
        showAlert("Contribution Received", successMsg, "success");
        setShowGiveModal(false);
        loadMyGivings();
        setLoading(false);
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
    <main className={signedIn ? "authenticated-giving-page flex h-full min-h-0 flex-col overflow-hidden bg-white text-[#26352f]" : "min-h-screen bg-[#f7f4ee] text-[#26352f]"}>
      {/* No bottom padding while signed in: the pinned footer bar meets the
          mobile tab bar directly (the shell already reserves the bar height). */}
      <div className={signedIn ? "flex min-h-0 flex-1 flex-col px-5 pb-0 pt-3 sm:px-8 sm:pb-5 sm:pt-5 lg:px-10" : "mx-auto max-w-6xl px-6 py-10 lg:px-8 lg:py-12"}>
          <div className={signedIn ? "flex min-h-0 flex-1 flex-col space-y-4" : "space-y-6"}>
            {/* Hidden on phones: vertical space there belongs to the givings list. */}
            <h1 className="mt-3 hidden shrink-0 text-3xl font-semibold tracking-tight sm:text-4xl md:block">
              Money Giving
            </h1>

            {/* ── My Givings (signed-in members) ── */}
            {signedIn && (
              <section className={signedIn ? "mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#dfdbd1]" : "mt-8 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#dfdbd1]"}>
                <div className="shrink-0 space-y-3 border-b border-[#dfdbd1] px-5 py-4">
                  <h2 className="text-lg font-bold text-[#26352f]">My Givings</h2>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} title="From date" className="min-w-0 flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-2.5 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                      <span className="shrink-0 text-xs text-[#617068]">→</span>
                      <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} title="To date" className="min-w-0 flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-2.5 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
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
                              ? "border-[#dfdbd1] bg-[#f7f4ee] text-[#617068]"
                              : "border-[#26352f] bg-[#26352f] text-white shadow-sm"
                          }`}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          {givingStatusFilter === "successful" ? "Filter" : givingStatusFilter === "failed" ? "Failed" : "All"}
                        </button>
                        {showStatusFilterMenu && (
                          <div className="absolute z-20 mt-2 w-36 overflow-hidden rounded-xl border border-[#dfdbd1] bg-white shadow-lg">
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
                                    ? "bg-[#eef2ed] text-[#26352f]"
                                    : "text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f]"
                                }`}
                              >
                                <span className="capitalize">{key}</span>
                                {givingStatusFilter === key && <Check className="h-3.5 w-3.5 text-[#b36b3c]" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Desktop: full segmented control. */}
                      <div className="hidden h-9 shrink-0 items-center rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-0.5 md:flex" role="group" aria-label="Filter by status">
                        {(["successful", "failed", "all"] as const).map((key) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setGivingStatusFilter(key)}
                            className={`h-8 rounded-lg px-2.5 text-[11px] font-semibold capitalize transition ${
                              givingStatusFilter === key
                                ? "bg-[#26352f] text-white shadow-sm"
                                : "text-[#617068] hover:text-[#26352f]"
                            }`}
                          >
                            {key}
                          </button>
                        ))}
                      </div>
                      <input type="text" placeholder="Search account, method or receipt…" value={givingSearch} onChange={(e) => setGivingSearch(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none" />
                    </div>
                  </div>
                </div>

                <div className={signedIn ? "flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-3" : "px-5 py-3"}>
                  {/* Desktop table */}
                  <div className={signedIn ? "hidden min-h-0 flex-1 overflow-y-auto custom-table-scrollbar md:block" : "hidden md:block"}>
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#dfdbd1]">
                        <tr className="text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
                          <th className="pb-3 pr-4 font-bold w-8">#</th>
                          <th className="pb-3 pr-4 font-bold">Date</th>
                          <th className="pb-3 pr-4 font-bold">Account</th>
                          <th className="pb-3 pr-4 font-bold">Method</th>
                          <th className="pb-3 pr-4 font-bold">Receipt</th>
                          <th className="pb-3 pr-4 text-right font-bold">Amount</th>
                          <th className="pb-3 font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eeeae2]">
                        {loadingGivings ? (
                          <tr><td colSpan={7} className="py-8 text-center text-xs text-[#617068]">Loading your givings...</td></tr>
                        ) : filteredGivings.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center">
                              <p className="text-xs font-semibold text-[#26352f]">No givings in this period</p>
                              <p className="mt-1 text-[11px] text-[#617068]">Adjust the dates above or tap Give Now.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredGivings.map((g, idx) => (
                            <tr key={g.id} className="hover:bg-[#f7f4ee]">
                              <td className="py-3 pr-4 text-[#617068] w-8">{idx + 1}</td>
                              <td className="py-3 pr-4 text-[#617068]">{fmtGivingDate(g)}</td>
                              <td className="py-3 pr-4 font-semibold text-[#26352f]">{g.purpose || "—"}</td>
                              <td className="py-3 pr-4 text-[#617068]">{methodLabel(g.payment_method)}</td>
                              <td className="py-3 pr-4 font-mono text-[#617068]">{g.mpesa_receipt_number || "—"}</td>
                              <td className="py-3 pr-4 text-right font-semibold text-[#26352f]">KES {Number(g.amount || 0).toLocaleString()}</td>
                              <td className="py-3">{statusBadge(g.status)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  {/* Mobile cards scroll inside the card between the pinned filters and the pinned footer. */}
                  <div className={signedIn ? "custom-table-scrollbar min-h-0 flex-1 grid gap-3 overflow-y-auto overscroll-contain pb-2 md:hidden" : "grid gap-3 md:hidden"}>
                    {loadingGivings ? (
                      <div className="py-8 text-center text-xs text-[#617068]">Loading your givings...</div>
                    ) : filteredGivings.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#617068]">No givings in this period.</div>
                    ) : (
                      filteredGivings.map((g) => (
                        <div key={g.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-[#26352f]">{g.purpose || "—"}</h3>
                            {statusBadge(g.status)}
                          </div>
                          <p className="text-xs text-[#617068]">{fmtGivingDate(g)} · {methodLabel(g.payment_method)}</p>
                          <p className="text-sm font-bold text-[#b36b3c]">KES {Number(g.amount || 0).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#dfdbd1] px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <p className="text-[11px] text-[#617068]">{fromDate} → {toDate}</p>
                    <p className="text-[11px] font-semibold text-[#26352f]">
                      {loadingGivings ? "Loading your givings..." : `${filteredGivings.length} giving${filteredGivings.length === 1 ? "" : "s"} · KES ${givingTotal.toLocaleString()}`}
                    </p>
                  </div>
                  {/* On a phone the two actions split the row evenly. */}
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <button
                      type="button"
                      onClick={handlePrintMyReport}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#c9c5bb] bg-white px-4 py-2 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee] sm:flex-none"
                    >
                      🖨️ Print My Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGiveModal(true)}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#b36b3c] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#96552c] sm:flex-none"
                    >
                      Give Now
                    </button>
                  </div>
                </div>
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
        className="public-section-nav border-t border-[#dfdbd1] bg-white/60"
      />

      {/* ── Give Now modal ── */}
      {showGiveModal && (
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
                onClick={() => setShowGiveModal(false)}
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
                    Receipts are only emailed to the verified address on a member&apos;s account.{" "}
                    <Link href="/login?next=/give" className="font-semibold text-[#b36b3c] hover:underline">
                      Sign in
                    </Link>{" "}
                    and this field fills itself in.
                  </div>
                )}
              </div>

              {/* 2. Giving Accounts & Method of Giving */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="block self-start text-sm font-medium text-[#26352f]">
                  <span>Giving accounts</span>
                  <div className="relative mt-2">
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
                      <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-[#dfdbd1] bg-white p-2 shadow-xl">
                        {/* Header stays fixed while the account rows scroll under
                            it, with the count on the left and Done on the right. */}
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-[#dfdbd1] bg-white px-2 py-1.5">
                          <p className="min-w-0 flex-1 truncate pr-2 text-[10px] font-bold uppercase tracking-wider text-[#b36b3c]">
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
                        <div className="max-h-64 overflow-y-auto">
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
                      </div>
                    )}
                  </div>
                </div>

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
                  {/* The church's own M-Pesa paying-in details, when the office
                      has set them — for members giving by Send Money or Pay
                      Bill from their own phone rather than the STK prompt. */}
                  {(churchMpesaDetails.mpesa_paybill_number || churchMpesaDetails.mpesa_phone_number) && (
                    <div className="rounded-2xl border border-[#dfdbd1] bg-[#f4f7f2] p-4 text-xs space-y-2">
                      <p className="font-bold text-[#26352f] text-sm flex items-center gap-2">
                        <span>📱</span> Church M-Pesa Details
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#3d5148] pt-1">
                        {churchMpesaDetails.mpesa_paybill_number && (
                          <div><span className="font-semibold text-[#26352f]">Pay Bill:</span> {churchMpesaDetails.mpesa_paybill_number}</div>
                        )}
                        {churchMpesaDetails.mpesa_account_number && (
                          <div><span className="font-semibold text-[#26352f]">Account:</span> {churchMpesaDetails.mpesa_account_number}</div>
                        )}
                        {churchMpesaDetails.mpesa_account_name && (
                          <div><span className="font-semibold text-[#26352f]">Account Name:</span> {churchMpesaDetails.mpesa_account_name}</div>
                        )}
                        {churchMpesaDetails.mpesa_phone_number && (
                          <div><span className="font-semibold text-[#26352f]">Send Money:</span> {churchMpesaDetails.mpesa_phone_number}</div>
                        )}
                      </div>
                    </div>
                  )}
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
      )}

    </main>
  );
}

export default function GivePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white px-6 py-16 text-center text-[#617068]">
          Loading giving options...
        </main>
      }
    >
      <GivePageContent />
    </Suspense>
  );
}
