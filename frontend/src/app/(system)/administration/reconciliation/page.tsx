"use client";

import Link from "next/link";
import { FormEvent, Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X, RotateCw, Phone, Mail, MessageSquare, Send, CheckCircle2, Printer, FileSpreadsheet, ArrowLeft } from "lucide-react";
import { AdminSidebar } from "@/components/sidebars/admin-sidebar";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const financeRoles = ["finance", "treasurer", "admin", "leader"];
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
const money = (amount: string | number) => Number(amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getFirstSabbathOfMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay();
  const daysUntilSat = (6 - dayOfWeek + 7) % 7;
  const firstSat = new Date(year, month, 1 + daysUntilSat);
  const yyyy = firstSat.getFullYear();
  const mm = String(firstSat.getMonth() + 1).padStart(2, "0");
  const dd = String(firstSat.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const defaultPurposes = [
  "Tithe",
  "Combined Offering",
  "13th Sabbath",
  "Msamaria Mwema",
  "Camp Expenses",
  "Camp Goal",
  "Development",
  "Children",
  "Possibility",
  "Youth",
  "Men",
  "Women",
  "Choir",
  "Chaplaincy",
];

type PurposeRow = {
  purpose: string;
  mpesa: string;
  bank_transfer: string;
  cheque: string;
  cash: string;
  total: string;
};

type ColumnTotals = {
  mpesa: string;
  bank_transfer: string;
  cheque: string;
  cash: string;
  total: string;
};

type Reconciliation = {
  digital_amount_confirmed: string; cash_amount_counted: string; notes: string; reconciled_by_name: string; reconciled_at: string;
};
type Summary = {
  date: string; from_date?: string; to_date?: string; digital_recorded: string; cash_recorded: string; total_recorded: string;
  digital_contribution_count: number; cash_contribution_count: number;
  purpose_breakdown?: PurposeRow[];
  totals?: ColumnTotals;
  reconciliation: Reconciliation | null;
};
type CashReceipt = { id: number; received_on: string; amount: string; purpose: string; donor_name: string; giver_phone?: string; giver_email?: string; receipt_number?: string; notes?: string; received_by_name: string; created_at: string };

type IndividualGiving = {
  id: string;
  raw_id: number;
  source: "digital" | "cash";
  giving_type: string;
  purpose: string;
  amount: string;
  donor_name: string;
  giver_phone?: string;
  giver_email?: string;
  payment_method: string;
  receipt_number: string;
  received_at: string;
  receipt_sent_at?: string | null;
  status: string;
  item_description?: string;
};

export default function ReconciliationPage() {
  const [fromDate, setFromDate] = useState(getFirstSabbathOfMonth);
  const [toDate, setToDate] = useState(localDate);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashReceipts, setCashReceipts] = useState<CashReceipt[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "denied">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [purposes, setPurposes] = useState<string[]>([]);
  const [cashForm, setCashForm] = useState({ amount: "", purpose: "Combined Offering", donor_name: "", giver_phone: "", giver_email: "", received_on: localDate() });
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "bank_transfer" | "cheque">("cash");
  const [itemDescription, setItemDescription] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);
  const [customPurpose, setCustomPurpose] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [isCustomMessage, setIsCustomMessage] = useState(false);
  const [settingsReceiptTemplate, setSettingsReceiptTemplate] = useState(
    "Thank you, {name}, for contributing {amount} towards {purpose}. May God bless you abundantly!"
  );

  // Purpose Expansion & View Mode State
  const [expandedPurpose, setExpandedPurpose] = useState<string | null>(null);
  const [purposeSearchQuery, setPurposeSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"summary" | "all_givings">("all_givings");
  const [allGivingsList, setAllGivingsList] = useState<IndividualGiving[]>([]);
  const [loadingAllGivings, setLoadingAllGivings] = useState(false);
  const [purposeGivings, setPurposeGivings] = useState<Record<string, IndividualGiving[]>>({});
  const [loadingPurpose, setLoadingPurpose] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [contactModalGiver, setContactModalGiver] = useState<IndividualGiving | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [actionDropUp, setActionDropUp] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeActionMenuId !== null) {
        const target = e.target as HTMLElement;
        if (!target.closest(".actions-menu-container")) {
          setActiveActionMenuId(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeActionMenuId]);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` });

  useEffect(() => {
    fetch(`${API_URL}/api/members/giving-purposes/`, { headers: headers() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { name: string }[]) => {
        const apiNames = data.map((item) => item.name);
        setPurposes(apiNames.length ? apiNames : defaultPurposes);
      })
      .catch(() => setPurposes(defaultPurposes));
  }, []);

  // Fetch receipt message template from church settings on mount
  useEffect(() => {
    fetch(`${API_URL}/api/members/church-settings/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.default_receipt_message) {
          setSettingsReceiptTemplate(data.default_receipt_message);
        }
      })
      .catch(() => undefined);
  }, []);

  const formatReceiptDefaultMsg = (name: string, amt: string, purp: string, custPurp: string, itemDesc: string, type: string, pm: string) => {
    const nameVal = name.trim() || "{name}";
    const amountVal = amt.trim() ? `kes ${amt.trim()}` : "kes {amount}";
    const purposeVal = purp === "Other" ? (custPurp.trim() || "{purpose}") : (purp || "{purpose}");
    return settingsReceiptTemplate
      .replace("{name}", nameVal)
      .replace("{amount}", amountVal)
      .replace("{purpose}", purposeVal);
  };

  useEffect(() => {
    if (isModalOpen && !isCustomMessage) {
      setReceiptMessage(formatReceiptDefaultMsg(cashForm.donor_name, cashForm.amount, cashForm.purpose, customPurpose, itemDescription, "individual", paymentMethod));
    }
  }, [isModalOpen, isCustomMessage, cashForm.donor_name, cashForm.amount, cashForm.purpose, customPurpose, itemDescription, paymentMethod]);

  const loadAllGivings = async (fDate = fromDate, tDate = toDate) => {
    setLoadingAllGivings(true);
    try {
      const res = await fetch(
        `${API_URL}/api/members/treasury/purpose-contributions/?from_date=${fDate}&to_date=${tDate}`,
        { headers: headers() }
      );
      if (res.ok) {
        const data = await res.json();
        setAllGivingsList(data);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoadingAllGivings(false);
    }
  };

  async function load(fDate = fromDate, tDate = toDate) {
    setMessage("");
    const profile = await fetch(`${API_URL}/api/members/me/`, { headers: headers() }).then((res) => res.ok ? res.json() : null);
    const profileRoles: string[] = Array.isArray(profile?.roles) && profile.roles.length > 0 ? profile.roles : [profile?.role].filter(Boolean);
    if (!profile || !profileRoles.some((r) => financeRoles.includes(r))) { setStatus("denied"); return; }
    const [summaryRes, cashRes] = await Promise.all([
      fetch(`${API_URL}/api/members/treasury/reconciliation/?from_date=${fDate}&to_date=${tDate}`, { headers: headers() }),
      fetch(`${API_URL}/api/members/treasury/cash-contributions/?from_date=${fDate}&to_date=${tDate}`, { headers: headers() }),
    ]);
    if (!summaryRes.ok || !cashRes.ok) { setMessage("Could not load reconciliation data. Please try again."); setStatus("ready"); return; }
    const loadedSummary = await summaryRes.json() as Summary;
    setSummary(loadedSummary);
    setCashReceipts(await cashRes.json());
    setPurposeGivings({});
    await loadAllGivings(fDate, tDate);
    setStatus("ready");
  }

  useEffect(() => { load(); }, []);

  async function changeFromDate(nextFrom: string) { setFromDate(nextFrom); setStatus("loading"); await load(nextFrom, toDate); }
  async function changeToDate(nextTo: string) { setToDate(nextTo); setStatus("loading"); await load(fromDate, nextTo); }

  const toggleExpandPurpose = async (purposeName: string) => {
    if (expandedPurpose === purposeName) {
      setExpandedPurpose(null);
      return;
    }
    setExpandedPurpose(purposeName);
    if (!purposeGivings[purposeName]) {
      setLoadingPurpose(purposeName);
      try {
        const res = await fetch(
          `${API_URL}/api/members/treasury/purpose-contributions/?purpose=${encodeURIComponent(purposeName)}&from_date=${fromDate}&to_date=${toDate}`,
          { headers: headers() }
        );
        if (res.ok) {
          const data = await res.json();
          setPurposeGivings((prev) => ({ ...prev, [purposeName]: data }));
        }
      } catch {
        // Ignore fetch errors
      } finally {
        setLoadingPurpose(null);
      }
    }
  };

  const handleDownloadBackendPdf = async (includeIndividual: boolean = false, purposeName?: string | null) => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const params = new URLSearchParams();
      if (fromDate) params.append("start_date", fromDate);
      if (toDate) params.append("end_date", toDate);
      if (includeIndividual) params.append("include_individual", "true");
      if (purposeName) params.append("purpose", purposeName);

      const pdfUrl = `${API_URL}/api/members/reports/reconciliation/pdf/?${params.toString()}`;
      const res = await fetch(pdfUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        const tag = purposeName ? `_${purposeName}` : "";
        a.download = `Financial_Reconciliation${tag}_${fromDate || "all"}_to_${toDate || "all"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        window.print();
      }
    } catch {
      window.print();
    }
  };

  const handleResendReceipt = async (giving: IndividualGiving) => {
    setResendingId(giving.id);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/resend-receipt/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ source: giving.source, id: giving.raw_id }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(data.detail || "Receipt resent successfully.");
        const nowStr = new Date().toISOString();
        setPurposeGivings((prev) => {
          const currentList = prev[giving.purpose] || [];
          const updated = currentList.map((g) => (g.id === giving.id ? { ...g, receipt_sent_at: nowStr } : g));
          return { ...prev, [giving.purpose]: updated };
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setMessage(errData.detail || "Could not resend receipt.");
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setResendingId(null);
    }
  };

  async function addCash(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("");
    const finalPurpose = cashForm.purpose === "Other" && customPurpose.trim() ? customPurpose.trim() : cashForm.purpose;
    if (cashForm.purpose === "Other" && customPurpose.trim()) {
      const words = customPurpose.trim().split(/\s+/);
      if (words.length > 2) {
        setMessage("Custom giving purpose must be at most 2 words (e.g. 'Youth' or 'Camp Goal').");
        setSaving(false);
        return;
      }
      if (customPurpose.trim().length > 20) {
        setMessage("Custom giving purpose must be at most 20 characters.");
        setSaving(false);
        return;
      }
    }
    const finalDonorName = cashForm.donor_name;

    const receiptDate = cashForm.received_on || toDate || localDate();
    let nextFrom = fromDate;
    let nextTo = toDate;
    if (receiptDate < fromDate) nextFrom = receiptDate;
    if (receiptDate > toDate) nextTo = receiptDate;
    if (nextFrom !== fromDate) setFromDate(nextFrom);
    if (nextTo !== toDate) setToDate(nextTo);

    const response = await fetch(`${API_URL}/api/members/treasury/cash-contributions/`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        ...cashForm,
        notes: receiptMessage,
        donor_name: finalDonorName,
        entry_type: "individual",
        payment_method: paymentMethod,
        item_description: "",
        amount: cashForm.amount,
        purpose: finalPurpose,
        received_on: receiptDate,
        send_sms: sendSms,
        send_email: sendEmail,
      })
    });
    setSaving(false);
    if (!response.ok) { const body = await response.json().catch(() => ({})); setMessage(body.amount?.[0] || body.detail || "Could not save the receipt."); return; }
    setCashForm({ amount: "", purpose: "Combined Offering", donor_name: "", giver_phone: "", giver_email: "", received_on: localDate() });
    setPaymentMethod("cash");
    setItemDescription("");
    setCustomPurpose("");
    setReceiptMessage("");
    setIsCustomMessage(false);
    setSendSms(true);
    setSendEmail(true);
    setIsModalOpen(false);
    setMessage((await response.clone().json().catch(() => ({}))).receipt_delivery_message || "Receipt saved successfully.");
    await load(nextFrom, nextTo);
    await loadAllGivings(nextFrom, nextTo);
    if (expandedPurpose) {
      try {
        const pRes = await fetch(
          `${API_URL}/api/members/treasury/purpose-contributions/?purpose=${encodeURIComponent(expandedPurpose)}&from_date=${nextFrom}&to_date=${nextTo}`,
          { headers: headers() }
        );
        if (pRes.ok) {
          const pData = await pRes.json();
          setPurposeGivings((prev) => ({ ...prev, [expandedPurpose]: pData }));
        }
      } catch {}
    }
  }

  if (status === "loading") return <main className="min-h-screen bg-[#f7f4ee] p-10 text-center text-[#617068]">Loading reconciliation workspace…</main>;
  if (status === "denied") return <main className="min-h-screen bg-[#f7f4ee] p-10"><div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold text-[#26352f]">Finance access required</h1><p className="mt-3 text-[#617068]">This workspace is available to treasurers, finance managers, church leaders, and administrators.</p><Link href="/administration" className="mt-6 inline-block font-semibold text-[#b36b3c]">Back to administration</Link></div></main>;

  const rawRows = summary?.purpose_breakdown || [];
  const displayedRows: PurposeRow[] = rawRows.filter((r) => Number(r.total || 0) > 0);

  const totals = {
    mpesa: summary?.totals?.mpesa ? Number(summary.totals.mpesa) : displayedRows.reduce((acc, r) => acc + Number(r.mpesa || 0), 0),
    bank_transfer: summary?.totals?.bank_transfer ? Number(summary.totals.bank_transfer) : displayedRows.reduce((acc, r) => acc + Number(r.bank_transfer || 0), 0),
    cheque: summary?.totals?.cheque ? Number(summary.totals.cheque) : displayedRows.reduce((acc, r) => acc + Number(r.cheque || 0), 0),
    cash: summary?.totals?.cash ? Number(summary.totals.cash) : displayedRows.reduce((acc, r) => acc + Number(r.cash || 0), 0),
    total: summary?.totals?.total ? Number(summary.totals.total) : displayedRows.reduce((acc, r) => acc + Number(r.total || 0), 0),
  };

  const selectedGivings = expandedPurpose ? purposeGivings[expandedPurpose] || [] : [];
  const selectedPurposeTotal = selectedGivings.reduce((acc, g) => acc + Number(g.amount || 0), 0);

  const handleExportSpreadsheet = async () => {
    if (viewMode === "all_givings") {
      // Client-side CSV for individual givings
      const headers = ["#", "Date", "Giver Name", "Giving Purpose", "Contact", "Payment Method", "Receipt Number", "Notes", "Amount (KES)"];
      const rows = allGivingsList.map((g, idx) => [
        idx + 1,
        `"${(g.received_at || "").replace(/"/g, '""')}"`,
        `"${(g.donor_name || "Anonymous").replace(/"/g, '""')}"`,
        `"${(g.purpose || "").replace(/"/g, '""')}"`,
        `"${(g.giver_phone || g.giver_email || "").replace(/"/g, '""')}"`,
        `"${(g.payment_method || g.giving_type || "").replace(/"/g, '""')}"`,
        `"${(g.receipt_number || "").replace(/"/g, '""')}"`,
        `"${(g.item_description || "").replace(/"/g, '""')}"`,
        g.amount || 0,
      ]);
      const totalAmt = allGivingsList.reduce((acc, g) => acc + Number(g.amount || 0), 0);
      const totalRow = ["TOTAL", "", "All Givings", "", "", "", "", "", totalAmt];
      const csvContent = [headers.join(","), ...rows.map((r) => r.join(",")), totalRow.join(",")].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `individual_givings_${fromDate}_to_${toDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    // Summary view: download NEKF xlsx from backend
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const params = new URLSearchParams();
      if (fromDate) params.append("start_date", fromDate);
      if (toDate) params.append("end_date", toDate);
      const res = await fetch(`${API_URL}/api/members/reports/reconciliation/spreadsheet/?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `NEKF_Report_${fromDate || "all"}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      } else {
        // Fallback to CSV
        const headers = ["#", "Giving Purpose", "M-Pesa (KES)", "Bank-to-Bank (KES)", "Cheque (KES)", "Cash (KES)", "Total (KES)"];
        const rows = displayedRows.map((row, idx) => [idx + 1, `"${row.purpose.replace(/"/g, '""')}"`, row.mpesa, row.bank_transfer, row.cheque, row.cash, row.total]);
        const totalRow = ["TOTAL", "All Purposes", totals.mpesa, totals.bank_transfer, totals.cheque, totals.cash, totals.total];
        const csvContent = [headers.join(","), ...rows.map((r) => r.join(",")), totalRow.join(",")].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `reconciliation_summary_${fromDate}_to_${toDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch {
      const headers = ["#", "Giving Purpose", "M-Pesa (KES)", "Bank-to-Bank (KES)", "Cheque (KES)", "Cash (KES)", "Total (KES)"];
      const rows = displayedRows.map((row, idx) => [idx + 1, `"${row.purpose.replace(/"/g, '""')}"`, row.mpesa, row.bank_transfer, row.cheque, row.cash, row.total]);
      const totalRow = ["TOTAL", "All Purposes", totals.mpesa, totals.bank_transfer, totals.cheque, totals.cash, totals.total];
      const csvContent = [headers.join(","), ...rows.map((r) => r.join(",")), totalRow.join(",")].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `reconciliation_summary_${fromDate}_to_${toDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <main className="min-h-screen md:h-screen bg-[#f7f4ee] text-[#26352f] md:overflow-hidden pb-16 md:pb-0">
      <div className="flex h-full md:h-[calc(100vh-4rem)] md:overflow-hidden">
        <AdminSidebar />
        
        {/* SINGLE CARD TOUCHING MARGINS (ZERO MARGIN/PADDING) */}
        <div className="flex-1 min-w-0 p-0 h-full flex flex-col overflow-hidden pb-12 md:pb-0">
          <div className="w-full h-full flex flex-col rounded-none bg-white p-3 pb-0 sm:p-4 md:pb-4 border-l border-[#dfdbd1] overflow-hidden">
            
            {/* Header Controls (Flex-shrink-0) */}
            <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 py-1 w-full">
              <div className="hidden lg:flex items-center gap-3">
                <h1 className="text-xl font-semibold sm:text-2xl text-[#26352f]">
                  {viewMode === "all_givings"
                    ? "Individual Givings"
                    : "Contributions Ledger"}
                </h1>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                {/* View Mode Switcher occupying full width */}
                <div className="flex w-full flex-1 rounded-xl border border-[#c9c5bb] bg-[#f7f4ee] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedPurpose(null);
                      setViewMode("all_givings");
                      loadAllGivings();
                    }}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-center transition ${
                      viewMode === "all_givings"
                        ? "bg-[#26352f] text-white shadow-sm"
                        : "text-[#617068] hover:text-[#26352f]"
                    }`}
                  >
                    Individual Givings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode("summary");
                    }}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-center transition ${
                      viewMode === "summary"
                        ? "bg-white text-[#26352f] shadow-sm"
                        : "text-[#617068] hover:text-[#26352f]"
                    }`}
                  >
                    Summary Breakdown
                  </button>
                </div>

                {/* Date pickers row occupying full width */}
                <div className="flex w-full sm:w-auto items-center justify-between gap-2">
                  <label className="flex-1 sm:flex-none text-xs font-medium text-[#617068] flex items-center justify-between gap-1">
                    <span>From</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(event) => changeFromDate(event.target.value)}
                      className="w-full sm:w-auto rounded-xl border border-[#c9c5bb] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#b36b3c]"
                    />
                  </label>
                  <label className="flex-1 sm:flex-none text-xs font-medium text-[#617068] flex items-center justify-between gap-1">
                    <span>To</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(event) => changeToDate(event.target.value)}
                      className="w-full sm:w-auto rounded-xl border border-[#c9c5bb] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#b36b3c]"
                    />
                  </label>
                </div>
              </div>
            </div>

            {message && (
              <p className="shrink-0 mt-3 rounded-xl bg-[#f7f4ee] px-4 py-2.5 text-xs text-[#617068] border border-[#dfdbd1]">
                {message}
              </p>
            )}

            {/* MAIN CONTENT TABLE CONTAINER (Flex-1, Non-scrollable outer page, scrollable table rows, fixed totals) */}
            <div className="flex-1 min-h-0 flex flex-col mt-3 overflow-hidden rounded-xl border border-[#dfdbd1] bg-white">
              
              {/* VIEW 1: SUMMARY BREAKDOWN TABLE VIEW */}
              {/* VIEW 1: SUMMARY BREAKDOWN TABLE VIEW */}
              {viewMode === "summary" ? (
                expandedPurpose ? (
                  /* DEDICATED INDEPENDENT PURPOSE VIEW */
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
                    {/* Top Header of Dedicated Purpose View */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-[#dfdbd1] bg-[#faf7f2] shrink-0">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedPurpose(null);
                            setPurposeSearchQuery("");
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 py-1.5 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition shadow-sm"
                        >
                          <ArrowLeft className="h-4 w-4 text-[#b36b3c]" />
                          <span>Back to Summary</span>
                        </button>
                        <div>
                          <h2 className="text-base font-bold text-[#26352f] flex items-center gap-2">
                            <span>{expandedPurpose}</span>
                            <span className="rounded-full bg-[#26352f] px-2.5 py-0.5 text-xs font-semibold text-white">
                              {loadingPurpose === expandedPurpose
                                ? "Loading..."
                                : `${(purposeGivings[expandedPurpose] || []).filter((g) => {
                                    if (!purposeSearchQuery.trim()) return true;
                                    const q = purposeSearchQuery.toLowerCase();
                                    return (
                                      g.donor_name.toLowerCase().includes(q) ||
                                      (g.receipt_number && g.receipt_number.toLowerCase().includes(q)) ||
                                      (g.payment_method && g.payment_method.toLowerCase().includes(q))
                                    );
                                  }).length} entries`}
                            </span>
                          </h2>
                          <p className="text-xs text-[#617068]">
                            Individual givings for {expandedPurpose} ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`})
                          </p>
                        </div>
                      </div>

                      <div className="w-full sm:w-64">
                        <input
                          type="text"
                          placeholder="Search giver, receipt, mode..."
                          value={purposeSearchQuery}
                          onChange={(e) => setPurposeSearchQuery(e.target.value)}
                          className="w-full rounded-xl border border-[#c9c5bb] bg-white px-3 py-1.5 text-xs outline-none focus:border-[#b36b3c]"
                        />
                      </div>
                    </div>

                    {/* Main Content Area for Purpose Givings */}
                    {(() => {
                      const rawList = purposeGivings[expandedPurpose] || [];
                      const isLoading = loadingPurpose === expandedPurpose;
                      const filteredList = rawList.filter((g) => {
                        if (!purposeSearchQuery.trim()) return true;
                        const q = purposeSearchQuery.toLowerCase();
                        return (
                          g.donor_name.toLowerCase().includes(q) ||
                          (g.receipt_number && g.receipt_number.toLowerCase().includes(q)) ||
                          (g.payment_method && g.payment_method.toLowerCase().includes(q))
                        );
                      });

                      const purposeTotal = filteredList.reduce(
                        (acc, g) => acc + Number(g.amount || 0),
                        0
                      );

                      return (
                        <>
                          {/* Mobile View */}
                          <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-table-scrollbar">
                            {isLoading ? (
                              <div className="py-12 text-center text-sm text-[#617068] bg-white rounded-xl p-4 border border-[#dfdbd1]">
                                Loading givings for {expandedPurpose}...
                              </div>
                            ) : filteredList.length === 0 ? (
                              <div className="py-12 text-center text-sm text-[#617068] bg-white rounded-xl p-4 border border-[#dfdbd1]">
                                No individual givings found for {expandedPurpose} in this period.
                              </div>
                            ) : (
                              filteredList.map((g) => (
                                <div key={g.id} className="rounded-xl bg-[#faf7f2] p-3.5 border border-[#dfdbd1] text-xs space-y-2">
                                  <div className="flex items-center justify-between font-semibold">
                                    <span className="text-[#26352f] text-sm">{g.donor_name}</span>
                                    <span className="text-[#5f8067] font-bold text-sm">
                                      {money(g.amount)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-[#617068]">
                                    <span>{g.received_at ? new Date(g.received_at).toLocaleDateString() : "—"} · {g.payment_method}</span>
                                    <span>Receipt: {g.receipt_number || "—"}</span>
                                  </div>
                                  <div className="flex items-center justify-between pt-2 border-t border-[#eeeae2]">
                                    <div>
                                      {g.receipt_sent_at ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3d7146]">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Receipt sent
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                          Receipt pending
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {(g.giver_phone || g.giver_email) && (
                                        <button
                                          type="button"
                                          onClick={() => setContactModalGiver(g)}
                                          className="rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee]"
                                        >
                                          Contact
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleResendReceipt(g)}
                                        disabled={resendingId === g.id}
                                        className="rounded-lg bg-[#b36b3c] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#96552e] disabled:opacity-60"
                                      >
                                        {resendingId === g.id ? "Sending..." : "Resend"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Desktop View */}
                          <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-table-scrollbar">
                            <table className="w-full text-left text-sm">
                              <thead className="sticky top-0 z-10 bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068] shadow-sm">
                                <tr>
                                  <th className="px-4 py-3 text-left w-12">#</th>
                                  <th className="px-4 py-3">Date</th>
                                  <th className="px-4 py-3">Giver</th>
                                  <th className="px-4 py-3">Mode</th>
                                  <th className="px-4 py-3">Receipt</th>
                                  <th className="px-4 py-3 text-right">Amount</th>
                                  <th className="px-4 py-3">Status</th>
                                  <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#eeeae2]">
                                {isLoading ? (
                                  <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-[#617068]">
                                      Loading givings for {expandedPurpose}...
                                    </td>
                                  </tr>
                                ) : filteredList.length === 0 ? (
                                  <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-[#617068]">
                                      No individual givings found for {expandedPurpose} in this period.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredList.map((g, gIdx) => (
                                    <tr key={g.id} className="hover:bg-[#faf7f2]">
                                      <td className="px-4 py-3 text-xs font-semibold font-mono text-[#617068]">{gIdx + 1}</td>
                                      <td className="px-4 py-3 text-xs text-[#617068]">
                                        {g.received_at ? new Date(g.received_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                      </td>
                                      <td className="px-4 py-3 font-semibold text-[#26352f]">{g.donor_name}</td>
                                      <td className="px-4 py-3">
                                        <span className="rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-xs font-semibold text-[#5f8067]">
                                          {g.payment_method}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-xs text-[#617068]">{g.receipt_number || "—"}</td>
                                      <td className="px-4 py-3 text-right font-semibold text-[#26352f]">
                                        {money(g.amount)}
                                      </td>
                                      <td className="px-4 py-3">
                                        {g.receipt_sent_at ? (
                                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#3d7146]">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Sent
                                          </span>
                                        ) : (
                                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                            Pending
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          {(g.giver_phone || g.giver_email) && (
                                            <button
                                              type="button"
                                              onClick={() => setContactModalGiver(g)}
                                              className="rounded-lg border border-[#c9c5bb] px-2.5 py-1 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee]"
                                            >
                                              Contact
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleResendReceipt(g)}
                                            disabled={resendingId === g.id}
                                            className="rounded-lg bg-[#b36b3c] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#96552e] disabled:opacity-60"
                                          >
                                            {resendingId === g.id ? "Sending..." : "Resend"}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Sticky Footer for Dedicated Purpose View */}
                          <div className="shrink-0 sticky bottom-[58px] md:bottom-0 md:static z-30 border-t-2 border-[#c9c5bb] bg-[#f7f4ee] font-bold text-[#26352f] overflow-x-auto custom-table-scrollbar shadow-lg md:shadow-none">
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                              <div className="flex items-center gap-4 text-xs sm:text-sm">
                                <span className="text-xs text-[#617068]">
                                  Showing <strong className="text-[#26352f]">{filteredList.length}</strong> of <strong className="text-[#26352f]">{rawList.length}</strong> entries
                                </span>
                                <span className="font-bold text-[#26352f]">
                                  {expandedPurpose} Total: <span className="text-[#b36b3c]">{money(purposeTotal)}</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIsModalOpen(true)}
                                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b36b3c] px-3 sm:px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#96552e] whitespace-nowrap"
                                >
                                  <Plus className="h-4 w-4" />
                                  <span>Add Receipt</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBackendPdf(true, expandedPurpose)}
                                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 sm:px-3.5 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition shadow-sm whitespace-nowrap"
                                >
                                  <Printer className="h-4 w-4 text-[#b36b3c]" />
                                  <span>PDF Report</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleExportSpreadsheet}
                                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-[#26352f] px-3 sm:px-3.5 text-xs font-semibold text-white hover:bg-[#1e2a25] transition shadow-sm whitespace-nowrap"
                                >
                                  <FileSpreadsheet className="h-4 w-4 text-[#88b393]" />
                                  <span>Spreadsheet</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* CLEAN UN-NESTED SUMMARY BREAKDOWN TABLE VIEW */
                  <>
                    {/* Mobile Cards View (visible on md:hidden) */}
                    <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-table-scrollbar">
                      {displayedRows.length === 0 ? (
                        <div className="py-12 text-center text-sm text-[#617068] bg-white rounded-xl p-4 border border-[#dfdbd1]">
                          No contributions recorded for the selected date range ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}).
                        </div>
                      ) : (
                        displayedRows.map((row, idx) => (
                          <div
                            key={row.purpose}
                            onClick={() => toggleExpandPurpose(row.purpose)}
                            className="group cursor-pointer rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-3 transition hover:border-[#b36b3c]"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-[#eeeae2] pb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-[#617068]">#{idx + 1}</span>
                                <h3 className="font-bold text-sm text-[#26352f] group-hover:text-[#b36b3c] transition">{row.purpose}</h3>
                              </div>
                              <span className="font-bold text-sm text-[#b36b3c] bg-[#faf7f2] px-2.5 py-1 rounded-lg border border-[#dfdbd1]">
                                {money(row.total)}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-xs text-[#617068]">
                              <div>M-Pesa: <strong className="text-[#26352f]">{Number(row.mpesa) > 0 ? money(row.mpesa) : "—"}</strong></div>
                              <div>Bank-to-Bank: <strong className="text-[#26352f]">{Number(row.bank_transfer) > 0 ? money(row.bank_transfer) : "—"}</strong></div>
                              <div>Cheque: <strong className="text-[#26352f]">{Number(row.cheque) > 0 ? money(row.cheque) : "—"}</strong></div>
                              <div>Cash: <strong className="text-[#3d7146]">{Number(row.cash) > 0 ? money(row.cash) : "—"}</strong></div>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-[#b36b3c] pt-1">
                              <span>View individual givings →</span>
                              <ChevronRight className="h-4 w-4 text-[#b36b3c] group-hover:translate-x-0.5 transition" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Desktop Table View (visible on md and up) */}
                    <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-table-scrollbar">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068] shadow-sm">
                          <tr>
                            <th className="px-4 py-3 text-left w-12">#</th>
                            <th className="px-4 py-3 w-56 shrink-0">Purpose</th>
                            <th className="px-4 py-3 text-right">M-Pesa</th>
                            <th className="px-4 py-3 text-right">Bank-to-Bank</th>
                            <th className="px-4 py-3 text-right">Cheque</th>
                            <th className="px-4 py-3 text-right">Cash</th>
                            <th className="px-4 py-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eeeae2]">
                          {displayedRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-[#617068]">
                                No contributions recorded for the selected date range ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}).
                              </td>
                            </tr>
                          ) : (
                            displayedRows.map((row, idx) => (
                              <tr
                                key={row.purpose}
                                onClick={() => toggleExpandPurpose(row.purpose)}
                                className="group cursor-pointer hover:bg-[#faf7f2] transition"
                              >
                                <td className="px-4 py-3.5 text-xs font-semibold text-[#617068] font-mono">
                                  {idx + 1}
                                </td>
                                <td className="px-4 py-3.5 font-medium text-[#26352f] w-56 shrink-0 truncate">
                                  <div className="flex items-center justify-between gap-2 pr-2">
                                    <span className="font-semibold text-[#26352f] group-hover:text-[#b36b3c] transition">{row.purpose}</span>
                                    <ChevronRight className="h-4 w-4 text-[#617068] group-hover:text-[#b36b3c] group-hover:translate-x-0.5 transition shrink-0" />
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-right text-[#617068]">{Number(row.mpesa) > 0 ? money(row.mpesa) : "—"}</td>
                                <td className="px-4 py-3.5 text-right text-[#617068]">{Number(row.bank_transfer) > 0 ? money(row.bank_transfer) : "—"}</td>
                                <td className="px-4 py-3.5 text-right text-[#617068]">{Number(row.cheque) > 0 ? money(row.cheque) : "—"}</td>
                                <td className="px-4 py-3.5 text-right font-semibold text-[#3d7146]">{Number(row.cash) > 0 ? money(row.cash) : "—"}</td>
                                <td className="px-4 py-3.5 text-right font-bold text-[#26352f]">{money(row.total)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Fixed Totals Footer at the bottom of the card with Print Report & Spreadsheet buttons */}
                    <div className="shrink-0 sticky bottom-[58px] md:bottom-0 md:static z-30 border-t-2 border-[#c9c5bb] bg-[#f7f4ee] font-bold text-[#26352f] overflow-x-auto custom-table-scrollbar shadow-lg md:shadow-none">
                      <table className="w-full text-left text-sm">
                        <tfoot>
                          <tr>
                            <td className="px-4 py-2.5 text-xs text-[#617068] font-mono w-12">#</td>
                            <td className="px-4 py-2.5 text-base w-56 shrink-0">Total</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.mpesa)}</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.bank_transfer)}</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.cheque)}</td>
                            <td className="px-4 py-2.5 text-right text-[#3d7146]">{money(totals.cash)}</td>
                            <td className="px-4 py-2.5 text-right text-base text-[#b36b3c]">{money(totals.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-[#dfdbd1]">
                        <span className="text-xs font-semibold text-[#617068]">
                          Total Rows Available: <strong className="text-[#26352f]">{displayedRows.length}</strong>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsModalOpen(true)}
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b36b3c] px-3 sm:px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#96552e] whitespace-nowrap"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Add Receipt</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadBackendPdf(false)}
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 sm:px-3.5 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition shadow-sm whitespace-nowrap"
                          >
                            <Printer className="h-4 w-4 text-[#b36b3c]" />
                            <span>PDF Report</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleExportSpreadsheet}
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-[#26352f] px-3 sm:px-3.5 text-xs font-semibold text-white hover:bg-[#1e2a25] transition shadow-sm whitespace-nowrap"
                          >
                            <FileSpreadsheet className="h-4 w-4 text-[#88b393]" />
                            <span>Spreadsheet</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )
              ) : (
                
                /* VIEW 2: INDIVIDUAL MEMBER GIVINGS TABLE VIEW */
                <>
                  {(() => {
                    const listToDisplay = allGivingsList;
                    const isLoading = loadingAllGivings;
                    const displayTotal = listToDisplay.reduce((acc, g) => acc + Number(g.amount || 0), 0);

                    return (
                      <>
                        {/* Mobile Cards View (visible on md:hidden) */}
                        <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-table-scrollbar">
                          {isLoading ? (
                            <div className="py-12 text-center text-sm text-[#617068] bg-white rounded-xl p-4 border border-[#dfdbd1]">
                              Loading member givings...
                            </div>
                          ) : listToDisplay.length === 0 ? (
                            <div className="py-12 text-center text-sm text-[#617068] bg-white rounded-xl p-4 border border-[#dfdbd1]">
                              No individual member givings recorded for the selected date range.
                            </div>
                          ) : (
                            listToDisplay.map((giving, idx) => (
                              <div key={giving.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between gap-2 border-b border-[#eeeae2] pb-2">
                                  <div>
                                    <div className="font-bold text-sm text-[#26352f]">{giving.donor_name}</div>
                                    <div className="text-[11px] text-[#617068]">
                                      {giving.received_at ? new Date(giving.received_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-sm text-[#5f8067]">
                                      {money(giving.amount || 0)}
                                    </div>
                                    <span className="inline-block rounded-full bg-[#eef2ed] px-2 py-0.5 text-[10px] font-semibold text-[#5f8067]">
                                      {giving.payment_method}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="rounded-lg bg-[#faf7f2] border border-[#dfdbd1] px-2 py-0.5 text-xs font-semibold text-[#b36b3c]">
                                    {giving.purpose}
                                  </span>
                                  <span className="font-mono text-[11px] text-[#617068]">Receipt: {giving.receipt_number || "N/A"}</span>
                                </div>

                                {giving.item_description && (
                                  <p className="text-xs text-[#617068] italic bg-[#faf7f2] p-2 rounded-lg border border-[#dfdbd1]">
                                    Description: {giving.item_description}
                                  </p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#eeeae2]">
                                  <span className={`text-[11px] font-semibold ${giving.receipt_sent_at ? "text-[#5f8067]" : "text-[#b36b3c]"}`}>
                                    {giving.receipt_sent_at ? "Receipt sent" : "Receipt pending"}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {(giving.giver_phone || giving.giver_email) && (
                                      <button
                                        type="button"
                                        onClick={() => setContactModalGiver(giving)}
                                        className="rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee]"
                                      >
                                        Contact
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleResendReceipt(giving)}
                                      disabled={resendingId === giving.id}
                                      className="rounded-lg bg-[#b36b3c] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#96552e]"
                                    >
                                      {resendingId === giving.id ? "Sending..." : "Resend Receipt"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* PC Desktop Table View (visible on md and up) */}
                        <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-table-scrollbar">
                          {isLoading ? (
                            <div className="py-16 text-center text-sm text-[#617068]">
                              Loading member givings...
                            </div>
                          ) : listToDisplay.length === 0 ? (
                            <div className="py-16 text-center text-sm text-[#617068]">
                              No individual member givings recorded for the selected date range.
                            </div>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead className="sticky top-0 z-10 bg-[#f7f4ee] font-semibold text-[#617068] uppercase tracking-wider shadow-sm">
                                <tr>
                                  <th className="px-3 py-2.5 w-10">#</th>
                                  <th className="px-3 py-2.5 w-28 whitespace-nowrap">Date</th>
                                  <th className="px-3 py-2.5 w-44 shrink-0">Giver</th>
                                  <th className="px-3 py-2.5 w-44 shrink-0">Purpose</th>
                                  <th className="px-3 py-2.5 w-24">Mode</th>
                                  <th className="px-3 py-2.5 w-32">Receipt</th>
                                  <th className="px-3 py-2.5 text-right w-28">Amount</th>
                                  <th className="px-3 py-2.5 w-24">Status</th>
                                  <th className="px-3 py-2.5 text-center w-20">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#eeeae2] bg-white">
                                {listToDisplay.map((giving, idx) => (
                                  <tr key={giving.id} className="hover:bg-[#fcfbf9]">
                                    <td className="px-3 py-3 text-xs text-[#617068] font-mono font-semibold">{idx + 1}</td>
                                    <td className="px-3 py-3 text-[#617068] whitespace-nowrap">
                                      {giving.received_at
                                        ? new Date(giving.received_at).toLocaleDateString("en-KE", {
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                          })
                                        : "—"}
                                    </td>
                                    <td className="px-3 py-3 w-44 shrink-0 font-semibold text-[#26352f] truncate max-w-[170px]" title={giving.donor_name}>
                                      {giving.donor_name}
                                    </td>
                                    <td className="px-3 py-3 w-44 shrink-0 font-semibold text-[#26352f]">
                                      <span className="inline-block rounded-lg bg-[#faf7f2] border border-[#dfdbd1] px-2 py-0.5 text-xs text-[#b36b3c] truncate max-w-[170px]" title={giving.purpose}>
                                        {giving.purpose}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3">
                                      <span className="inline-block rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-[11px] font-semibold text-[#5f8067]">
                                        {giving.payment_method}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-[#617068] font-mono text-[11px]">
                                      {giving.receipt_number || "—"}
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold text-[#26352f]">
                                      {money(giving.amount)}
                                    </td>
                                    <td className="px-3 py-3">
                                      {giving.receipt_sent_at ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3d7146]">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Receipt sent
                                        </span>
                                      ) : (
                                        <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                          Pending
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <div className="relative inline-block text-left actions-menu-container">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (activeActionMenuId === giving.id) {
                                              setActiveActionMenuId(null);
                                            } else {
                                              // Open upward near the viewport bottom so the
                                              // popup is not hidden behind the footer buttons.
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setActionDropUp(window.innerHeight - rect.bottom < 160);
                                              setActiveActionMenuId(giving.id);
                                            }
                                          }}
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition shadow-sm"
                                        >
                                          <span>Actions</span>
                                          <ChevronDown className="h-3.5 w-3.5 text-[#617068]" />
                                        </button>

                                        {activeActionMenuId === giving.id && (
                                          <div
                                            className={`absolute right-0 z-30 w-44 rounded-xl border border-[#dfdbd1] bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in duration-150 ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              disabled={resendingId === giving.id}
                                              onClick={() => {
                                                setActiveActionMenuId(null);
                                                handleResendReceipt(giving);
                                              }}
                                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition disabled:opacity-50"
                                            >
                                              {resendingId === giving.id ? (
                                                <RotateCw className="h-3.5 w-3.5 animate-spin text-[#b36b3c]" />
                                              ) : (
                                                <Send className="h-3.5 w-3.5 text-[#b36b3c]" />
                                              )}
                                              <span>Resend Receipt</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveActionMenuId(null);
                                                setContactModalGiver(giving);
                                              }}
                                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-[#5f8067] hover:bg-[#eef2ed] transition"
                                            >
                                              <Phone className="h-3.5 w-3.5 text-[#5f8067]" />
                                              <span>Contact Giver</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Fixed Child Table Footer */}
                        <div className="shrink-0 sticky bottom-[58px] md:bottom-0 md:static z-30 border-t-2 border-[#c9c5bb] bg-[#f7f4ee] px-4 py-2.5 font-semibold text-xs text-[#26352f] flex flex-wrap items-center justify-between gap-3 shadow-lg md:shadow-none">
                          <span className="text-[#617068]">
                            Total Rows Available: <strong className="text-[#26352f]">{listToDisplay.length}</strong> • <span className="font-bold text-[#b36b3c]">KES {money(displayTotal)}</span>
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsModalOpen(true)}
                              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#b36b3c] px-3 sm:px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#96552e] whitespace-nowrap"
                            >
                              <Plus className="h-4 w-4" />
                              <span>Add Receipt</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadBackendPdf(true)}
                              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 sm:px-3.5 text-xs font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition shadow-sm whitespace-nowrap"
                            >
                              <Printer className="h-4 w-4 text-[#b36b3c]" />
                              <span>PDF Report</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleExportSpreadsheet}
                              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-[#26352f] px-3 sm:px-3.5 text-xs font-semibold text-white hover:bg-[#1e2a25] transition shadow-sm whitespace-nowrap"
                            >
                              <FileSpreadsheet className="h-4 w-4 text-[#88b393]" />
                              <span>Spreadsheet</span>
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Contact Giver Quick Action Modal */}
      {contactModalGiver && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setContactModalGiver(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-[#dfdbd1]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[#26352f]">Contact Giver</h3>
                <p className="text-xs text-[#617068] mt-0.5">{contactModalGiver.donor_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setContactModalGiver(null)}
                className="rounded-lg p-1 text-[#617068] hover:bg-[#f7f4ee]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl bg-[#f7f4ee] p-3 text-xs space-y-1">
                <p className="font-semibold text-[#26352f]">{contactModalGiver.purpose}</p>
                <p className="text-[#617068]">Amount: <span className="font-bold text-[#26352f]">{money(contactModalGiver.amount)}</span></p>
                <p className="text-[#617068]">Ref: {contactModalGiver.receipt_number}</p>
              </div>

              {contactModalGiver.giver_phone ? (
                <div className="grid gap-2 pt-2">
                  <a
                    href={`tel:${contactModalGiver.giver_phone}`}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#5f8067] py-2.5 text-sm font-semibold text-white hover:bg-[#4d6d55] transition"
                  >
                    <Phone className="h-4 w-4" />
                    <span>Call ({contactModalGiver.giver_phone})</span>
                  </a>
                  <a
                    href={`sms:${contactModalGiver.giver_phone}`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-[#c9c5bb] py-2.5 text-sm font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition"
                  >
                    <MessageSquare className="h-4 w-4 text-[#b36b3c]" />
                    <span>Send SMS</span>
                  </a>
                </div>
              ) : (
                <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl">
                  No phone number recorded for this giver.
                </p>
              )}

              {contactModalGiver.giver_email ? (
                <a
                  href={`mailto:${contactModalGiver.giver_email}?subject=Giving%20Receipt%20-%20${encodeURIComponent(contactModalGiver.purpose)}`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#c9c5bb] py-2.5 text-sm font-semibold text-[#26352f] hover:bg-[#f7f4ee] transition"
                >
                  <Mail className="h-4 w-4 text-[#b36b3c]" />
                  <span>Email ({contactModalGiver.giver_email})</span>
                </a>
              ) : (
                <p className="text-xs text-[#617068] bg-[#f7f4ee] p-3 rounded-xl">
                  No email address recorded for this giver.
                </p>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-[#dfdbd1]">
              <button
                type="button"
                onClick={() => setContactModalGiver(null)}
                className="w-full rounded-xl border border-[#c9c5bb] py-2 text-xs font-semibold text-[#617068] hover:bg-[#f7f4ee]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Receipt Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl ring-1 ring-[#dfdbd1]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#dfdbd1] pb-4">
              <div>
                <h2 className="text-xl font-semibold text-[#26352f]">Add Receipt</h2>
                <p className="mt-0.5 text-xs text-[#617068]">Record a manual payment or contribution for treasury reconciliation.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-[#617068] hover:bg-[#f7f4ee] hover:text-[#26352f]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={addCash} className="mt-4 grid gap-4 sm:grid-cols-2">
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
                <select
                  required
                  value={cashForm.purpose}
                  onChange={(e) => setCashForm({ ...cashForm, purpose: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
                >
                  {purposes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              {cashForm.purpose === "Other" && (
                <label className="text-sm font-medium text-[#26352f]">
                  Specify Purpose
                  <input
                    required
                    placeholder="Enter custom purpose..."
                    value={customPurpose}
                    onChange={(e) => setCustomPurpose(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
                  />
                </label>
              )}

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

              {/* Conditional Giver details based on Receipt Type */}
              {(
                <>
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

                  <div className="rounded-xl bg-[#f4f7f4] px-3 py-2 text-xs text-[#617068]">
                    <p className="font-semibold text-[#26352f]">Send receipt through</p>
                    <div className="mt-2 flex gap-5">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Email</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} /> SMS</label>
                    </div>
                    <p className="mt-1">SMS will report that only email was sent until an SMS gateway is configured.</p>
                  </div>
                </>
              )}

              {false && (
                <label className="text-sm font-medium text-[#26352f] sm:col-span-2">
                  Collection Name / Title
                  <input
                    required
                    value={cashForm.donor_name}
                    onChange={(e) => setCashForm({ ...cashForm, donor_name: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2 text-sm outline-none focus:border-[#b36b3c]"
                    placeholder="e.g. Sabbath School Offertory, Main Service Collection"
                  />
                </label>
              )}

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
                  onClick={() => setIsModalOpen(false)}
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
      )}
    </main>
  );
}
