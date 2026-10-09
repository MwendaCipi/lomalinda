"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Fragment, useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Plus, RefreshCw, RotateCw, Phone, Mail, MessageSquare, Send, CheckCircle2, Printer, FileSpreadsheet, ArrowLeft, Download, Loader2, X } from "lucide-react";
import { AddReceiptModal } from "@/components/add-receipt-modal";
import { ContactModal } from "@/components/contact-modal";
import { TreasuryNav } from "@/components/treasury-nav";
import { DateField } from "@/components/date-field";
import { usePageHeader } from "@/components/app-frame";
import { showAlert } from "@/lib/alerts";
import { localDate, firstDayOfMonth, dayFirst, dayFirstTime } from "@/lib/dates";
import { densityCellPad } from "@/lib/table-density";
import Swal from "sweetalert2";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const financeRoles = ["treasurer", "admin"];
const money = (amount: string | number) => Number(amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/**
 * A finished report, held for the desk to look at before it decides to save
 * it — sometimes one wants to read the document first. The PDF is drawn as
 * itself; a spreadsheet is shown as the rows it carries, because a browser
 * has no page on which to render a workbook.
 */
type ReportPreview = {
  kind: "pdf" | "spreadsheet";
  title: string;
  filename: string;
  range: string;
  url: string;
  grid: string[][];
};

export default function ReconciliationPage() {
  // The ledger reads the month so far: the 1st, not the first Sabbath — a
  // from-date of the 3rd had the treasurer asking why receipts had vanished.
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(localDate);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashReceipts, setCashReceipts] = useState<CashReceipt[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "denied">("loading");
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  const router = useRouter();

  useEffect(() => {
    if (modeParam === "summary") {
      setViewMode("summary");
    } else if (modeParam === "all_givings") {
      setViewMode("all_givings");
    }
  }, [modeParam]);

  const { setHeaderRightAction, setCustomToggles, setCustomHeader } = usePageHeader();
  const [searchQuery, setSearchQuery] = useState("");
  // Pulling the paybill's transactions from Safaricom: manual "send money to
  // paybill" gifts land in the ledger without anyone typing them. Idempotent
  // on the server, so a double-press records nothing twice.
  const [pulling, setPulling] = useState(false);
  // A report is generated on demand, so the desk is told the document is being
  // prepared rather than left staring at an unchanged screen; the finished
  // document opens in the preview below — viewed first, downloaded from there.
  const [preparing, setPreparing] = useState<null | "pdf" | "spreadsheet">(null);
  const [preview, setPreview] = useState<ReportPreview | null>(null);

  // Purpose Expansion & View Mode State
  const [expandedPurpose, setExpandedPurpose] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"summary" | "all_givings">("all_givings");
  const [allGivingsList, setAllGivingsList] = useState<IndividualGiving[]>([]);
  const [loadingAllGivings, setLoadingAllGivings] = useState(false);
  const [purposeGivings, setPurposeGivings] = useState<Record<string, IndividualGiving[]>>({});
  const [loadingPurpose, setLoadingPurpose] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  // The desk-wide compact-rows preference, shared with the other tables.
  const rowPad = densityCellPad();
  const [contactModalGiver, setContactModalGiver] = useState<IndividualGiving | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [actionDropUp, setActionDropUp] = useState(false);

  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` }), []);

  const loadAllGivings = useCallback(async (fDate = fromDate, tDate = toDate) => {
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
  }, [fromDate, toDate, headers]);

  // Position search bar and date range pickers to the RIGHT of the page header title & description
  useEffect(() => {
    setHeaderRightAction(
      <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search giver, receipt, mode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
          />
        </div>
        <button
          type="button"
          onClick={pullMpesaTransactions}
          disabled={pulling}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-ember px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60"
          title="Record any manual paybill gifts Safaricom has received that are not yet in the ledger (last 48 hours — all the Pull API keeps)."
        >
          <RefreshCw className={`h-3.5 w-3.5 ${pulling ? "animate-spin" : ""}`} aria-hidden="true" />
          {pulling ? "Pulling…" : "Pull M-Pesa"}
        </button>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
          <label className="text-xs font-medium text-moss flex items-center gap-1">
            <span>From</span>
            <DateField value={fromDate} onChange={changeFromDate} label="Ledger from date" />
          </label>
          <label className="text-xs font-medium text-moss flex items-center gap-1">
            <span>To</span>
            <DateField value={toDate} onChange={changeToDate} label="Ledger to date" />
          </label>
        </div>
      </div>
    );
  }, [setHeaderRightAction, searchQuery, pulling, fromDate, toDate]);

  // The treasury's views, as one line. The ledger owns Individual Givings and
  // Summary in place; the other three walk to the accounts desk, which is
  // where those views live. The shell's header band draws it — one strip for
  // the whole treasury, never a second row under this page's own header.
  useEffect(() => {
    setCustomToggles(
      <TreasuryNav
        active={viewMode === "summary" ? "summary" : "givings"}
        onSelect={(view) => {
          if (view === "givings") {
            setExpandedPurpose(null);
            setViewMode("all_givings");
            loadAllGivings();
          } else if (view === "summary") {
            setViewMode("summary");
          } else if (view === "unassigned") {
            router.push("/administration?tab=accounts&view=unassigned");
          } else if (view === "accounts") {
            router.push("/administration?tab=accounts&view=accounts");
          } else if (view === "drives") {
            router.push("/administration/fund-drives");
          } else if (view === "expenses") {
            router.push("/administration?tab=accounts&view=expenditure");
          } else {
            router.push("/administration?tab=accounts&view=withdrawals");
          }
        }}
      />
    );
  }, [setCustomToggles, viewMode, loadAllGivings, router]);

  // This desk answers two of the treasury's six views under one route, and
  // the rail row that led here is named "Contributions Ledger" — which is the
  // ledger's own name, not the view's. Naming the active view keeps the
  // heading honest, so pressing Individual Givings does not leave the page
  // titled after the ledger it sits in.
  useEffect(() => {
    setCustomHeader(
      viewMode === "summary"
        ? { label: "Summary Contributions", description: "Each purpose's giving, totalled by how it came in." }
        : { label: "Individual Givings", description: "Every contribution line by line, with its giver, mode and receipt." }
    );
    return () => setCustomHeader(null);
  }, [setCustomHeader, viewMode]);

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

  // Escape closes the document preview, the way the desk's other overlays
  // close — the report was only being looked at.
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.URL.revokeObjectURL(preview.url);
        setPreview(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  // After the shared Add Receipt modal saves, refresh the ledgers and show
  // the honest delivery feedback line (same banner as before the extraction).
  async function handleReceiptSaved(deliveryMessage: string, receipt: { received_on: string }) {
    let nextFrom = fromDate;
    let nextTo = toDate;
    if (receipt.received_on) {
      if (receipt.received_on < nextFrom) nextFrom = receipt.received_on;
      if (receipt.received_on > nextTo) nextTo = receipt.received_on;
    }
    if (nextFrom !== fromDate) setFromDate(nextFrom);
    if (nextTo !== toDate) setToDate(nextTo);
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
    // Set after load(): load() clears the banner first, so setting before the
    // reloads batched both updates and the delivery feedback never rendered.
    setMessage(deliveryMessage);
  }

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

  // The window every report on this page is cut to — and the one the preview
  // is named with, so a document opened for the 8th to the 9th says so.
  const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;

  // Pull the paybill's transactions from Safaricom, so a manual "send money to
  // paybill" gift lands in the ledger without anyone typing it. The server is
  // idempotent by receipt number, so a double-press records nothing twice —
  // and the Pull API keeps only 48 hours of transactions, which is the whole
  // window it will read, so that is what is asked for.
  async function pullMpesaTransactions() {
    setPulling(true);
    try {
      const res = await fetch(`${API_URL}/api/members/payments/mpesa/pull/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ days: 2 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A dialog, not the banner: the pull's answer is the whole point of
        // the press, and Safaricom's own sentences (an unregistered shortcode,
        // a bad credential) name the fix — the treasurer should not have to
        // spot a line of text under a long ledger.
        await showAlert(
          "M-Pesa pull failed",
          data.detail || "Could not reach M-Pesa. Please try again.",
          "error"
        );
        return;
      }
      // load() clears the banner first, so the ledger is reloaded before the
      // finding is written — otherwise the pull's own answer is wiped by the
      // reload it triggers. A dialog outlives that reload.
      await load(fromDate, toDate);
      if (data.detail) {
        await showAlert("M-Pesa pull", data.detail, "warning");
      } else if (data.recorded > 0) {
        await showAlert(
          "M-Pesa pull complete",
          `Pulled ${data.pulled} M-Pesa payment(s) from the last 48 hours; ${data.recorded} new gift(s) recorded.`,
          "success"
        );
      } else {
        await showAlert(
          "M-Pesa pull complete",
          `Pulled ${data.pulled} M-Pesa payment(s) from the last 48 hours; nothing new to record.`,
          "info"
        );
      }
    } catch {
      await showAlert("M-Pesa pull failed", "Could not reach M-Pesa. Please try again.", "error");
    } finally {
      setPulling(false);
    }
  }

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
    if (preparing) return;
    setPreparing("pdf");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      // The report is cut to the dates on screen — always both ends of the
      // selected range, never the month the range happens to sit in.
      const params = new URLSearchParams();
      if (fromDate) params.append("start_date", fromDate);
      if (toDate) params.append("end_date", toDate);
      if (includeIndividual) params.append("include_individual", "true");
      if (purposeName) params.append("purpose", purposeName);

      const pdfUrl = `${API_URL}/api/members/reports/reconciliation/pdf/?${params.toString()}`;
      const res = await fetch(pdfUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        window.print();
        return;
      }
      const blob = await res.blob();
      const tag = purposeName ? `_${purposeName.replace(/[^\w-]+/g, "_")}` : "";
      setPreview({
        kind: "pdf",
        title: purposeName ? `Reconciliation — ${purposeName}` : "Financial Reconciliation report",
        filename: `Financial_Reconciliation${tag}_${fromDate || "all"}_to_${toDate || "all"}.pdf`,
        range: rangeLabel,
        url: window.URL.createObjectURL(blob),
        grid: [],
      });
    } catch {
      window.print();
    } finally {
      setPreparing(null);
    }
  };

  const handleResendReceipt = async (giving: IndividualGiving) => {
    // One dialog for every resend: pick the channel — email, SMS, or both,
    // both on by default. A receipt saved without the giver's address — a
    // desk entry, or a paybill payment Safaricom reported with an obfuscated
    // number that matched no account — also asks for it here, so the desk can
    // finish a receipt that would otherwise be stuck at "pending" forever.
    const needsEmail = !giving.giver_email;
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const result = await showAlert("Resend receipt", "", "question", {
      html: `
        <div style="text-align:left;font-size:14px">
          <p style="margin:0 0 12px">Send the receipt for <b>${escape(giving.donor_name)}</b> (KES ${money(giving.amount)}) to:</p>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
            <input type="checkbox" id="resend-channel-email" checked style="width:16px;height:16px" /> Email
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="resend-channel-sms" checked style="width:16px;height:16px" /> SMS
          </label>
          ${needsEmail ? '<input id="resend-email-value" class="swal2-input" style="margin-top:14px" placeholder="name@example.com" />' : ""}
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Send receipt",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const useEmail = !!(document.getElementById("resend-channel-email") as HTMLInputElement | null)?.checked;
        const useSms = !!(document.getElementById("resend-channel-sms") as HTMLInputElement | null)?.checked;
        if (!useEmail && !useSms) {
          Swal.showValidationMessage("Select email, SMS, or both.");
          return false;
        }
        const typedEmail = needsEmail
          ? ((document.getElementById("resend-email-value") as HTMLInputElement | null)?.value || "").trim()
          : "";
        if (useEmail && needsEmail) {
          if (!typedEmail) {
            Swal.showValidationMessage("This giver has no email on file — enter one to send by email.");
            return false;
          }
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(typedEmail)) {
            Swal.showValidationMessage("Enter a valid email address.");
            return false;
          }
        }
        return {
          channels: [...(useEmail ? ["email"] : []), ...(useSms ? ["sms"] : [])],
          email: typedEmail,
        };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    const { channels, email: suppliedEmail } = result.value as { channels: string[]; email: string };

    setResendingId(giving.id);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/resend-receipt/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          source: giving.source,
          id: giving.raw_id,
          channels,
          ...(suppliedEmail ? { email: suppliedEmail } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not resend receipt", data.detail || "The receipt could not be resent.", "error");
        return;
      }
      if (data.sent) {
        showAlert("Receipt sent", data.detail || "Receipt resent successfully.", "success");
        setMessage("");
        const nowStr = data.receipt_sent_at || new Date().toISOString();
        // The address supplied for an addressless receipt is now on the row.
        const patch = { receipt_sent_at: nowStr, ...(suppliedEmail ? { giver_email: suppliedEmail } : {}) };
        setPurposeGivings((prev) => {
          const currentList = prev[giving.purpose] || [];
          const updated = currentList.map((g) => (g.id === giving.id ? { ...g, ...patch } : g));
          return { ...prev, [giving.purpose]: updated };
        });
        setAllGivingsList((prev) => prev.map((g) => (g.id === giving.id ? { ...g, ...patch } : g)));
      } else {
        showAlert("Receipt not sent", data.detail || "Nothing was sent.", "warning");
      }
    } catch {
      showAlert("Could not resend receipt", "Network error. Please try again.", "error");
    } finally {
      setResendingId(null);
    }
  };


  if (status === "loading") return <main className="min-h-screen bg-sand p-10 text-center text-moss">Loading reconciliation workspace…</main>;
  if (status === "denied") return <main className="min-h-screen bg-sand p-10"><div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold text-bark">Finance access required</h1><p className="mt-3 text-moss">This workspace is available to treasurers, finance managers, church leaders, and administrators.</p><Link href="/administration" className="mt-6 inline-block font-semibold text-ember">Back to administration</Link></div></main>;

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

  /** The summary as the rows the workbook carries: what the preview shows
   *  and what the CSV fallback writes, both for the selected range only. */
  const summaryGrid = (): string[][] => {
    const head = ["#", "Giving Purpose", "M-Pesa (KES)", "Bank-to-Bank (KES)", "Cheque (KES)", "Cash (KES)", "Total (KES)"];
    const rows = displayedRows.map((row, idx) => [
      String(idx + 1),
      `"${row.purpose.replace(/"/g, '""')}"`,
      String(row.mpesa),
      String(row.bank_transfer),
      String(row.cheque),
      String(row.cash),
      String(row.total),
    ]);
    const totalRow = ["TOTAL", `"All Accounts"`, String(totals.mpesa), String(totals.bank_transfer), String(totals.cheque), String(totals.cash), String(totals.total)];
    return [head, ...rows, totalRow];
  };

  const csvOf = (grid: string[][]) => new Blob([grid.map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });

  const handleExportSpreadsheet = async () => {
    if (preparing) return;
    setPreparing("spreadsheet");
    try {
      if (viewMode === "all_givings") {
        // Client-side CSV for individual givings — the rows the ledger loaded
        // for the selected range, previewed before they are saved.
        const head = ["#", "Date", "Giver Name", "Giving Purpose", "Contact", "Payment Method", "Receipt Number", "Notes", "Amount (KES)"];
        const rows = allGivingsList.map((g, idx) => [
          String(idx + 1),
          `"${(g.received_at || "").replace(/"/g, '""')}"`,
          `"${(g.donor_name || "Anonymous").replace(/"/g, '""')}"`,
          `"${(g.purpose || "").replace(/"/g, '""')}"`,
          `"${(g.giver_phone || g.giver_email || "").replace(/"/g, '""')}"`,
          `"${(g.payment_method || g.giving_type || "").replace(/"/g, '""')}"`,
          `"${(g.receipt_number || "").replace(/"/g, '""')}"`,
          `"${(g.item_description || "").replace(/"/g, '""')}"`,
          String(g.amount || 0),
        ]);
        const totalAmt = allGivingsList.reduce((acc, g) => acc + Number(g.amount || 0), 0);
        const grid = [head, ...rows, ["TOTAL", "", `"All Givings"`, "", "", "", "", "", String(totalAmt)]];
        setPreview({
          kind: "spreadsheet",
          title: "Individual givings",
          filename: `individual_givings_${fromDate}_to_${toDate}.csv`,
          range: rangeLabel,
          url: window.URL.createObjectURL(csvOf(grid)),
          grid,
        });
        return;
      }

      // Summary view: the NEKF workbook from the backend, cut to the same
      // dates the ledger on screen is showing.
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const params = new URLSearchParams();
      if (fromDate) params.append("start_date", fromDate);
      if (toDate) params.append("end_date", toDate);
      const res = await fetch(`${API_URL}/api/members/reports/reconciliation/spreadsheet/?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const blob = await res.blob();
        setPreview({
          kind: "spreadsheet",
          title: "NEKF cash count & offering report",
          filename: `NEKF_Report_${fromDate || "all"}_to_${toDate || "all"}.xlsx`,
          range: rangeLabel,
          url: window.URL.createObjectURL(blob),
          grid: summaryGrid(),
        });
        return;
      }
      // The workbook could not be made: the same rows, as a CSV instead.
      const grid = summaryGrid();
      setPreview({
        kind: "spreadsheet",
        title: "Reconciliation summary",
        filename: `reconciliation_summary_${fromDate}_to_${toDate}.csv`,
        range: rangeLabel,
        url: window.URL.createObjectURL(csvOf(grid)),
        grid,
      });
    } catch {
      const grid = summaryGrid();
      setPreview({
        kind: "spreadsheet",
        title: "Reconciliation summary",
        filename: `reconciliation_summary_${fromDate}_to_${toDate}.csv`,
        range: rangeLabel,
        url: window.URL.createObjectURL(csvOf(grid)),
        grid,
      });
    } finally {
      setPreparing(null);
    }
  };

  /** Closing the preview lets the object URL go: the desk has either saved
   *  the document by then or decided against it. */
  const closePreview = () => {
    if (preview) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  /** The document, saved — the same bytes that were just on screen. */
  const downloadPreview = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      <div className="flex h-full md:h-full md:overflow-hidden">
        
        {/* SINGLE CARD TOUCHING MARGINS (ZERO MARGIN/PADDING) */}
        <div className="flex-1 min-w-0 p-0 h-full flex flex-col overflow-hidden md:pb-0">
          <div className="w-full h-full flex flex-col rounded-none bg-white px-3 pt-1 pb-3 sm:px-4 sm:pt-1.5 md:pb-4 border-l border-sand-line overflow-hidden">
            
            {message && (
              <p className="shrink-0 mt-2 rounded-xl bg-sand px-4 py-2 text-xs text-moss border border-sand-line">
                {message}
              </p>
            )}

            {/* MAIN CONTENT TABLE CONTAINER (Flex-1, Non-scrollable outer page, scrollable table rows, fixed totals) */}
            <div className="flex-1 min-h-0 flex flex-col mt-1.5 overflow-hidden rounded-xl border border-sand-line bg-white">
              
              {/* VIEW 1: SUMMARY BREAKDOWN TABLE VIEW */}
              {/* VIEW 1: SUMMARY BREAKDOWN TABLE VIEW */}
              {viewMode === "summary" ? (
                expandedPurpose ? (
                  /* DEDICATED INDEPENDENT PURPOSE VIEW */
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
                    {/* Top Header of Dedicated Purpose View */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-sand-line bg-sand-linen shrink-0">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedPurpose(null);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark hover:bg-sand transition shadow-sm"
                        >
                          <ArrowLeft className="h-4 w-4 text-ember" />
                          <span>Back to Summary</span>
                        </button>
                        <div>
                          <h2 className="text-base font-bold text-bark flex items-center gap-2">
                            <span>{expandedPurpose}</span>
                            <span className="rounded-full bg-bark px-2.5 py-0.5 text-xs font-semibold text-white">
                              {loadingPurpose === expandedPurpose
                                ? "Loading..."
                                : `${(purposeGivings[expandedPurpose] || []).filter((g) => {
                                    if (!searchQuery.trim()) return true;
                                    const q = searchQuery.toLowerCase();
                                    return (
                                      g.donor_name.toLowerCase().includes(q) ||
                                      (g.receipt_number && g.receipt_number.toLowerCase().includes(q)) ||
                                      (g.payment_method && g.payment_method.toLowerCase().includes(q))
                                    );
                                  }).length} entries`}
                            </span>
                          </h2>
                          <p className="text-xs text-moss">
                            Individual givings for {expandedPurpose} ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`})
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Main Content Area for Purpose Givings */}
                    {(() => {
                      const rawList = purposeGivings[expandedPurpose] || [];
                      const isLoading = loadingPurpose === expandedPurpose;
                      const filteredList = rawList.filter((g) => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
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
                              <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                                Loading givings for {expandedPurpose}...
                              </div>
                            ) : filteredList.length === 0 ? (
                              <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                                No individual givings found for {expandedPurpose} in this period.
                              </div>
                            ) : (
                              filteredList.map((g) => (
                                <div key={g.id} className="rounded-xl bg-sand-linen p-3.5 border border-sand-line text-xs space-y-2">
                                  <div className="flex items-center justify-between font-semibold">
                                    <span className="text-bark text-sm">{g.donor_name}</span>
                                    <span className="text-sage font-bold text-sm">
                                      {money(g.amount)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-moss">
                                    <span>{dayFirstTime(g.received_at)} · {g.payment_method}</span>
                                    <span>Receipt: {g.receipt_number || "—"}</span>
                                  </div>
                                  <div className="flex items-center justify-between pt-2 border-t border-sand-soft">
                                    <div>
                                      {g.receipt_sent_at ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-strong">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Sent
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                          Failed
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {(g.giver_phone || g.giver_email) && (
                                        <button
                                          type="button"
                                          onClick={() => setContactModalGiver(g)}
                                          className="rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-[11px] font-semibold text-bark hover:bg-sand"
                                        >
                                          Contact
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleResendReceipt(g)}
                                        disabled={resendingId === g.id}
                                        className="rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ember-dark disabled:opacity-60"
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
                              <thead className="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm">
                                <tr>
                                  <th className="px-4 py-3 text-left w-12">#</th>
                                  <th className="px-4 py-3">Date</th>
                                  <th className="px-4 py-3">Giver</th>
                                  <th className="px-4 py-3">Mode</th>
                                  <th className="px-4 py-3">Receipt #</th>
                                  <th className="px-4 py-3">Receipt</th>
                                  <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sand-soft">
                                {isLoading ? (
                                  <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-moss">
                                      Loading givings for {expandedPurpose}...
                                    </td>
                                  </tr>
                                ) : filteredList.length === 0 ? (
                                  <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-moss">
                                      No individual givings found for {expandedPurpose} in this period.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredList.map((g, gIdx) => (
                                    <tr key={g.id} className="hover:bg-sand-linen">
                                      <td className={`px-4 ${rowPad} text-xs font-semibold font-mono text-moss`}>{gIdx + 1}</td>
                                      <td className={`px-4 ${rowPad} text-xs text-moss`}>
                                        {dayFirst(g.received_at)}
                                      </td>
                                      <td className={`px-4 ${rowPad} font-semibold text-bark`}>{g.donor_name}</td>
                                      <td className={`px-4 ${rowPad}`}>
                                        <span className="rounded-full bg-mist-select px-2.5 py-0.5 text-xs font-semibold text-sage">
                                          {g.payment_method}
                                        </span>
                                      </td>
                                      <td className={`px-4 ${rowPad} font-mono text-xs text-moss`}>{g.receipt_number || "—"}</td>
                                      <td className={`px-4 ${rowPad} text-right font-semibold text-bark`}>
                                        {money(g.amount)}
                                      </td>
                                      <td className={`px-4 ${rowPad}`}>
                                        {g.receipt_sent_at ? (
                                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sage-strong">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Sent
                                          </span>
                                        ) : (
                                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                            Failed
                                          </span>
                                        )}
                                      </td>
                                      <td className={`px-4 ${rowPad} text-center`}>
                                        <div className="flex items-center justify-center gap-2">
                                          {(g.giver_phone || g.giver_email) && (
                                            <button
                                              type="button"
                                              onClick={() => setContactModalGiver(g)}
                                              className="rounded-lg border border-sand-mute px-2.5 py-1 text-xs font-semibold text-bark hover:bg-sand"
                                            >
                                              Contact
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleResendReceipt(g)}
                                            disabled={resendingId === g.id}
                                            className="rounded-lg bg-ember px-2.5 py-1 text-xs font-semibold text-white hover:bg-ember-dark disabled:opacity-60"
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
                          <div className="shrink-0 sticky bottom-0 md:static z-30 border-t-2 border-sand-mute bg-sand font-bold text-bark overflow-x-auto custom-table-scrollbar shadow-lg md:shadow-none">
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                              <div className="flex items-center gap-4 text-xs sm:text-sm">
                                <span className="text-xs text-moss">
                                  Showing <strong className="text-bark">{filteredList.length}</strong> of <strong className="text-bark">{rawList.length}</strong> entries
                                </span>
                                <span className="font-bold text-bark">
                                  {expandedPurpose} Total: <span className="text-ember">{money(purposeTotal)}</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIsModalOpen(true)}
                                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-ember px-3 sm:px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark whitespace-nowrap"
                                >
                                  <Plus className="h-4 w-4" />
                                  <span>Add Receipt</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBackendPdf(true, expandedPurpose)}
                                  disabled={preparing !== null}
                                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 sm:px-3.5 text-xs font-semibold text-bark hover:bg-sand transition shadow-sm whitespace-nowrap disabled:opacity-60"
                                >
                                  {preparing === "pdf" ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-ember" aria-hidden="true" />
                                  ) : (
                                    <Printer className="h-4 w-4 text-ember" aria-hidden="true" />
                                  )}
                                  <span>{preparing === "pdf" ? "Preparing…" : "PDF Report"}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleExportSpreadsheet}
                                  disabled={preparing !== null}
                                  className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-bark px-3 sm:px-3.5 text-xs font-semibold text-white hover:bg-bark-900 transition shadow-sm whitespace-nowrap disabled:opacity-60"
                                >
                                  {preparing === "spreadsheet" ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-sage-light" aria-hidden="true" />
                                  ) : (
                                    <FileSpreadsheet className="h-4 w-4 text-sage-light" aria-hidden="true" />
                                  )}
                                  <span>{preparing === "spreadsheet" ? "Preparing…" : "Spreadsheet"}</span>
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
                        <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                          No contributions recorded for the selected date range ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}).
                        </div>
                      ) : (
                        displayedRows.map((row, idx) => (
                          <div
                            key={row.purpose}
                            onClick={() => toggleExpandPurpose(row.purpose)}
                            className="group cursor-pointer rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-3 transition hover:border-ember"
                          >
                            <div className="flex items-center justify-between gap-2 border-b border-sand-soft pb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-moss">#{idx + 1}</span>
                                <h3 className="font-bold text-sm text-bark group-hover:text-ember transition">{row.purpose}</h3>
                              </div>
                              <span className="font-bold text-sm text-ember bg-sand-linen px-2.5 py-1 rounded-lg border border-sand-line">
                                {money(row.total)}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-xs text-moss">
                              <div>M-Pesa: <strong className="text-bark">{Number(row.mpesa) > 0 ? money(row.mpesa) : "—"}</strong></div>
                              <div>Bank-to-Bank: <strong className="text-bark">{Number(row.bank_transfer) > 0 ? money(row.bank_transfer) : "—"}</strong></div>
                              <div>Cheque: <strong className="text-bark">{Number(row.cheque) > 0 ? money(row.cheque) : "—"}</strong></div>
                              <div>Cash: <strong className="text-sage-strong">{Number(row.cash) > 0 ? money(row.cash) : "—"}</strong></div>
                            </div>
                            <div className="flex items-center justify-between text-[11px] font-semibold text-ember pt-1">
                              <span className="inline-flex items-center gap-1">View individual givings <ArrowRight size={11} aria-hidden="true" /></span>
                              <ChevronRight className="h-4 w-4 text-ember group-hover:translate-x-0.5 transition" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Desktop Table View (visible on md and up). The column
                        grid is fixed and declared once, because the totals row
                        below is a second table and auto layout would size its
                        columns to its own (different) contents. */}
                    <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-table-scrollbar">
                      <table className="w-full table-fixed text-left text-sm">
                        <colgroup>
                          <col className="w-12" />
                          <col className="w-56" />
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm">
                          <tr>
                            <th className="px-4 py-3 text-left w-12">#</th>
                            <th className="px-4 py-3 w-56 shrink-0">Account</th>
                            <th className="px-4 py-3 text-right">M-Pesa</th>
                            <th className="px-4 py-3 text-right">Bank-to-Bank</th>
                            <th className="px-4 py-3 text-right">Cheque</th>
                            <th className="px-4 py-3 text-right">Cash</th>
                            <th className="px-4 py-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-sand-soft">
                          {displayedRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-moss">
                                No contributions recorded for the selected date range ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}).
                              </td>
                            </tr>
                          ) : (
                            displayedRows.map((row, idx) => (
                              <tr
                                key={row.purpose}
                                onClick={() => toggleExpandPurpose(row.purpose)}
                                className="group cursor-pointer hover:bg-sand-linen transition"
                              >
                                <td className={`px-4 ${rowPad} text-xs font-semibold text-moss font-mono`}>
                                  {idx + 1}
                                </td>
                                <td className={`px-4 ${rowPad} font-medium text-bark w-56 shrink-0 truncate`}>
                                  <div className="flex items-center justify-between gap-2 pr-2">
                                    <span className="font-semibold text-bark group-hover:text-ember transition">{row.purpose}</span>
                                    <ChevronRight className="h-4 w-4 text-moss group-hover:text-ember group-hover:translate-x-0.5 transition shrink-0" />
                                  </div>
                                </td>
                                <td className={`px-4 ${rowPad} text-right text-moss`}>{Number(row.mpesa) > 0 ? money(row.mpesa) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right text-moss`}>{Number(row.bank_transfer) > 0 ? money(row.bank_transfer) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right text-moss`}>{Number(row.cheque) > 0 ? money(row.cheque) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right font-semibold text-sage-strong`}>{Number(row.cash) > 0 ? money(row.cash) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right font-bold text-bark`}>{money(row.total)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Fixed Totals Footer at the bottom of the card with Print Report & Spreadsheet buttons — flush on the tab bar. The column totals belong to the table, so a phone (where the rows are cards) drops them and keeps the actions. */}
                    <div className="shrink-0 sticky bottom-0 md:static z-30 border-t-2 border-sand-mute bg-sand font-bold text-bark overflow-x-auto custom-table-scrollbar shadow-lg md:shadow-none">
                      <table className="hidden w-full table-fixed text-left text-sm md:table">
                        <colgroup>
                          <col className="w-12" />
                          <col className="w-56" />
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                        </colgroup>
                        <tfoot>
                          <tr>
                            <td className="px-4 py-2.5 text-xs text-moss font-mono w-12">#</td>
                            <td className="px-4 py-2.5 text-base w-56 shrink-0">Total</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.mpesa)}</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.bank_transfer)}</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.cheque)}</td>
                            <td className="px-4 py-2.5 text-right text-sage-strong">{money(totals.cash)}</td>
                            <td className="px-4 py-2.5 text-right text-base text-ember">{money(totals.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-sand-line">
                        <span className="text-xs font-semibold text-moss">
                          Total Rows Available: <strong className="text-bark">{displayedRows.length}</strong>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsModalOpen(true)}
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-ember px-3 sm:px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark whitespace-nowrap"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Add Receipt</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadBackendPdf(false)}
                            disabled={preparing !== null}
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 sm:px-3.5 text-xs font-semibold text-bark hover:bg-sand transition shadow-sm whitespace-nowrap disabled:opacity-60"
                          >
                            {preparing === "pdf" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-ember" aria-hidden="true" />
                            ) : (
                              <Printer className="h-4 w-4 text-ember" aria-hidden="true" />
                            )}
                            <span>{preparing === "pdf" ? "Preparing…" : "PDF Report"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleExportSpreadsheet}
                            disabled={preparing !== null}
                            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-bark px-3 sm:px-3.5 text-xs font-semibold text-white hover:bg-bark-900 transition shadow-sm whitespace-nowrap disabled:opacity-60"
                          >
                            {preparing === "spreadsheet" ? (
                              <Loader2 className="h-4 w-4 animate-spin text-sage-light" aria-hidden="true" />
                            ) : (
                              <FileSpreadsheet className="h-4 w-4 text-sage-light" aria-hidden="true" />
                            )}
                            <span>{preparing === "spreadsheet" ? "Preparing…" : "Spreadsheet"}</span>
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
                    const searchQueryLower = searchQuery.trim().toLowerCase();
                    const listToDisplay = allGivingsList.filter((g) => {
                      if (!searchQueryLower) return true;
                      return (
                        g.donor_name.toLowerCase().includes(searchQueryLower) ||
                        (g.receipt_number && g.receipt_number.toLowerCase().includes(searchQueryLower)) ||
                        (g.payment_method && g.payment_method.toLowerCase().includes(searchQueryLower)) ||
                        (g.purpose && g.purpose.toLowerCase().includes(searchQueryLower))
                      );
                    });
                    const isLoading = loadingAllGivings;
                    const displayTotal = listToDisplay.reduce((acc, g) => acc + Number(g.amount || 0), 0);

                    return (
                      <>
                        {/* Mobile Cards View (visible on md:hidden) */}
                        <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-table-scrollbar">
                          {isLoading ? (
                            <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                              Loading member givings...
                            </div>
                          ) : listToDisplay.length === 0 ? (
                            <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                              No individual member givings recorded for the selected date range.
                            </div>
                          ) : (
                            listToDisplay.map((giving, idx) => (
                              <div key={giving.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between gap-2 border-b border-sand-soft pb-2">
                                  <div>
                                    <div className="font-bold text-sm text-bark">{giving.donor_name}</div>
                                    <div className="text-[11px] text-moss">
                                      {dayFirst(giving.received_at)}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-sm text-sage">
                                      {money(giving.amount || 0)}
                                    </div>
                                    <span className="inline-block rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-semibold text-sage">
                                      {giving.payment_method}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="rounded-lg bg-sand-linen border border-sand-line px-2 py-0.5 text-xs font-semibold text-ember">
                                    {giving.purpose}
                                  </span>
                                  <span className="font-mono text-[11px] text-moss">Receipt: {giving.receipt_number || "N/A"}</span>
                                </div>

                                {giving.item_description && (
                                  <p className="text-xs text-moss italic bg-sand-linen p-2 rounded-lg border border-sand-line">
                                    Description: {giving.item_description}
                                  </p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-sand-soft">
                                  <span className={`text-[11px] font-semibold ${giving.receipt_sent_at ? "text-sage" : "text-ember"}`}>
                                    {giving.receipt_sent_at ? "Sent" : "Failed"}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    {(giving.giver_phone || giving.giver_email) && (
                                      <button
                                        type="button"
                                        onClick={() => setContactModalGiver(giving)}
                                        className="rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-[11px] font-semibold text-bark hover:bg-sand"
                                      >
                                        Contact
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleResendReceipt(giving)}
                                      disabled={resendingId === giving.id}
                                      className="rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ember-dark"
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
                            <div className="py-16 text-center text-sm text-moss">
                              Loading member givings...
                            </div>
                          ) : listToDisplay.length === 0 ? (
                            <div className="py-16 text-center text-sm text-moss">
                              No individual member givings recorded for the selected date range.
                            </div>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead className="sticky top-0 z-10 bg-sand font-semibold text-moss uppercase tracking-wider shadow-sm">
                                <tr>
                                  <th className="px-3 py-2.5 w-10">#</th>
                                  <th className="px-3 py-2.5 w-28 whitespace-nowrap">Date</th>
                                  <th className="px-3 py-2.5 w-44 shrink-0">Giver</th>
                                  <th className="px-3 py-2.5 w-44 shrink-0">Account</th>
                                  <th className="px-3 py-2.5 w-24">Mode</th>
                                  <th className="px-3 py-2.5 w-32">Receipt #</th>
                                  <th className="px-3 py-2.5 text-right w-28">Amount</th>
                                  <th className="px-3 py-2.5 w-24">Receipt</th>
                                  <th className="px-3 py-2.5 text-center w-20">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sand-soft bg-white">
                                {listToDisplay.map((giving, idx) => (
                                  <tr key={giving.id} className="hover:bg-sand-plate">
                                    <td className="px-3 py-3 text-xs text-moss font-mono font-semibold">{idx + 1}</td>
                                    <td className="px-3 py-3 text-moss whitespace-nowrap">
                                      {dayFirst(giving.received_at)}
                                    </td>
                                    <td className="px-3 py-3 w-44 shrink-0 font-semibold text-bark truncate max-w-[170px]" title={giving.donor_name}>
                                      {giving.donor_name}
                                    </td>
                                    <td className="px-3 py-3 w-44 shrink-0 font-semibold text-bark">
                                      <span className="inline-block rounded-lg bg-sand-linen border border-sand-line px-2 py-0.5 text-xs text-ember truncate max-w-[170px]" title={giving.purpose}>
                                        {giving.purpose}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3">
                                      <span className="inline-block rounded-full bg-mist-select px-2.5 py-0.5 text-[11px] font-semibold text-sage">
                                        {giving.payment_method}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-moss font-mono text-[11px]">
                                      {giving.receipt_number || "—"}
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold text-bark">
                                      {money(giving.amount)}
                                    </td>
                                    <td className="px-3 py-3">
                                      {giving.receipt_sent_at ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-strong">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Sent
                                        </span>
                                      ) : (
                                        <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                          Failed
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
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-xs font-semibold text-bark hover:bg-sand transition shadow-sm"
                                        >
                                          <span>Actions</span>
                                          <ChevronDown className="h-3.5 w-3.5 text-moss" />
                                        </button>

                                        {activeActionMenuId === giving.id && (
                                          <div
                                            className={`absolute right-0 z-30 w-44 rounded-xl border border-sand-line bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in duration-150 ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              disabled={resendingId === giving.id}
                                              onClick={() => {
                                                setActiveActionMenuId(null);
                                                handleResendReceipt(giving);
                                              }}
                                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark hover:bg-sand transition disabled:opacity-50"
                                            >
                                              {resendingId === giving.id ? (
                                                <RotateCw className="h-3.5 w-3.5 animate-spin text-ember" />
                                              ) : (
                                                <Send className="h-3.5 w-3.5 text-ember" />
                                              )}
                                              <span>Resend Receipt</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveActionMenuId(null);
                                                setContactModalGiver(giving);
                                              }}
                                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-sage hover:bg-mist-select transition"
                                            >
                                              <Phone className="h-3.5 w-3.5 text-sage" />
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

                        {/* Fixed Child Table Footer — sits flush on the tab bar. */}
                        <div className="shrink-0 sticky bottom-0 md:static z-30 border-t-2 border-sand-mute bg-sand px-4 py-2.5 font-semibold text-xs text-bark flex flex-wrap items-center justify-between gap-3 shadow-lg md:shadow-none">
                          <span className="text-moss">
                            Total Rows Available: <strong className="text-bark">{listToDisplay.length}</strong> • <span className="font-bold text-ember">KES {money(displayTotal)}</span>
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setIsModalOpen(true)}
                              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-ember px-3 sm:px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark whitespace-nowrap"
                            >
                              <Plus className="h-4 w-4" />
                              <span>Add Receipt</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadBackendPdf(true)}
                              disabled={preparing !== null}
                              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 sm:px-3.5 text-xs font-semibold text-bark hover:bg-sand transition shadow-sm whitespace-nowrap disabled:opacity-60"
                            >
                              {preparing === "pdf" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-ember" aria-hidden="true" />
                              ) : (
                                <Printer className="h-4 w-4 text-ember" aria-hidden="true" />
                              )}
                              <span>{preparing === "pdf" ? "Preparing…" : "PDF Report"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleExportSpreadsheet}
                              disabled={preparing !== null}
                              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-bark px-3 sm:px-3.5 text-xs font-semibold text-white hover:bg-bark-900 transition shadow-sm whitespace-nowrap disabled:opacity-60"
                            >
                              {preparing === "spreadsheet" ? (
                                <Loader2 className="h-4 w-4 animate-spin text-sage-light" aria-hidden="true" />
                              ) : (
                                <FileSpreadsheet className="h-4 w-4 text-sage-light" aria-hidden="true" />
                              )}
                              <span>{preparing === "spreadsheet" ? "Preparing…" : "Spreadsheet"}</span>
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

      {/* Contact Giver Quick Action Modal — the shared contact shell with the
          receipt as context; a giver isn't an app member, so no Chat here. */}
      {contactModalGiver && (
        <ContactModal
          onClose={() => setContactModalGiver(null)}
          title="Contact Giver"
          subtitle={contactModalGiver.donor_name}
          context={
            <div className="rounded-xl bg-sand p-3 text-xs space-y-1">
              <p className="font-semibold text-bark">{contactModalGiver.purpose}</p>
              <p className="text-moss">
                Amount: <span className="font-bold text-bark">{money(contactModalGiver.amount)}</span>
              </p>
              <p className="text-moss">Ref: {contactModalGiver.receipt_number}</p>
            </div>
          }
          actions={[
            {
              key: "call",
              icon: <Phone size={14} className="shrink-0 text-ember" aria-hidden="true" />,
              label: "Call",
              detail: contactModalGiver.giver_phone || "No phone number recorded for this giver.",
              href: contactModalGiver.giver_phone ? `tel:${contactModalGiver.giver_phone}` : undefined,
              disabled: !contactModalGiver.giver_phone,
            },
            {
              key: "sms",
              icon: <MessageSquare size={14} className="shrink-0 text-ember" aria-hidden="true" />,
              label: "Send SMS",
              detail: contactModalGiver.giver_phone || "No phone number recorded for this giver.",
              href: contactModalGiver.giver_phone ? `sms:${contactModalGiver.giver_phone}` : undefined,
              disabled: !contactModalGiver.giver_phone,
            },
            {
              key: "email",
              icon: <Mail size={14} className="shrink-0 text-ember" aria-hidden="true" />,
              label: "Email",
              detail: contactModalGiver.giver_email || "No email address recorded for this giver.",
              href: contactModalGiver.giver_email
                ? `mailto:${contactModalGiver.giver_email}?subject=Giving%20Receipt%20-%20${encodeURIComponent(contactModalGiver.purpose)}`
                : undefined,
              disabled: !contactModalGiver.giver_email,
            },
          ]}
        />
      )}

      {/* Add Receipt Modal — the same modal the contributions ledger uses,
          shared with the fund drives console. */}
      <AddReceiptModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleReceiptSaved}
      />

      {/* Preparing the document: generation runs on the server and can take a
          moment, so the desk is told what is being made and for which dates
          rather than left wondering whether the click registered. */}
      {preparing && !preview && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 print:hidden">
          <div className="flex items-center gap-2.5 rounded-2xl bg-bark px-4 py-3 text-xs font-semibold text-white shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>
              Preparing the {preparing === "pdf" ? "PDF report" : "spreadsheet"} for {rangeLabel}…
            </span>
          </div>
        </div>
      )}

      {/* The finished document, read before it is saved — a lightbox over the
          ledger, so the report never leaves the page it was asked from. */}
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-bark/60 p-3 sm:p-6 print:hidden"
          onMouseDown={(event) => event.target === event.currentTarget && closePreview()}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={preview.title}
            className="flex h-full max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-sand-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-bark">{preview.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-moss">
                  {preview.range} • {preview.kind === "pdf" ? "PDF" : "Spreadsheet"} • {preview.filename}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadPreview}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-dark"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  aria-label="Close preview"
                  className="rounded-xl p-2 text-moss transition hover:bg-sand hover:text-bark"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto bg-sand-soft p-3 sm:p-4">
              {preview.kind === "pdf" ? (
                <iframe
                  src={preview.url}
                  title={preview.title}
                  className="h-full min-h-[60vh] w-full rounded-xl border border-sand-line bg-white"
                />
              ) : (
                /* A workbook has no page a browser can draw, so the preview is
                   the report's own rows for the selected range — the file
                   saved from here is the formatted document. */
                <div className="space-y-2">
                  <p className="text-[11px] text-moss">
                    {preview.filename.endsWith(".xlsx")
                      ? "The report's figures for this range, as rows. Download saves them in the church's NEKF workbook."
                      : "Exactly the rows the download saves."}
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-sand-line bg-white">
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <tbody>
                        {preview.grid.map((row, rowIdx) => (
                          <tr
                            key={rowIdx}
                            className={rowIdx === 0 ? "bg-sand text-bark" : rowIdx === preview.grid.length - 1 ? "bg-sand-soft font-bold text-bark" : "text-moss-dark"}
                          >
                            {row.map((cell, cellIdx) => (
                              <td key={cellIdx} className={`whitespace-nowrap border-b border-sand-line px-3 py-2 ${rowIdx === 0 ? "font-semibold" : ""} ${cellIdx === 0 ? "w-10 text-moss" : ""}`}>
                                {String(cell).replace(/^"|"$/g, "")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sand-line px-4 py-3 sm:px-5">
              <p className="text-[11px] text-moss">
                Cut to {preview.range}. {preview.kind === "pdf" ? "What you see is the file you save." : "The download carries the same range."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:bg-sand"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={downloadPreview}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-dark"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
