"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { showAlert } from "@/lib/alerts";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";

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

function GivePageContent() {
  const searchParams = useSearchParams();
  const rawPurposeParam = searchParams.get("purpose");
  const normalizedPurpose = rawPurposeParam ? getMinistryGivingPurpose(rawPurposeParam) : "Tithe";

  const [purpose, setPurpose] = useState(normalizedPurpose);
  const [methodOfGiving, setMethodOfGiving] = useState<MethodOfGiving>("mpesa");
  const [amount, setAmount] = useState("1000");
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

  // M-Pesa STK Push Prompt state
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptTimeoutSeconds, setPromptTimeoutSeconds] = useState(45);

  // ── My Givings ────────────────────────────────────────────────────────────
  const [signedIn, setSignedIn] = useState(false);
  const [myGivings, setMyGivings] = useState<MyGiving[]>([]);
  const [loadingGivings, setLoadingGivings] = useState(false);
  const [fromDate, setFromDate] = useState(firstSabbathOfCurrentMonth);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [givingSearch, setGivingSearch] = useState("");
  const [givingPurposeFilter, setGivingPurposeFilter] = useState("all");

  const loadMyGivings = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    setLoadingGivings(true);
    fetch(`${API_URL}/api/members/contributions/`, { headers: { Authorization: `Bearer ${token}` } })
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

  const givingDateOf = (g: MyGiving) => (g.paid_at || g.created_at || "").slice(0, 10);

  const myPurposes = Array.from(new Set(myGivings.map((g) => g.purpose).filter(Boolean))).sort();

  const filteredGivings = myGivings.filter((g) => {
    const d = givingDateOf(g);
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    if (givingPurposeFilter !== "all" && g.purpose !== givingPurposeFilter) return false;
    const q = givingSearch.toLowerCase();
    if (q && !`${g.purpose} ${g.payment_method} ${g.mpesa_receipt_number || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const givingTotal = filteredGivings.reduce((sum, g) => sum + Number(g.amount || 0), 0);

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
          `<tr><td>${i + 1}</td><td>${esc(fmtGivingDate(g))}</td><td>${esc(g.purpose || "—")}</td><td>${esc(methodLabel(g.payment_method))}</td><td>${esc(g.mpesa_receipt_number || "—")}</td><td style="text-align:right">KES ${Number(g.amount || 0).toLocaleString()}</td><td>${(g.status || "").toLowerCase() === "completed" ? "Completed" : "Pending"}</td></tr>`
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
      <table><thead><tr><th>#</th><th>Date</th><th>Purpose</th><th>Method</th><th>Receipt</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
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

  useEffect(() => {
    fetch(`${API_URL}/api/members/giving-purposes/`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: { name: string }[]) => {
        const apiNames = data.map((item) => item.name);
        setPurposes(apiNames.length ? apiNames : defaultPurposes);
      })
      .catch(() => setPurposes(defaultPurposes));
  }, []);

  // Handle countdown timer for prompt timeout
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showPromptModal && promptTimeoutSeconds > 0) {
      timer = setInterval(() => {
        setPromptTimeoutSeconds((prev) => prev - 1);
      }, 1000);
    } else if (showPromptModal && promptTimeoutSeconds === 0) {
      setShowPromptModal(false);
      setLoading(false);
      setMessage("Cancelled");
      showAlert("Cancelled", "Payment prompt timed out.", "warning");
    }
    return () => clearInterval(timer);
  }, [showPromptModal, promptTimeoutSeconds]);

  const handleCancelPrompt = () => {
    setShowPromptModal(false);
    setLoading(false);
    setMessage("Cancelled");
    showAlert("Cancelled", "Transaction cancelled.", "info");
  };

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
        donor_name: donorName,
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
        setPromptTimeoutSeconds(45);
        setShowGiveModal(false);
        setShowPromptModal(true);
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
    <main className="min-h-screen md:h-screen bg-white text-[#26352f] md:overflow-hidden">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <SupportSidebar />
        <div className="flex-1 min-w-0 w-full h-full md:h-[calc(100vh-4rem)] bg-white p-5 pb-28 sm:p-8 lg:p-10 border-b border-[#dfdbd1] md:overflow-y-auto custom-hover-scrollbar">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Tithes &amp; Offerings
                </h1>
                <p className="hidden sm:block mt-2 text-base text-[#617068]">
                  Faithfully give tithes, offerings, ministry support, or church building funds.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGiveModal(true)}
                className="rounded-xl bg-[#b36b3c] px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#96552c]"
              >
                Give Now
              </button>
            </div>

            {/* ── My Givings (signed-in members) ── */}
            {signedIn && (
              <section className="mt-8 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#dfdbd1]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfdbd1] px-5 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#26352f]">My Givings</h2>
                    <p className="mt-0.5 text-xs text-[#617068]">
                      {loadingGivings
                        ? "Loading your givings..."
                        : `${filteredGivings.length} giving${filteredGivings.length === 1 ? "" : "s"} · KES ${givingTotal.toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      max={toDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      title="From date"
                      className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
                    />
                    <span className="text-xs text-[#617068]">→</span>
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate}
                      onChange={(e) => setToDate(e.target.value)}
                      title="To date"
                      className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
                    />
                    <select
                      value={givingPurposeFilter}
                      onChange={(e) => setGivingPurposeFilter(e.target.value)}
                      className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none"
                    >
                      <option value="all">All purposes</option>
                      {myPurposes.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={givingSearch}
                      onChange={(e) => setGivingSearch(e.target.value)}
                      className="min-w-[130px] flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="px-5 py-3">
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#dfdbd1]">
                        <tr className="text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
                          <th className="pb-3 font-bold w-8">#</th>
                          <th className="pb-3 font-bold">Date</th>
                          <th className="pb-3 font-bold">Purpose</th>
                          <th className="pb-3 font-bold">Method</th>
                          <th className="pb-3 font-bold">Receipt</th>
                          <th className="pb-3 text-right font-bold">Amount</th>
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
                              <td className="py-3 text-[#617068] w-8">{idx + 1}</td>
                              <td className="py-3 text-[#617068]">{fmtGivingDate(g)}</td>
                              <td className="py-3 font-semibold text-[#26352f]">{g.purpose || "—"}</td>
                              <td className="py-3 text-[#617068]">{methodLabel(g.payment_method)}</td>
                              <td className="py-3 font-mono text-[#617068]">{g.mpesa_receipt_number || "—"}</td>
                              <td className="py-3 text-right font-semibold text-[#26352f]">KES {Number(g.amount || 0).toLocaleString()}</td>
                              <td className="py-3">
                                {(g.status || "").toLowerCase() === "completed" ? (
                                  <span className="rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-[10px] font-bold text-[#3d7146]">Completed</span>
                                ) : (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Pending</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="grid gap-3 md:hidden">
                    {loadingGivings ? (
                      <div className="py-8 text-center text-xs text-[#617068]">Loading your givings...</div>
                    ) : filteredGivings.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#617068]">No givings in this period.</div>
                    ) : (
                      filteredGivings.map((g) => (
                        <div key={g.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-[#26352f]">{g.purpose || "—"}</h3>
                            {(g.status || "").toLowerCase() === "completed" ? (
                              <span className="shrink-0 rounded-full bg-[#eef2ed] px-2 py-0.5 text-[10px] font-bold text-[#3d7146]">Completed</span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Pending</span>
                            )}
                          </div>
                          <p className="text-xs text-[#617068]">{fmtGivingDate(g)} · {methodLabel(g.payment_method)}</p>
                          <p className="text-sm font-bold text-[#b36b3c]">KES {Number(g.amount || 0).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfdbd1] px-5 py-3">
                  <p className="text-[11px] text-[#617068]">{fromDate} → {toDate}</p>
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
      </div>

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

              {/* 1. Giving Purpose & Method of Giving */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-[#26352f]">
                  Giving purpose
                  <select
                    required
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#c9c5bb] bg-white px-4 py-3 text-sm outline-none focus:border-[#b36b3c]"
                  >
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

              {/* 3. Name & Email Row */}
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

      {/* M-Pesa STK Push Prompt Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in duration-150 border border-[#dfdbd1]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f7f0e8] text-[#b36b3c]">
              <span className="text-2xl animate-pulse">📲</span>
            </div>
            <h3 className="text-xl font-bold text-[#26352f]">M-Pesa Payment Prompt</h3>
            <p className="text-xs leading-relaxed text-[#617068]">
              A payment prompt for <strong className="text-[#26352f]">KES {Number(amount).toLocaleString()}</strong> ({purpose}) has been sent to phone <strong className="text-[#26352f]">{phoneNumber}</strong>.
            </p>
            <p className="text-xs font-semibold text-[#b36b3c]">
              Please check your phone screen and enter your M-Pesa PIN.
            </p>

            <div className="py-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f7f4ee] px-4 py-1.5 text-xs font-bold text-[#26352f]">
                <span>Timeout in:</span>
                <span className="font-mono text-[#b36b3c]">{promptTimeoutSeconds}s</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#dfdbd1]">
              <button
                type="button"
                onClick={handleCancelPrompt}
                className="w-full rounded-full border border-[#c9c5bb] bg-white px-5 py-2.5 text-xs font-bold text-[#b91c1c] transition hover:bg-[#fdf2f2]"
              >
                Cancel
              </button>
            </div>
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
