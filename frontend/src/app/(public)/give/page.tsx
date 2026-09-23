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

  const [purpose, setPurpose] = useState(normalizedPurpose);
  const [methodOfGiving, setMethodOfGiving] = useState<MethodOfGiving>("mpesa");
  const [amount, setAmount] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bankRefNumber, setBankRefNumber] = useState("");
  const [senderBankName, setSenderBankName] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
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

  // Signed-in givers get their name filled in for them; typing still wins.
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (!me) return;
        const full = `${me.first_name || ""} ${me.last_name || ""}`.trim() || me.username || "";
        setDonorName((current) => (current ? current : full));
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
      setPurpose(mapped);
      setShowGiveModal(true);
    }
  }, [rawPurposeParam]);

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
  const ensureLinkedPurpose = (list: string[], wanted: string) =>
    wanted && !list.includes(wanted) ? [wanted, ...list] : list;

  useEffect(() => {
    fetch(`${API_URL}/api/members/giving-purposes/`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: { name: string }[]) => {
        const apiNames = data.map((item) => item.name);
        const published = apiNames.length ? apiNames : defaultPurposes;
        const exact = linkedPurpose
          ? published.find((name) => name.toLowerCase() === linkedPurpose.toLowerCase())
          : undefined;
        if (exact) setPurpose(exact);
        setPurposes(ensureLinkedPurpose(published, exact ?? normalizedPurpose));
      })
      .catch(() => setPurposes(ensureLinkedPurpose(defaultPurposes, normalizedPurpose)));
  }, [linkedPurpose, normalizedPurpose]);

  async function submitGiving(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

    try {
      if (methodOfGiving === "mpesa") {
        const cleanPhone = phoneNumber.replace(/\D/g, "");
        if (cleanPhone.length !== 10) {
          showAlert("Invalid Phone Number", "Please enter a valid 10-digit phone number.", "warning");
          setLoading(false);
          return;
        }
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
        amount: amount,
        purpose,
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrintMyReport}
                      className="rounded-xl border border-[#c9c5bb] bg-white px-4 py-2 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee]"
                    >
                      🖨️ Print My Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGiveModal(true)}
                      className="rounded-xl bg-[#b36b3c] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#96552c]"
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
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#b36b3c]">Money Giving</p>
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

              {/* 1. Giving Account & Method of Giving */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-[#26352f]">
                  Giving account
                  <select
                    required
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  >
                    <option value="" disabled>
                      -- select --
                    </option>
                    {purposes.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-[#26352f]">
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

              {/* 2. Method-Specific Fields & Details */}
              {methodOfGiving === "mpesa" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block text-sm font-medium text-[#26352f]">
                    Amount (KES)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                    />
                  </label>

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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block text-sm font-medium text-[#26352f]">
                      Amount (KES)
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                      />
                    </label>

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
              {/* 3. Name & Email Row — the name rides the initiation context so
                  the callback records who gave; signed-in givers see it prefilled. */}
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

                <label className="block text-sm font-medium text-[#26352f]">
                  Email
                  <input
                    type="email"
                    placeholder="Email for contribution receipt"
                    value={donorEmail}
                    onChange={(event) => setDonorEmail(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </label>
              </div>

              <button
                disabled={loading}
                className="mt-6 w-full rounded-full bg-[#b36b3c] px-6 py-3.5 text-sm sm:text-base font-semibold text-white transition hover:bg-[#96552e] disabled:opacity-60"
              >
                {submitButtonText}
              </button>
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
