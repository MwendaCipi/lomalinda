"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Building2, Smartphone, Wallet, Landmark, HandHeart, Megaphone, Copy, MessageCircle, MoreVertical, Pencil, Trash2, FileText, Printer, MoveLeft, Settings2, Check, RefreshCw, Send, X } from "lucide-react";
import { CampaignManagement } from "@/components/campaign-management";
import { openPdfTab } from "@/lib/pdf-lightbox";
import { TREASURY_VIEW_HREF, TreasuryNav } from "@/components/treasury-nav";
import { DateField } from "@/components/date-field";
import { usePageHeader } from "@/components/app-frame";
import { TREASURY_HEADING } from "@/config/navigation";
import { showAlert } from "@/lib/alerts";
import { dayFirst, firstDayOfMonth, localDate } from "@/lib/dates";
import { readAccountingLines } from "@/lib/accountability";
import { RecordList } from "./record-list";
import { FILTER_SELECT_CLASS, FilterPopover, FilterSet } from "./filter-popover";
import { ReportComposer, blankDraft, type Draft } from "./report-composer";
import { ExpenditureManager, EXPENDITURE_CATEGORIES } from "./expenditure-manager";
import { densityCellPad } from "@/lib/table-density";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type TreasuryAccount = {
  id: number;
  name: string;
  account_number: string;
  account_type: "bank" | "mobile_money" | "cash" | "other";
  account_type_display: string;
  balance: string | number;
  description: string;
  /** The department the fund belongs to, by code; null is the church's own money. */
  department: string | null;
  department_name: string;
  created_at: string;
};


/** The desk's own bearer header, read the way the component below reads it. */
const fundAuthHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token
    ? { Authorization: `Bearer ${token}` }
    : {};
};

/** One department's ask for its treasurer: pay this out of our fund. */
type WithdrawalRequestRow = {
  id: number;
  department: string;
  department_code: string;
  account_name: string;
  account_balance: string;
  amount: string;
  reason: string;
  status: "pending" | "pastor_approved" | "elder_approved" | "releasing" | "approved" | "declined" | "reversed";
  requested_by: string;
  /** The treasury's release of the money itself — the chain's last step. */
  treasurer_approved_by: string | null;
  treasurer_approved_at: string | null;
  pastor_approved_by: string | null;
  pastor_approved_at: string | null;
  /** Whether the signed-in officer gave this row its pastoral blessing. */
  you_pastor_approved?: boolean;
  elder_approved_by: string | null;
  elder_approved_at: string | null;
  /** Whether the signed-in officer gave this row its elder approval — the
      treasurer who releases the money then has to be someone else. */
  you_elder_approved?: boolean;
  decided_by: string | null;
  decided_at: string | null;
  reply: string;
  created_at: string;
  /** The requester's M-Pesa number, masked for the treasury's confirmation. */
  requested_by_phone?: string;
  /** The paybill release sent to M-Pesa, once the treasurer has released it. */
  payout?: {
    id: number;
    status: "pending" | "accepted" | "completed" | "failed" | "reversed";
    status_display: string;
    phone_number: string;
    transaction_id: string;
    outcome_description: string;
    initiated_by: string | null;
    completed_at: string | null;
    created_at: string;
    expense_id: number | null;
  } | null;
  /** How the released money was spent, once the receiving desk has filed it. */
  accountability?: {
    status: "submitted" | "accepted" | "returned";
    notes: string;
    spent_on: string | null;
    submitted_by: string | null;
    submitted_at: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    reply: string;
    receipts: { id: number; filename: string; caption: string; url: string }[];
  } | null;
  /** The latest signature ask raised for this one request, if any. */
  signature_request?: {
    id: number;
    title: string;
    status: "pending" | "signed" | "rejected";
    created_at: string;
  } | null;
};

/**
 * Which desk is showing the queue. The chain is signed off one office at a
 * time, and each office signs on its own desk and nowhere else: the pastor
 * blesses inside the pastorate, an elder approves inside the eldership, and
 * the treasury releases inside the treasury. A desk is told which step is its
 * own, and the other buttons never appear there — not for an administrator
 * or any other role reading the same queue from a different workspace.
 */
export type WithdrawalWorkspace = "pastorate" | "eldership" | "treasury";

/** The one approval this desk's workspace can give a request. */
type WithdrawalApprovalAction = "pastor_approve" | "elder_approve" | "release";

/** How the treasury pays a request it is releasing. Paybill sends the B2C
 *  payout; the other methods record a payment already made that way. */
type WithdrawalReleaseMethod = "paybill" | "cash" | "bank_transfer" | "cheque" | "mpesa";

/**
 * The departments' withdrawal queue — showing every request across every
 * department in a structured, actionable table.
 * Approval is four clearances in order:
 *   1. The pastor blesses the ask ("Pastor Approve")
 *   2. An elder approves it ("Elder Approve")
 *   3. The treasury then releases the money from the paybill, approves a
 *      payment made another way — cash, bank or cheque — or declines.
 *      Either approval debits the fund and reflects in Expenses.
 * Any of the three may decline at any point, but none may approve before
 * the one ahead of them in the chain has.
 * Approved requests remain visible so the treasurer can reverse them if needed,
 * and a reversed one can be approved again while the account still covers it.
 */
export function WithdrawalRequestsPanel({
  search = "",
  statusFilter = "all",
  fromDate = "",
  toDate = "",
  onChanged,
  onLoaded,
  registerRefresh,
  workspace,
}: {
  search?: string;
  statusFilter?: "all" | "pending" | "approved" | "rejected";
  /** The desk this queue is drawn on. Only that desk's own clearance is
      offered: the pastor's blessing on the pastorate, the elder's approval on
      the eldership, the release on the treasury. Omitted, no clearance is
      offered at all — reading the queue is never the right to sign it. */
  workspace?: WithdrawalWorkspace;
  /** The date window the desk hides under: the day each request was asked,
      read the same way the Givings and Expenses dates read their rows. */
  fromDate?: string;
  toDate?: string;
  /**
   * Called after an action that moves money (approve / reverse), so the desk
   * refetches its accounts. The approval debits the fund server-side; without
   * this the Church Accounts view kept showing the pre-approval balance until
   * a full reload.
   */
  onChanged?: () => void;
  /** Told what arrived when the queue refetches, so the desk holding the
      window can open it on the oldest unresponded ask rather than a
      calendar guess this panel knows nothing about. */
  onLoaded?: (rows: WithdrawalRequestRow[]) => void;
  /** Handed the queue's own re-read: the shell's header refresh button
      calls it, so the roll's refresh lives beside the filters in the top
      band instead of at the foot of the table. */
  registerRefresh?: (fn: (() => void) | null) => void;
} = {}) {
  const [rows, setRows] = useState<WithdrawalRequestRow[]>([]);
  const [canApproveTreasury, setCanApproveTreasury] = useState(true);
  const [loading, setLoading] = useState(true);
  // What the server said when it would not hand the queue over. An office the
  // endpoint refuses used to read as "Nothing waiting" — the desk reported an
  // empty church instead of its own closed door, which is how a pastor whose
  // authority the server did not recognise sat in front of an empty page.
  const [error, setError] = useState("");
  const [openAction, setOpenAction] = useState<number | null>(null);
  const [respondMode, setRespondMode] = useState<"approve" | "decline">("approve");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [sendingForSignature, setSendingForSignature] = useState(false);
  const [sendingRequestForSignatureId, setSendingRequestForSignatureId] = useState<number | null>(null);
  // The print sheet's own filters. It opens on the desk's current filters
  // and then prints exactly what the modal says, not what the table behind
  // it happens to show after the desk moves on.
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printStatus, setPrintStatus] = useState<"all" | "pending" | "approved" | "rejected">(statusFilter);
  const [printSearch, setPrintSearch] = useState(search);
  const [printFrom, setPrintFrom] = useState(fromDate);
  const [printTo, setPrintTo] = useState(toDate);
  // The number this release pays. It starts from the requester's saved
  // number and stays editable, so the desk can pay a corrected or
  // alternative line without changing the member's profile.
  const [releasePhone, setReleasePhone] = useState("");
  // How a treasury approval is paid. The paybill path sends the B2C payout;
  // the other choices record money already paid by that method, which keeps
  // the treasury moving while B2C is unavailable.
  const [releaseMethod, setReleaseMethod] = useState<WithdrawalReleaseMethod>("cash");
  // The treasury's reading of the spending account filed after a release.
  const [accountReply, setAccountReply] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  // The row actions popover, and the request whose spending account the
  // desk is reading. The marker closes the popover on an outside press,
  // the way the accounts desk's own row menus close.
  const [openMenuRequestId, setOpenMenuRequestId] = useState<number | null>(null);
  const [accountingRow, setAccountingRow] = useState<WithdrawalRequestRow | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-action-menu]")) return;
      setOpenMenuRequestId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const rowPad = densityCellPad();

  const load = useCallback(() => {
    setLoading(true);
    return fetch(`${API_URL}/api/members/department-withdrawals/review/`, { headers: fundAuthHeaders() })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(String(data?.detail || "The queue could not be read."));
          setRows([]);
          onLoaded?.([]);
          return;
        }
        setError("");
        const loaded = Array.isArray(data?.requests) ? data.requests : [];
        setRows(loaded);
        setCanApproveTreasury(data?.can_approve_treasury !== false);
        onLoaded?.(loaded);
      })
      .catch(() => {
        setError("The queue could not be read.");
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [onLoaded]);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) load(); });
    return () => { alive = false; };
  }, [load]);

  // The shell's header refresh button reads through this hook: the panel
  // hands its own roll reader up once mounted and clears it on the way out.
  useEffect(() => {
    registerRefresh?.(load);
    return () => registerRefresh?.(null);
  }, [load, registerRefresh]);

  const act = async (id: number, action: string, extraReply?: string, phoneNumber?: string, paymentMethod?: string) => {
    if (workspace === "treasury" && !canApproveTreasury) {
      void showAlert("Permission Denied", "Assistant treasurers cannot do treasury approvals or reversals.", "warning");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/members/department-withdrawals/review/`, {
        method: "POST",
        headers: { ...fundAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          reply: (extraReply ?? "").trim(),
          ...(action === "release" ? { phone_number: (phoneNumber ?? "").trim() } : {}),
          ...(action === "approve" ? { payment_method: paymentMethod ?? "cash" } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not save the answer.");
      setOpenAction(null);
      setReply("");
      const messages: Record<string, [string, string]> = {
        pastor_approve: ["Pastor's approval recorded", "The elder can now act on this request."],
        elder_approve: ["Elder approval recorded", "The treasury can release the money now."],
        approve: ["Withdrawal approved", "The fund has been debited and reflected in Expenses."],
        release: ["Release sent to M-Pesa", "The paybill is paying the requester. The expense is written when M-Pesa confirms."],
        decline: ["Request declined", "The desk has your reply."],
        reverse: ["Withdrawal reversed", "The fund has been credited back and expense record removed."],
      };
      const [title, msg] = messages[action] ?? ["Done", ""];
      showAlert(title, msg, "success");
      // Approving and reversing change the account's balance; tell the desk to
      // refetch so it does not keep showing the old figure.
      if (action === "approve" || action === "reverse") onChanged?.();
      load();
    } catch (error) {
      showAlert("Could not complete action", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (status: WithdrawalRequestRow["status"]) => {
    const map: Record<string, string> = {
      pending: "bg-sand text-bark",
      elder_approved: "bg-amber-50 text-amber-800",
      pastor_approved: "bg-purple-50 text-purple-800",
      releasing: "bg-sky-50 text-sky-800",
      approved: "bg-green-50 text-green-800",
      declined: "bg-red-50 text-red-700",
      reversed: "bg-sand text-moss",
    };
    const labels: Record<string, string> = {
      pending: "Pending (pastor)",
      elder_approved: "Pending (treasurer)",
      pastor_approved: "Pending (elder)",
      releasing: "Releasing",
      approved: "Approved",
      declined: "Rejected",
      reversed: "Reversed",
    };
    return (
      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[status] ?? "bg-sand text-bark"}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  // The print sheet opens on the desk's current filters. Once it is open,
  // its own controls decide what the paper carries.
  const openPrintModal = () => {
    setPrintStatus(statusFilter);
    setPrintSearch(search);
    setPrintFrom(fromDate);
    setPrintTo(toDate);
    setShowPrintModal(true);
  };

  // The wide report prints from the backend now: the same rows under the same
  // filters arrive as a real PDF. It carries no signature slots — a signed
  // copy belongs to one request, which each row's own Print produces.
  const printReport = () => {
    if (printing) return;
    const params = new URLSearchParams();
    if (printStatus !== "all") params.set("status", printStatus);
    if (printSearch.trim()) params.set("search", printSearch.trim());
    if (printFrom) params.set("from_date", printFrom);
    if (printTo) params.set("to_date", printTo);
    setShowPrintModal(false);
    setPrinting(true);
    openPdfTab(`${API_URL}/api/members/department-withdrawals/pdf/?${params.toString()}`, {
      headers: fundAuthHeaders(),
      fallbackError: "Could not generate the report.",
      onError: (message) => showAlert("Could not print", message, "error"),
      onSettled: () => setPrinting(false),
    });
  };

  // The same report, sent round the offices instead of only printed. The
  // treasury keeps the first pen; an elder and the pastor add theirs from the
  // Requests desk, and the report is signed only when all three have.
  const sendReportForSignature = async () => {
    if (sendingForSignature || printRows.length === 0) return;
    setSendingForSignature(true);
    try {
      const period = printFrom || printTo ? `${printFrom || "Start"} to ${printTo || "Today"}` : "All dates";
      const details = [
        printStatus === "all" ? "All statuses" : printStatus.replace(/_/g, " "),
        printSearch.trim() ? `Search: ${printSearch.trim()}` : "",
        `${printRows.length} ${printRows.length === 1 ? "request" : "requests"}`,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 255);
      const res = await fetch(`${API_URL}/api/members/reports/signings/`, {
        method: "POST",
        headers: { ...fundAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "requests",
          title: `Withdrawal requests report — ${period}`,
          period_start: printFrom || null,
          period_end: printTo || null,
          details,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "The report could not be sent for signature.");
      setShowPrintModal(false);
      showAlert(
        "Sent for signature",
        "The treasurer, an elder and the pastor can sign it from Requests.",
        "success",
      );
    } catch (error) {
      showAlert(
        "Could not send for signature",
        error instanceof Error ? error.message : "Try again.",
        "error",
      );
    } finally {
      setSendingForSignature(false);
    }
  };

  // One approved request sent round the three offices for its own signature
  // ask. The paper stays tied to the request, so a signatory reads the
  // department, amount and purpose before putting a pen on it.
  const sendRequestForSignature = async (row: WithdrawalRequestRow) => {
    if (sendingRequestForSignatureId !== null) return;
    setSendingRequestForSignatureId(row.id);
    try {
      const res = await fetch(`${API_URL}/api/members/reports/signings/`, {
        method: "POST",
        headers: { ...fundAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "withdrawal_request",
          withdrawal_request_id: row.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "The request could not be sent for signature.");
      showAlert(
        "Sent for signature",
        `The treasurer, an elder and the pastor can sign request #${row.id} from Requests.`,
        "success",
      );
      await load();
    } catch (error) {
      showAlert(
        "Could not send for signature",
        error instanceof Error ? error.message : "Try again.",
        "error",
      );
    } finally {
      setSendingRequestForSignatureId(null);
    }
  };

  // Each request prints itself: one request on its own sheet, with the amount
  // spelled out and the three signature slots (the authorizing officer, the
  // one issuing, and the receiver) that the department signs for the money.
  const printRequest = (row: WithdrawalRequestRow) => {
    if (printingId !== null) return;
    setPrintingId(row.id);
    openPdfTab(`${API_URL}/api/members/department-withdrawals/${row.id}/pdf/`, {
      headers: fundAuthHeaders(),
      fallbackError: "Could not print the request.",
      onError: (message) => showAlert("Could not print", message, "error"),
      onSettled: () => setPrintingId(null),
    });
  };

  // The spending account is the treasury's last word on a released withdrawal:
  // accept it, or send it back with what is missing so the desk can resubmit.
  const reviewAccountability = async (row: WithdrawalRequestRow, decision: "accepted" | "returned") => {
    if (accountBusy) return;
    if (decision === "returned" && !accountReply.trim()) return;
    setAccountBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/members/department-withdrawals/${row.id}/accountability/`, {
        method: "POST",
        headers: { ...fundAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", decision, reply: accountReply.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not save the treasury's answer.");
      showAlert(
        decision === "accepted" ? "Account accepted" : "Account sent back",
        decision === "accepted"
          ? "The desk's spending is accounted for."
          : "The desk has your reason and can resubmit.",
        "success",
      );
      setAccountReply("");
      setAccountingRow(null);
      load();
    } catch (error) {
      showAlert("Could not save the answer", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setAccountBusy(false);
    }
  };

  // Receipts are private to the fund, so they are fetched with the desk's
  // bearer token and shown from a local blob rather than a bare link.
  const openAccountReceipt = async (receipt: { id: number; filename: string; url: string }) => {
    try {
      const res = await fetch(`${API_URL}${receipt.url}`, { headers: fundAuthHeaders() });
      if (!res.ok) throw new Error("The receipt could not be read.");
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      showAlert("Could not open the receipt", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  const rowsForFilters = (filters: {
    status: "all" | "pending" | "approved" | "rejected";
    search: string;
    from: string;
    to: string;
  }) => rows.filter((row) => {
    if (filters.status === "pending") {
      if (!["pending", "pastor_approved", "elder_approved", "releasing"].includes(row.status)) return false;
    } else if (filters.status === "approved") {
      if (row.status !== "approved") return false;
    } else if (filters.status === "rejected") {
      if (row.status !== "declined") return false;
    }
    // The date window: a request stands in it by the day it was asked,
    // in the church's timezone — the same day the table prints on the row.
    if (filters.from || filters.to) {
      const askedOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(row.created_at));
      if (filters.from && askedOn < filters.from) return false;
      if (filters.to && askedOn > filters.to) return false;
    }
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const match =
        row.department.toLowerCase().includes(q) ||
        row.account_name.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q) ||
        row.requested_by.toLowerCase().includes(q) ||
        (row.treasurer_approved_by && row.treasurer_approved_by.toLowerCase().includes(q)) ||
        (row.pastor_approved_by && row.pastor_approved_by.toLowerCase().includes(q)) ||
        (row.elder_approved_by && row.elder_approved_by.toLowerCase().includes(q)) ||
        (row.decided_by && row.decided_by.toLowerCase().includes(q)) ||
        (row.reply && row.reply.toLowerCase().includes(q)) ||
        row.amount.includes(q);
      if (!match) return false;
    }
    return true;
  });
  const filteredRows = rowsForFilters({
    status: statusFilter,
    search,
    from: fromDate,
    to: toDate,
  });
  const printRows = rowsForFilters({
    status: printStatus,
    search: printSearch,
    from: printFrom,
    to: printTo,
  });

  // The church writes money the same way everywhere on this desk.
  const money = (value: string | number) =>
    `KES ${Number(value).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

  /* The clearances on one ask, in the order the church gives them: the
     pastor's blessing, the elder's approval, and then the treasury's own
     word, "Treasurer-approved by …", the office that actually released the
     money named as itself, so it is never read as a second, anonymous
     approval. Both layouts read these same lines, so a request says the
     same thing on a phone as on a desk. */
  const trail = (row: WithdrawalRequestRow) => (
    <>
      {row.pastor_approved_by && (
        <p className="text-[10px] text-moss-faint">
          Pastor-approved by {row.pastor_approved_by}
        </p>
      )}
      {row.elder_approved_by && (
        <p className="text-[10px] text-moss-faint">
          Elder-approved by {row.elder_approved_by}
        </p>
      )}

      {row.decided_by && (row.status === "approved" || row.status === "declined") && (
        <p className="text-[10px] italic text-moss-faint">
          {row.status === "approved"
            ? `Treasurer-approved by ${row.decided_by}`
            : `Rejected by ${row.decided_by}`}
          {row.reply ? `: "${row.reply}"` : ""}
        </p>
      )}
      {row.status === "approved" && (
        <p
          className={`text-[10px] font-semibold ${
            row.accountability?.status === "accepted"
              ? "text-green-700"
              : row.accountability?.status === "returned"
                ? "text-red-600"
                : row.accountability
                  ? "text-amber-700"
                  : "text-moss-faint"
          }`}
        >
          {row.accountability
            ? row.accountability.status === "accepted"
              ? "Accountability accepted"
              : row.accountability.status === "returned"
                ? "Accountability sent back"
                : "Accountability submitted"
            : "Accountability not filed"}
        </p>
      )}
    </>
  );

  // One request's reply, from a fresh line each time the desk opens it. The
  // mode decides which single answer the modal offers: Approve or Decline.
  const openRespond = (row: WithdrawalRequestRow, mode: "approve" | "decline") => {
    setRespondMode(mode);
    setOpenAction(row.id);
    setReply("");
    setReleasePhone(row.requested_by_phone ?? "");
    setReleaseMethod("cash");
    setAccountReply("");
  };

  // Whose pen is next on this row. The modal offers one approval, never the
  // whole chain, so a pastor cannot accidentally press the treasurer's step.
  const approvalActionFor = (row: WithdrawalRequestRow): WithdrawalApprovalAction | null => {
    if (row.status === "pending" && workspace === "pastorate") return "pastor_approve";
    if (row.status === "pastor_approved" && workspace === "eldership") return "elder_approve";
    if (row.status === "elder_approved" && workspace === "treasury") return "release";
    if (row.status === "reversed" && workspace === "treasury") return "release";
    return null;
  };

  const reverseWithdrawal = (row: WithdrawalRequestRow) => {
    showAlert(
      "Reverse withdrawal?",
      `This will credit KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })} back to ${row.account_name} and remove the corresponding expense record.`,
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Yes, reverse it",
        cancelButtonText: "Cancel",
      },
    ).then((result) => {
      if (result.isConfirmed) {
        setOpenAction(null);
        act(row.id, "reverse");
      }
    });
  };

  /* Every request answers from one Actions popover — the table and the
     phone's cards both render it, so the row stays a single button wide.
     Approve and Decline each open the same modal on their own answer; Print
     renders the request's signable sheet, and Accounting opens the spending
     account the receiving desk filed. */
  const actions = (row: WithdrawalRequestRow, roomy = true) => (
    <div className={`relative ${roomy ? "" : "flex justify-end"}`} data-action-menu>
      <button
        type="button"
        onClick={() => setOpenMenuRequestId(openMenuRequestId === row.id ? null : row.id)}
        aria-expanded={openMenuRequestId === row.id}
        aria-label={`Actions for the ${row.department} request`}
        className={`rounded-lg border border-sand-mute font-semibold text-moss transition hover:border-ember hover:text-ember ${
          roomy ? "px-3 py-2 text-xs" : "px-2.5 py-1 text-[11px]"
        }`}
      >
        Actions <span aria-hidden="true">▾</span>
      </button>
      {openMenuRequestId === row.id && (
        <div
          className={`absolute z-30 w-44 rounded-xl border border-sand-line bg-white p-1.5 shadow-lg ${
            roomy ? "bottom-full right-0 mb-1.5" : "right-0 top-full mt-1"
          }`}
        >
          {approvalActionFor(row) && (
            <button
              type="button"
              onClick={() => {
                setOpenMenuRequestId(null);
                openRespond(row, "approve");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
            >
              <Check className="h-4 w-4 text-sage" />
              Approve request
            </button>
          )}
          {["pending", "pastor_approved", "elder_approved"].includes(row.status) && (
            <button
              type="button"
              onClick={() => {
                setOpenMenuRequestId(null);
                openRespond(row, "decline");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
            >
              <X className="h-4 w-4 text-ember" />
              Decline request
            </button>
          )}
          {row.status === "approved" && workspace === "treasury" && (
            <button
              type="button"
              onClick={() => {
                setOpenMenuRequestId(null);
                reverseWithdrawal(row);
              }}
              disabled={!canApproveTreasury}
              title={!canApproveTreasury ? "Assistant treasurers cannot reverse withdrawals." : undefined}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4 text-moss" />
              Reverse withdrawal
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpenMenuRequestId(null);
              printRequest(row);
            }}
            disabled={printingId === row.id}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand disabled:opacity-60"
          >
            <Printer className={`h-4 w-4 text-moss ${printingId === row.id ? "animate-spin" : ""}`} />
            {printingId === row.id ? "Preparing…" : "Print"}
          </button>
          {row.status === "approved" && workspace === "treasury" && (
            <button
              type="button"
              onClick={() => {
                setOpenMenuRequestId(null);
                void sendRequestForSignature(row);
              }}
              disabled={
                sendingRequestForSignatureId !== null ||
                row.signature_request?.status === "pending" ||
                row.signature_request?.status === "signed"
              }
              title={
                row.signature_request?.status === "signed"
                  ? "Every office has signed this request."
                  : row.signature_request?.status === "pending"
                    ? "The offices are still holding this request."
                    : undefined
              }
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand disabled:opacity-60"
            >
              <Send
                className={`h-4 w-4 text-moss ${
                  sendingRequestForSignatureId === row.id ? "animate-pulse" : ""
                }`}
              />
              {row.signature_request?.status === "signed"
                ? "Signed"
                : row.signature_request?.status === "pending"
                  ? "Awaiting signatures"
                  : row.signature_request?.status === "rejected"
                    ? "Send again"
                    : sendingRequestForSignatureId === row.id
                      ? "Sending…"
                      : "Send for signature"}
            </button>
          )}
          {row.status === "approved" && (
            <button
              type="button"
              onClick={() => {
                setOpenMenuRequestId(null);
                setAccountReply("");
                setAccountingRow(row);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand"
            >
              <FileText className="h-4 w-4 text-moss" />
              Accounting
            </button>
          )}
        </div>
      )}
    </div>
  );

  /* An empty queue and a search that matches nothing are two different
     answers — the church has nothing waiting, versus the desk filtered its own
     list away — so they keep their own words. */
  const emptyState = error ? (
    <>
      <p className="text-sm font-semibold text-bark">The queue could not be read</p>
      <p className="mx-auto mt-1 max-w-sm text-xs text-moss">{error}</p>
    </>
  ) : rows.length === 0 ? (
      <>
        <p className="text-sm font-semibold text-bark">Nothing waiting</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-moss">
          When a department&apos;s leadership asks for money from its fund, the ask lands here.
        </p>
      </>
    ) : (
      <>
        <p className="text-sm font-semibold text-bark">No matching requests</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-moss">
          Try adjusting your search query or filter selection.
        </p>
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Table on a desk, cards on a phone — the queue is one list either way,
          so `RecordList` owns the breakpoint pair and the four states. */}
      <RecordList
        rows={filteredRows}
        loading={loading}
        rowKey={(row) => row.id}
        loadingLabel="Loading the requests…"
        tableWrapperClassName="flex-1 min-h-0 overflow-auto custom-table-scrollbar"
        tableClassName="w-full text-left text-xs"
        headClassName="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-xs"
        headRowClassName=""
        headCellClassName="px-4 py-3"
        headers={[
          { label: "Date" },
          { label: "Department & Account" },
          { label: "Purpose & Details" },
          { label: "Amount (KES)", className: "text-right" },
          { label: "Status", className: "text-center" },
          { label: "Actions", className: "text-right no-print" },
        ]}
        stateClassName="py-10 text-center text-xs text-moss"
        tableEmptyClassName="py-10 text-center"
        cardsStateClassName="py-10 text-center"
        tableEmpty={emptyState}
        cardsEmpty={
          <div className="m-2 rounded-2xl border border-dashed border-sand-line px-4 py-10 text-center">
            {emptyState}
          </div>
        }
        cardsClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 custom-table-scrollbar"
        renderCard={(row) => (
          <div
            key={row.id}
            className="space-y-3 rounded-2xl border border-sand-line bg-white p-4 text-xs shadow-sm"
          >
            <div className="flex items-start justify-between gap-2 border-b border-sand-soft pb-2.5">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-bold text-bark">{row.department}</h4>
                <p className="truncate text-[11px] text-moss-faint">{row.account_name}</p>
              </div>
              {statusBadge(row.status)}
            </div>

            <div className="space-y-1 text-moss">
              <p className="font-medium text-bark">{row.reason}</p>
              <p className="text-[11px] text-moss-faint">
                Asked by {row.requested_by} · Bal: {money(row.account_balance)}
              </p>
              {trail(row)}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-sand-soft pt-2.5">
              <div>
                <p className="font-mono text-[11px] text-moss">{dayFirst(row.created_at)}</p>
                <p className="text-sm font-bold text-bark">{money(row.amount)}</p>
              </div>
              <div className="no-print">{actions(row, true)}</div>
            </div>
          </div>
        )}
        renderRow={(row) => (
          <tr key={row.id} className="transition hover:bg-sand-linen/60">
            <td className={`whitespace-nowrap px-4 ${rowPad} font-mono text-[11px] text-moss`}>
              {dayFirst(row.created_at)}
            </td>
            <td className={`w-44 max-w-[11rem] px-4 ${rowPad} font-medium text-bark`}>
              <p className="truncate font-semibold text-bark" title={row.department}>{row.department}</p>
              <p className="truncate text-[11px] text-moss-faint" title={row.account_name}>{row.account_name}</p>
            </td>
            <td className={`px-4 ${rowPad} text-moss`}>
              <p className="font-medium text-bark">{row.reason}</p>
              <p className="text-[11px] text-moss-faint">
                Asked by {row.requested_by} · Bal: {money(row.account_balance)}
              </p>
              {trail(row)}
            </td>
            <td className={`whitespace-nowrap px-4 ${rowPad} text-right font-bold text-bark`}>
              {money(row.amount)}
            </td>
            <td className={`whitespace-nowrap px-4 ${rowPad} text-center`}>
              {statusBadge(row.status)}
            </td>
            <td className={`whitespace-nowrap px-4 ${rowPad} text-right no-print`}>
              {actions(row)}
            </td>
          </tr>
        )}
      />

      {/* Action modal: one request's decisions, and nowhere else. An elder
          clears a pending ask, the treasury then releases or declines it, and
          a released withdrawal can be reversed — a reversed one may then be
          approved again while the account still covers it. A settled request
          reads back what was decided. */}
      {openAction !== null && (() => {
        const target = rows.find((r) => r.id === openAction);
        if (!target) return null;
        // The ask's four clearances, in the order it passes them: the
        // treasury's first read, the elder's blessing, the pastor's approval,
        // and then the treasury's release of the money itself.
        const awaitingPastor = target.status === "pending";
        const awaitingElder = target.status === "pastor_approved";
        const awaitingRelease = target.status === "elder_approved";
        const isReleasing = target.status === "releasing";
        const inFlight = awaitingPastor || awaitingElder || awaitingRelease;
        const canReverse = target.status === "approved";
        const isReversed = target.status === "reversed";
        // Four hands, four people: whoever cleared this ask earlier cannot
        // also release it as the treasurer. The API refuses the later step,
        // and the button says why rather than letting the desk find out by
        // error.
        // Three hands, three people: whoever blessed this ask earlier
        // cannot also release it as the treasurer. The API refuses the
        // later step, and the button says why rather than letting the desk
        // find out by error.
        const selfPastorCleared = Boolean(target.you_pastor_approved);
        const selfElderCleared = Boolean(target.you_elder_approved);
        const selfCleared = selfPastorCleared || selfElderCleared;
        // Approving a reversed request debits the fund a second time, so the
        // option is offered only while the account still covers the ask — the
        // API enforces the same rule; this keeps the button honest.
        const reversedCovered = Number(target.account_balance) >= Number(target.amount);
        const releaseNumber = releasePhone.trim();
        const approvalAction = approvalActionFor(target);
        const approveIsRelease = approvalAction === "release";
        const releaseViaPaybill = approveIsRelease && releaseMethod === "paybill";
        // A manual method uses the existing approve path: it debits the fund
        // and writes the expense immediately, without asking M-Pesa to move
        // money. Paybill keeps the B2C release path.
        const approveAction = approveIsRelease && !releaseViaPaybill ? "approve" : approvalAction;
        const approveBlocked =
          !approveAction ||
          (approveIsRelease && (
            !canApproveTreasury ||
            selfCleared ||
            (isReversed && !reversedCovered) ||
            (releaseViaPaybill && (!releaseNumber || Number(target.amount) % 1 !== 0))
          ));
        const approveBlockedReason = !approveAction
          ? "This request is not waiting on your desk's approval."
          : approveIsRelease && !canApproveTreasury
            ? "Assistant treasurers cannot release withdrawals."
            : approveIsRelease && selfCleared
              ? "You gave this request an earlier clearance. A different treasurer must approve the release."
              : approveIsRelease && isReversed && !reversedCovered
                ? `${target.account_name} does not hold enough for this request.`
                : releaseViaPaybill && !releaseNumber
                  ? "Enter the M-Pesa number the money should be paid to."
                  : releaseViaPaybill && Number(target.amount) % 1 !== 0
                    ? "M-Pesa payouts are whole shillings."
                    : undefined;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-sand-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-bark">
                    {respondMode === "approve" ? "Approve request" : "Decline request"}
                  </h4>
                  <p className="mt-0.5 text-xs text-moss">
                    {target.department} · {target.account_name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-moss-faint">
                    {respondMode === "approve"
                      ? "Review the request, then approve it."
                      : "Give the department a reason before declining it."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenAction(null);
                    setReply("");
                    setAccountReply("");
                  }}
                  aria-label="Close"
                  className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-1.5 rounded-xl border border-sand-line bg-sand-plate p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-bark">
                    KES {Number(target.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </span>
                  {statusBadge(target.status)}
                </div>
                <p className="text-moss">{target.reason}</p>
                <p className="text-[11px] text-moss-faint">
                  {respondMode === "decline"
                    ? "Declining sends this request back to the department with your reason. No money moves."
                    : awaitingPastor
                      ? "Waiting on the pastor's blessing before an elder can act."
                      : awaitingElder
                        ? "Blessed by the pastor. An elder approves it next."
                        : awaitingRelease
                          ? approvalAction === "release" && releaseMethod !== "paybill"
                            ? "Approved by the pastor and an elder. Record how the money was paid, then approve it."
                            : "Approved by the pastor and an elder. Release it from the paybill to the requester's phone, or decline it."
                          : isReleasing
                            ? "The paybill is paying the requester. The expense is written when M-Pesa confirms."
                            : canReverse
                            ? `${target.decided_by ? `Treasurer-approved by ${target.decided_by}.` : "Approved by the treasury."} Reversing credits the fund back and removes the expense.`
                            : isReversed
                              ? "Reversed. The fund was credited back. It can be released again while the account covers it."
                              : `Decided by ${target.decided_by ?? "the office"}${target.reply ? `: "${target.reply}"` : ""}.`}
                </p>
                {target.payout && (
                  <p className="mt-1 text-[11px] text-moss-faint">
                    Paybill payout: {target.payout.status_display}
                    {target.payout.phone_number ? ` · ${target.payout.phone_number}` : ""}
                    {target.payout.transaction_id ? ` · ${target.payout.transaction_id}` : ""}
                  </p>
                )}
                {awaitingRelease && selfCleared && (
                  <p className="mt-1.5 text-[11px] font-semibold text-ember">
                    {selfPastorCleared
                      ? "You gave this request its pastoral blessing. The treasurer who releases the money has to be someone else."
                      : "You approved this request as its elder. The treasurer who releases the money has to be someone else."}
                  </p>
                )}
                {isReversed && selfCleared && (
                  <p className="mt-1.5 text-[11px] font-semibold text-ember">
                    You cleared this request earlier. The treasurer who releases it again has to be someone else.
                  </p>
                )}
                {isReversed && !reversedCovered && (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-600">
                    {target.account_name} holds KES {Number(target.account_balance).toLocaleString("en-KE", { minimumFractionDigits: 2 })},
                    less than the KES {Number(target.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })} asked for, so it cannot be
                    released yet.
                  </p>
                )}
              </div>

              {respondMode === "approve" && approveIsRelease && (
                <div className="mt-3 rounded-xl border border-sand-line bg-sand-plate p-3">
                  <label
                    htmlFor="withdrawal-release-method"
                    className="block text-[11px] font-bold uppercase tracking-wide text-moss"
                  >
                    Release method
                  </label>
                  <select
                    id="withdrawal-release-method"
                    value={releaseMethod}
                    onChange={(event) => setReleaseMethod(event.target.value as WithdrawalReleaseMethod)}
                    className="mt-1.5 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="mpesa">M-Pesa (already paid)</option>
                    <option value="paybill">Release from paybill (M-Pesa B2C)</option>
                  </select>

                  {releaseMethod === "paybill" ? (
                    <>
                      <label
                        htmlFor="withdrawal-release-phone"
                        className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-moss"
                      >
                        M-Pesa number
                      </label>
                      <input
                        id="withdrawal-release-phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={releasePhone}
                        onChange={(event) => setReleasePhone(event.target.value)}
                        placeholder="07XX XXX XXX"
                        maxLength={20}
                        className="mt-1.5 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                      />
                      <p className="mt-1.5 text-[11px] text-moss-faint">
                        Starts with the number the requester saved. Change it if the money should land on a different line.
                      </p>
                      <p className="mt-1.5 text-[11px] text-moss-faint">
                        This sends a B2C payout from the paybill. Paybill payouts are whole shillings.
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-moss-faint">
                      Records the withdrawal as paid by{" "}
                      {releaseMethod === "bank_transfer"
                        ? "bank transfer"
                        : releaseMethod === "mpesa"
                          ? "M-Pesa"
                          : releaseMethod}. The fund is debited now and an expense record is written.
                    </p>
                  )}
                </div>
              )}


              {(respondMode === "decline" || inFlight || isReversed) && (
                <div className="mt-3">
                  {respondMode === "decline" && (
                    <label
                      htmlFor="withdrawal-decline-reason"
                      className="block text-[11px] font-bold uppercase tracking-wide text-moss"
                    >
                      Reason for declining
                    </label>
                  )}
                  <textarea
                    id={respondMode === "decline" ? "withdrawal-decline-reason" : undefined}
                    rows={3}
                    maxLength={255}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={
                      respondMode === "decline"
                        ? "Why is this request being declined? The department reads this."
                        : "A short reply the department can read…"
                    }
                    className={`block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember ${
                      respondMode === "decline" ? "mt-1.5" : ""
                    }`}
                    autoFocus
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-sand-line pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setOpenAction(null);
                    setReply("");
                    setAccountReply("");
                  }}
                  className="rounded-xl border border-sand-mute bg-sand px-3.5 py-1.5 text-xs font-semibold text-bark transition hover:bg-sand-line"
                >
                  Cancel
                </button>

                {respondMode === "approve" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (approveAction) act(target.id, approveAction, reply, releasePhone, releaseMethod);
                    }}
                    disabled={busy || approveBlocked}
                    title={approveBlockedReason}
                    className="rounded-xl bg-ember px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Approve"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => act(target.id, "decline", reply)}
                    disabled={busy || !reply.trim() || (workspace === "treasury" && !canApproveTreasury)}
                    title={
                      workspace === "treasury" && !canApproveTreasury
                        ? "Assistant treasurers cannot decline withdrawal requests."
                        : !reply.trim()
                          ? "Say why the request is being declined."
                          : undefined
                    }
                    className="rounded-xl bg-ember px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-ember-deep disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Decline"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* The spending account as the receiving desk filed it: each item with
          its amount and its date, the filed receipts, and — for the treasury,
          on a submitted account — the accept or send-back answer. Other
          signatories read the same account but cannot answer it; the server
          only takes the treasury's word, and an accepted account is closed:
          the desk's form stays shut and the record cannot be edited. */}
      {accountingRow && (() => {
        const account = accountingRow.accountability;
        const lines = account ? readAccountingLines(account.notes) : [];
        const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0);
        const released = Number(accountingRow.amount);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Spending account for ${accountingRow.department}`}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-sand-line"
            >
              <div className="flex items-start justify-between gap-3 border-b border-sand-line pb-3">
                <div>
                  <h3 className="text-lg font-bold text-bark">Spending account</h3>
                  <p className="mt-0.5 text-xs text-moss">
                    {accountingRow.department} · {accountingRow.account_name} ·{" "}
                    KES {released.toLocaleString("en-KE", { minimumFractionDigits: 2 })} released
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAccountingRow(null);
                    setAccountReply("");
                  }}
                  aria-label="Close"
                  className="rounded-lg p-1 text-moss transition hover:bg-sand hover:text-bark"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!account ? (
                <p className="mt-3 text-xs italic text-moss">
                  Waiting on {accountingRow.department} to file how the money was spent.
                </p>
              ) : (
                <>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-moss">
                      Filed{account.submitted_by ? ` by ${account.submitted_by}` : ""}
                      {account.spent_on ? ` · spent ${dayFirst(account.spent_on)}` : ""}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        account.status === "accepted"
                          ? "bg-green-50 text-green-800"
                          : account.status === "returned"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {account.status === "accepted" ? "Accepted" : account.status === "returned" ? "Returned" : "Submitted"}
                    </span>
                  </div>

                  <div className="mt-2 overflow-hidden rounded-xl border border-sand-line">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-sand text-[10px] uppercase tracking-wider text-moss">
                          <th className="px-3 py-2 font-semibold">Item</th>
                          <th className="whitespace-nowrap px-3 py-2 font-semibold">Date</th>
                          <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Amount (KES)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sand-soft bg-white">
                        {lines.map((line, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 font-medium text-bark">{line.item || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-moss">{line.date || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-bark">
                              {line.amount !== null
                                ? line.amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={`mt-2 text-xs font-semibold ${total > released ? "text-red-700" : "text-moss"}`}>
                    Total KES {total.toLocaleString("en-KE", { minimumFractionDigits: 2 })} of KES{" "}
                    {released.toLocaleString("en-KE", { minimumFractionDigits: 2 })} released
                    {total > released
                      ? " — over the amount released"
                      : ` · KES ${(released - total).toLocaleString("en-KE", { minimumFractionDigits: 2 })} unspent`}
                  </p>

                  {account.receipts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {account.receipts.map((receipt) => (
                        <button
                          key={receipt.id}
                          type="button"
                          onClick={() => void openAccountReceipt(receipt)}
                          className="rounded-md border border-sand-mute bg-white px-2 py-1 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                        >
                          {receipt.filename}
                        </button>
                      ))}
                    </div>
                  )}
                  {account.status === "returned" && account.reply && (
                    <p className="mt-2 text-[11px] font-semibold text-red-600">
                      Sent back: “{account.reply}”
                    </p>
                  )}
                  {account.status === "accepted" && account.reviewed_by && (
                    <p className="mt-2 text-[11px] text-moss-faint">
                      Accepted by {account.reviewed_by} — the record is closed and the desk can no longer edit it.
                    </p>
                  )}

                  {account.status === "submitted" &&
                    (workspace === "treasury" ? (
                      <div className="mt-3 space-y-2 border-t border-sand-line pt-3">
                        <textarea
                          rows={2}
                          maxLength={255}
                          value={accountReply}
                          onChange={(e) => setAccountReply(e.target.value)}
                          placeholder="A note for the desk (required when sending it back)…"
                          className="block w-full resize-y rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-xs outline-none focus:border-ember"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void reviewAccountability(accountingRow, "returned")}
                            disabled={accountBusy || !accountReply.trim()}
                            className="rounded-lg border border-sand-mute px-2.5 py-1 text-[11px] font-semibold text-moss transition hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                          >
                            Send back for corrections
                          </button>
                          <button
                            type="button"
                            onClick={() => void reviewAccountability(accountingRow, "accepted")}
                            disabled={accountBusy}
                            className="rounded-lg bg-bark px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-bark/90 disabled:opacity-60"
                          >
                            {accountBusy ? "Saving…" : "Accept account"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 border-t border-sand-line pt-3 text-[11px] italic text-moss-faint">
                        Only the treasury can accept or send back this account.
                      </p>
                    ))}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* The bar is three columns of equal footing on a wide screen — count,
          the report, and an empty third — so the report sits in the middle of
          the bar instead of hiding at its right edge. The phone stacks them. */}
      <div className="shrink-0 flex flex-col gap-2 border-t border-sand-line bg-white px-4 py-3 text-xs text-moss sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3">
        <div>
          {filteredRows.length} {filteredRows.length === 1 ? "request" : "requests"}
          {filteredRows.length !== rows.length ? ` (filtered from ${rows.length})` : ""} ·{" "}
          <span className="text-moss">  <span className="text-moss">{filteredRows.filter((r) => ["pending", "pastor_approved", "elder_approved"].includes(r.status)).length} awaiting action</span></span>
        </div>
        {/* Refresh re-reads the request roll: gives a pending withdrawal its
            answer the instant it is approved elsewhere. Its icon lives in
            the header band now, beside the filters it serves. */}
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-self-center">
          <button
            type="button"
            onClick={openPrintModal}
            disabled={printing}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember shadow-xs disabled:opacity-60 sm:self-auto"
            aria-label="Choose filters and print withdrawal requests"
          >
            <Printer className={`h-3.5 w-3.5 ${printing ? "animate-spin" : ""}`} />
            <span>{printing ? "Preparing…" : "Print Requests"}</span>
          </button>
        </div>
        <span className="hidden sm:block" aria-hidden="true" />
      </div>

      {/* The print sheet: choose the status, the window and the search the
          paper carries, then print it or send that same report round the
          offices. The table behind the modal is left as the desk had it. */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose the withdrawal request filters"
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-sand-line"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sand-line px-5 pb-3 pt-5">
              <div>
                <h3 className="text-base font-bold text-bark">Withdrawal requests report</h3>
                <p className="mt-0.5 text-[11px] text-moss">
                  Choose what the paper carries. It prints exactly these rows.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                aria-label="Close"
                className="text-moss transition hover:text-bark"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-3">
              <div className="rounded-2xl border border-sand-line bg-sand-linen/40 p-3">
                <label htmlFor="withdrawal-print-status" className="block text-[11px] font-semibold uppercase tracking-wide text-moss">
                  Status
                </label>
                <select
                  id="withdrawal-print-status"
                  value={printStatus}
                  onChange={(event) => setPrintStatus(event.target.value as typeof printStatus)}
                  className="mt-1.5 block w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember"
                >
                  <option value="all">All requests</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-moss">
                  From
                  <DateField
                    value={printFrom}
                    onChange={setPrintFrom}
                    label="Requests from date"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-moss">
                  To
                  <DateField
                    value={printTo}
                    onChange={setPrintTo}
                    label="Requests to date"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-sand-line bg-sand-linen/40 p-3">
                <label htmlFor="withdrawal-print-search" className="block text-[11px] font-semibold uppercase tracking-wide text-moss">
                  Search
                </label>
                <input
                  id="withdrawal-print-search"
                  type="search"
                  value={printSearch}
                  onChange={(event) => setPrintSearch(event.target.value)}
                  placeholder="Department, account, purpose or requester…"
                  className="mt-1.5 block w-full rounded-xl border border-sand-line bg-white px-3 py-2 text-xs text-bark outline-none focus:border-ember"
                />
              </div>

              <p className="text-[11px] text-moss">
                {printRows.length} {printRows.length === 1 ? "request matches" : "requests match"} these filters.
              </p>
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-sand-line bg-sand-linen/40 px-5 py-3">
              {printRows.length === 0 && (
                <p className="text-center text-[11px] text-moss">No requests match these filters.</p>
              )}
              {workspace === "treasury" && (
                <button
                  type="button"
                  onClick={() => void sendReportForSignature()}
                  disabled={sendingForSignature || printing || printRows.length === 0}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-sand-mute bg-bark px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-bark/90 disabled:opacity-60"
                >
                  <Send className={`h-3.5 w-3.5 ${sendingForSignature ? "animate-pulse" : ""}`} aria-hidden="true" />
                  {sendingForSignature ? "Sending…" : "Send for signature"}
                </button>
              )}
              <button
                type="button"
                onClick={printReport}
                disabled={printing || sendingForSignature || printRows.length === 0}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ember px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark disabled:opacity-60"
              >
                <Printer className={`h-3.5 w-3.5 ${printing ? "animate-spin" : ""}`} aria-hidden="true" />
                {printing ? "Preparing…" : "Print requests"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type TreasuryDeskView = "accounts" | "expenditure" | "withdrawals";

/**
 * The desk answers three views. Anything else in the address bar — an old
 * `?view=income` link, or the retired `?view=unassigned` queue — opens Church
 * Accounts rather than a view that no longer exists: held payments are
 * written as rows in Individual Givings, with Assign on the row itself.
 */
const deskViewOf = (value?: string): TreasuryDeskView =>
  value === "expenditure" || value === "withdrawals" ? value : "accounts";

export function TreasuryAccountsManager({ initialView }: { initialView?: TreasuryDeskView } = {}) {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  // Two views over one desk: the accounts themselves and the spending that
  // leaves them. Church Accounts opens first — it is what the desk visits for.
  const router = useRouter();
  const [view, setView] = useState<TreasuryDeskView>(deskViewOf(initialView));

  useEffect(() => {
    if (initialView) {
      setView(deskViewOf(initialView));
    }
  }, [initialView]);

  // The treasury's six views, drawn once in the shell's header band. The two
  // ledgers live on the treasury page; the four desks here are this
  // page's own views. Rendering it through the band (rather than as a row in
  // this component's own header) is what keeps the treasury to a single line
  // of toggles — the band shows this strip instead of the section's pages.
  const { setCustomToggles, setHeaderRightAction, setCustomHeader, setHeadingFirst } = usePageHeader();
  // A phone reads the desk top-down the way the ledger does: the view's name
  // first, its search and filters under it, then the treasury strip. The
  // shell hides the heading on a phone unless a page asks to lead with it,
  // which left this desk's views unnamed in a hand.
  useEffect(() => {
    setHeadingFirst(true);
    return () => setHeadingFirst(false);
  }, [setHeadingFirst]);
  useEffect(() => {
    setCustomToggles(
      <TreasuryNav
        active={view === "accounts" ? "accounts" : view === "expenditure" ? "expenses" : "requests"}
        // This desk draws the accounts, the spending and the withdrawal queue
        // in place; every other chip walks to the page that holds it, by the
        // one address table in `treasury-nav`.
        onSelect={(next) => {
          if (next === "accounts") setView("accounts");
          else if (next === "expenses") setView("expenditure");
          else if (next === "requests") setView("withdrawals");
          else router.replace(TREASURY_VIEW_HREF[next]);
        }}
      />
    );
    return () => setCustomToggles(null);
  }, [setCustomToggles, view, router]);
  // The treasury desk maintains a static heading throughout all views.
  useEffect(() => {
    setCustomHeader({
      label: TREASURY_HEADING.label,
      description: TREASURY_HEADING.description,
      leading: (
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.replace("/administration?tab=overview", { scroll: false });
            }
          }}
          aria-label="Back"
          className="-ml-1 inline-flex items-center justify-center rounded-xl p-1.5 text-moss transition hover:bg-sand hover:text-bark"
        >
          <MoveLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      ),
    });
    return () => setCustomHeader(null);
  }, [setCustomHeader, router]);

  const [loading, setLoading] = useState(false);
  // One desk-wide row density, shared with the roster and the other tables.
  const rowPad = densityCellPad();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modals
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  // The statement being published from this desk. It opens on the ledger's own
  // month to date, so the treasurer reviews the figures rather than adding them
  // up from the accounts they are looking at.
  const [reportDraft, setReportDraft] = useState<Draft | null>(null);
  const [preparingReport, setPreparingReport] = useState(false);
  // The row actions menu, and the account being edited in its dialog.
  const [openMenuAccountId, setOpenMenuAccountId] = useState<number | null>(null);
  const [editAccount, setEditAccount] = useState<TreasuryAccount | null>(null);

  // Close the row actions menu on an outside click. The open menu is found by
  // a marker on its own wrapper, not by a ref: the roster and the phone cards
  // both render for every account, and a single ref only attaches to whichever
  // mounted last — so a press on the other surface was judged an outside
  // click, closing the menu before its click could land (the roster had the
  // same bug; see its handler for the fuller note).
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-action-menu]")) return;
      setOpenMenuAccountId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [showCreditDebitModal, setShowCreditDebitModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  // The account whose support link is being shared with the congregation.
  const [supportAccount, setSupportAccount] = useState<TreasuryAccount | null>(null);
  // The account being promoted into a fund drive. The creation form opens over
  // this desk so promoting never leaves the page; the drive is born here, and
  // only then does the officer move on to the drives console to manage it.
  const [promoteAccount, setPromoteAccount] = useState<TreasuryAccount | null>(null);

  // Department Account Assignments Setting modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignmentsConfig, setAssignmentsConfig] = useState<Record<string, number[]>>({});
  const [selectedDeptForAssign, setSelectedDeptForAssign] = useState<string>("");

  // Forms
  const [addForm, setAddForm] = useState({
    name: "",
    account_number: "",
    account_type: "bank",
    balance: "",
    description: "",
    department: "",
  });

  const [editForm, setEditForm] = useState({ name: "", description: "", account_number: "", account_type: "bank" as TreasuryAccount["account_type"], department: "" });

  const [creditDebitForm, setCreditDebitForm] = useState({
    account_id: "",
    action_type: "credit" as "credit" | "debit",
    amount: "",
    description: "",
    reference: "",
  });

  const [transferForm, setTransferForm] = useState({
    source_account_id: "",
    target_account_id: "",
    amount: "",
    description: "",
    reference: "",
  });

  const [submitting, setSubmitting] = useState(false);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json" };
  };

  const authErrors = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return (value as unknown[]).map(authErrors).filter(Boolean).join(" ");
    if (typeof value === "object") {
      const err = value as Record<string, unknown>;
      if (err.detail) return authErrors(err.detail);
      return Object.values(err)
        .map(authErrors)
        .filter(Boolean)
        .join(" ");
    }
    return "";
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/accounts/`, { headers: authHeaders() });
      if (res.ok) {
        // The desk sums what it is handed, so a payload that is not the
        // array the endpoint promises (an error body under a 200, a
        // proxy's reply) must leave the roll as it was rather than take
        // the whole page down at `.reduce`.
        const data = await res.json();
        if (Array.isArray(data)) setAccounts(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The church's departments and ministries, for connecting a fund to its
  // desk. One read on mount of the whole directory (`?all=true` is the same
  // record the Departments page browses); a connected account is what lets
  // the department's own desk read its balance and ask for withdrawals.
  const [departments, setDepartments] = useState<{ code: string; label: string }[]>([]);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/api/members/departments/?all=true`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const rows = ((data?.departments ?? []) as { code: string; label: string }[]).map((d) => ({
          code: d.code,
          label: d.label,
        }));
        setDepartments(rows);
      })
      .catch(() => setDepartments([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAssignModal = async () => {
    setShowAssignModal(true);
    setLoadingAssignments(true);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/department-assignments/`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, number[]> = {};
        if (Array.isArray(data.assignments)) {
          for (const item of data.assignments) {
            map[item.department_code] = item.account_ids || [];
          }
        }
        setAssignmentsConfig(map);
        if (!selectedDeptForAssign && departments.length > 0) {
          setSelectedDeptForAssign(departments[0].code);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingAssignments(false);
    }
  };

  const handleToggleAccountForDept = (deptCode: string, accountId: number) => {
    setAssignmentsConfig((prev) => {
      const current = prev[deptCode] || [];
      const updated = current.includes(accountId)
        ? current.filter((id) => id !== accountId)
        : [...current, accountId];
      return { ...prev, [deptCode]: updated };
    });
  };

  const handleSaveAssignments = async () => {
    setSavingAssignments(true);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/department-assignments/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ config: assignmentsConfig }),
      });
      if (res.ok) {
        void showAlert(
          "Assignments saved",
          "Treasury accounts have been assigned to ministries and departments successfully.",
          "success"
        );
        setShowAssignModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        void showAlert("Save failed", err.detail || "Could not save account assignments.", "error");
      }
    } catch {
      void showAlert("Network error", "Failed to connect to the server.", "error");
    } finally {
      setSavingAssignments(false);
    }
  };

  const totalLiquidity = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

  // The desk searches by description, the short prompt name, the account
  // number, or the connected department — the wordings the table itself shows.
  const [accountSearch, setAccountSearch] = useState("");
  const filteredAccounts = accounts.filter((a) => {
    const needle = accountSearch.trim().toLowerCase();
    if (!needle) return true;
    return `${a.description || ""} ${a.name} ${a.account_number || ""} ${a.department_name || ""}`.toLowerCase().includes(needle);
  });
  // Expenses has a search and a category of its own; the desk holds them so
  // they ride the same header slot as the accounts' search, one row for both.
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("all");
  // The header refresh reaches the rolls the views own: each panel hands
  // its re-read up when it mounts, and the band's lone icon spins while it
  // runs. One busy mark serves the desk — only one view stands at a time.
  const withdrawalRefreshRef = useRef<(() => void) | null>(null);
  const expenseRefreshRef = useRef<(() => void) | null>(null);
  const [deskRefreshBusy, setDeskRefreshBusy] = useState(false);
  const readWithdrawalRoll = useCallback(() => { void (async () => { setDeskRefreshBusy(true); try { await withdrawalRefreshRef.current?.(); } finally { setDeskRefreshBusy(false); } })(); }, []);
  const readExpenseRoll = useCallback(() => { void (async () => { setDeskRefreshBusy(true); try { await expenseRefreshRef.current?.(); } finally { setDeskRefreshBusy(false); } })(); }, []);
  // Withdrawal requests search and status filter (all / pending / approved / rejected)
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [withdrawalFilter, setWithdrawalFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  // Withdrawal requests date window — opened on the oldest ask still
  // waiting for the treasury's answer rather than a calendar guess, so an
  // unresponded request from any day is never hidden below the fold of the
  // month. Until the queue reports, the window stays open and unchecked.
  const [withdrawalFrom, setWithdrawalFrom] = useState("");
  const [withdrawalTo, setWithdrawalTo] = useState(localDate);
  // The default the queue itself opened the window on, so the filter summary
  // only calls the desk "filtered" once the treasurer leaves the default.
  const [withdrawalDefaultFrom, setWithdrawalDefaultFrom] = useState("");
  // The treasurer who moves the from date by hand keeps their own window:
  // once touched, loading the queue never rewrites it underneath them.
  const [withdrawalWindowTouched, setWithdrawalWindowTouched] = useState(false);
  // The spending window opens on the church's month to date — the same window
  // the treasury ledger and the report composer open on — so the desk
  // lands on what it is reviewing rather than on the whole history.
  const [expenseFrom, setExpenseFrom] = useState(firstDayOfMonth);
  const [expenseTo, setExpenseTo] = useState(localDate);

  /* What the queue is filtered under when it opens: the day the oldest ask
     still without the treasury's verdict was written — trail statuses are
     pending (pastor), pending (elder) and pending (treasurer) — falling back
     to the month to date when nothing waits. Rewritten on each queue load
     until the treasurer has moved the window by hand. */
  const askedOn = (row: { created_at: string }) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date(row.created_at));
  const oldestPendingDate = (loaded: { status: string; created_at: string }[]) => {
    let oldest = "";
    for (const row of loaded) {
      if (!["pending", "pastor_approved", "elder_approved"].includes(row.status)) continue;
      const day = askedOn(row);
      if (!oldest || day < oldest) oldest = day;
    }
    return oldest || firstDayOfMonth();
  };
  const handleWithdrawalRowsLoaded = useCallback(
    (loaded: WithdrawalRequestRow[]) => {
      if (withdrawalWindowTouched) return;
      const from = oldestPendingDate(loaded);
      setWithdrawalDefaultFrom(from);
      setWithdrawalFrom(from);
    },
    [withdrawalWindowTouched]
  );

  // The desk's search — and, on Expenses/Requests, its filters — rides the shell's
  // header beside the page's name, so the heading and its search share a row
  // and the toggles sit below both.
  useEffect(() => {
    if (view === "withdrawals") {
      // The date window and the state filter, written once and shown twice:
      // in the phone's popover and in the open on a wide screen — the same
      // pair the Expenses desk shows.
      const statusControl = (
        <select
          value={withdrawalFilter}
          onChange={(e) => setWithdrawalFilter(e.target.value as typeof withdrawalFilter)}
          className={FILTER_SELECT_CLASS}
          aria-label="Filter by status"
        >
          <option value="all">All requests</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      );
      const statusLabel =
        withdrawalFilter === "all" ? "All requests" : withdrawalFilter === "pending" ? "Pending" : withdrawalFilter === "approved" ? "Approved" : "Rejected";
      const windowed = withdrawalFrom !== withdrawalDefaultFrom || withdrawalTo !== localDate();
      setHeaderRightAction(
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {/* The phone: one button, the same three controls inside. */}
          <FilterPopover
            title="Request filters"
            summary={withdrawalFilter !== "all" ? statusLabel : windowed ? "This window" : "All requests"}
            active={withdrawalFilter !== "all" || windowed}
            minW={272}
          >
            <FilterSet label="Status">{statusControl}</FilterSet>
            <FilterSet label="From">
              <DateField value={withdrawalFrom} onChange={(iso) => { setWithdrawalFrom(iso); setWithdrawalWindowTouched(true); }} label="Requests from date" />
            </FilterSet>
            <FilterSet label="To">
              <DateField value={withdrawalTo} onChange={setWithdrawalTo} label="Requests to date" />
            </FilterSet>
          </FilterPopover>
          {/* The wider screens: the same controls, in the open. */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <div className="w-40">{statusControl}</div>
            <label className="flex items-center gap-1 text-xs font-medium text-moss">
              <span>From</span>
              <DateField value={withdrawalFrom} onChange={(iso) => { setWithdrawalFrom(iso); setWithdrawalWindowTouched(true); }} label="Requests from date" />
            </label>
            <label className="flex items-center gap-1 text-xs font-medium text-moss">
              <span>To</span>
              <DateField value={withdrawalTo} onChange={setWithdrawalTo} label="Requests to date" />
            </label>
          </div>
          <input
            type="text"
            placeholder="Search department, purpose, requester..."
            value={withdrawalSearch}
            onChange={(e) => setWithdrawalSearch(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-64"
            aria-label="Search withdrawal requests"
          />
          {/* The request roll's refresh, read the way every refresh on the
              system reads: a lone icon at the band's far right, beside the
              filters — a pending answer approved elsewhere shows the moment
              this is tapped. */}
          <button
            type="button"
            onClick={readWithdrawalRoll}
            disabled={deskRefreshBusy}
            aria-label="Refresh withdrawal requests"
            title="Refresh"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sand-mute bg-white text-bark shadow-sm transition hover:border-ember hover:text-ember disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${deskRefreshBusy ? "animate-spin" : ""}`} />
          </button>
        </div>
      );
      return () => setHeaderRightAction(null);
    }
    if (view === "expenditure") {
      // The category and the two dates, written once and shown twice: in the
      // phone's popover and in the open on a wide screen.
      const categoryControl = (
        <select
          value={expenseCategory}
          onChange={(e) => setExpenseCategory(e.target.value)}
          className={FILTER_SELECT_CLASS}
          aria-label="Filter expenditures by category"
        >
          <option value="all">All categories</option>
          {EXPENDITURE_CATEGORIES.map((category) => (
            <option key={category.key} value={category.key}>
              {category.label}
            </option>
          ))}
        </select>
      );
      const categoryLabel =
        EXPENDITURE_CATEGORIES.find((category) => category.key === expenseCategory)?.label ?? "All categories";
      const windowed = expenseFrom !== firstDayOfMonth() || expenseTo !== localDate();
      setHeaderRightAction(
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            type="text"
            placeholder="Search by title, payee or receipt..."
            value={expenseSearch}
            onChange={(e) => setExpenseSearch(e.target.value)}
            className="w-full min-w-0 flex-1 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-60 sm:flex-none"
            aria-label="Search expenditures"
          />
          {/* The phone: one button, the same three controls inside. */}
          <FilterPopover
            title="Expense filters"
            summary={expenseCategory === "all" ? (windowed ? "This window" : "All expenses") : categoryLabel}
            active={expenseCategory !== "all" || windowed}
            minW={272}
          >
            <FilterSet label="Category">{categoryControl}</FilterSet>
            <FilterSet label="From">
              <DateField value={expenseFrom} onChange={setExpenseFrom} label="Expenditures from date" />
            </FilterSet>
            <FilterSet label="To">
              <DateField value={expenseTo} onChange={setExpenseTo} label="Expenditures to date" />
            </FilterSet>
          </FilterPopover>
          {/* The wider screens: the same controls, in the open. */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <div className="w-44">{categoryControl}</div>
            <label className="flex items-center gap-1 text-xs font-medium text-moss">
              <span>From</span>
              <DateField value={expenseFrom} onChange={setExpenseFrom} label="Expenditures from date" />
            </label>
            <label className="flex items-center gap-1 text-xs font-medium text-moss">
              <span>To</span>
              <DateField value={expenseTo} onChange={setExpenseTo} label="Expenditures to date" />
            </label>
          </div>
          {/* The spending roll's refresh, beside the filters like every
              other refresh: the reader hands it the view's own re-read. */}
          <button
            type="button"
            onClick={readExpenseRoll}
            disabled={deskRefreshBusy}
            aria-label="Refresh expenditures"
            title="Refresh"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sand-mute bg-white text-bark shadow-sm transition hover:border-ember hover:text-ember disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${deskRefreshBusy ? "animate-spin" : ""}`} />
          </button>
        </div>
      );
      return () => setHeaderRightAction(null);
    }
    setHeaderRightAction(
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end">
        <input
          type="text"
          placeholder="Search by description, account..."
          value={accountSearch}
          onChange={(e) => setAccountSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-60 sm:flex-none"
          aria-label="Search church accounts"
        />
        {/* Refresh rides the top band on every screen width — at the
            search row's far right, the lone icon the whole system's
            refreshes wear. The foot carries the writes it guards, and a
            gift made on the go (M-Pesa, the giving desk) still shows the
            moment a hand taps this. */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={fetchAccounts}
          disabled={loading}
          className="h-9 w-9 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sand-mute bg-white text-bark shadow-sm transition hover:border-ember hover:text-ember disabled:opacity-60"
          aria-label="Refresh treasury accounts"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
    );
    return () => setHeaderRightAction(null);
  }, [setHeaderRightAction, view, accountSearch, expenseSearch, expenseCategory, expenseFrom, expenseTo, withdrawalSearch, withdrawalFilter, withdrawalFrom, withdrawalTo, loading, deskRefreshBusy, readWithdrawalRoll, readExpenseRoll]);

  /**
   * Publish a statement from the desk the treasurer is already sitting at.
   *
   * The period and the three figures come from the ledger's own month to date;
   * the form then opens for review, so the desk is confirming the church's
   * numbers rather than typing them out of the accounts in front of it.
   */
  const openReportComposer = async () => {
    setPreparingReport(true);
    let draft = blankDraft();
    try {
      const res = await fetch(`${API_URL}/api/members/reports/suggestions/`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        draft = {
          ...draft,
          title: data.title || draft.title,
          period_start: data.period_start || draft.period_start,
          period_end: data.period_end || draft.period_end,
          trust_fund: data.trust_fund ?? "",
          local_church_offerings: data.local_church_offerings ?? "",
          expenditure: data.expenditure ?? "",
        };
      }
    } catch {
      // A statement can still be written by hand if the totals do not arrive.
    }
    setPreparingReport(false);
    setReportDraft(draft);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/accounts/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...addForm,
          balance: addForm.balance || "0",
          // Empty string is "no department" — the church's own money.
          department: addForm.department || null,
        }),
      });
      if (res.ok) {
        setShowAddAccountModal(false);
        setAddForm({ name: "", account_number: "", account_type: "bank", balance: "", description: "", department: "" });
        // Account information is announced by a toast, the same way every
        // other desk's saved detail is — the banner is left for movements.
        showAlert("Account created", `${addForm.description || addForm.name} is on the desk.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        showAlert("Could not create account", err.detail || "Try again.", "error", { toast: true, timer: 4500, showConfirmButton: false });
      }
    } catch {
      showAlert("Could not create account", "The desk could not be reached.", "error", { toast: true, timer: 4500, showConfirmButton: false });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreditDebit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionMessage(null);
    const endpoint = creditDebitForm.action_type === "credit" ? "credit" : "debit";
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/accounts/${creditDebitForm.account_id}/${endpoint}/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          amount: creditDebitForm.amount,
          description: creditDebitForm.description || (creditDebitForm.action_type === "credit" ? "Manual Credit" : "Manual Debit"),
          reference: creditDebitForm.reference,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreditDebitModal(false);
        setCreditDebitForm({ account_id: "", action_type: "credit", amount: "", description: "", reference: "" });
        setActionMessage(data.detail || `Account ${endpoint}ed successfully.`);
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage(err.detail || `Failed to ${endpoint} account.`);
      }
    } catch {
      setActionMessage("Network error processing transaction.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/accounts/transfer/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(transferForm),
      });
      if (res.ok) {
        const data = await res.json();
        setShowTransferModal(false);
        setTransferForm({ source_account_id: "", target_account_id: "", amount: "", description: "", reference: "" });
        setActionMessage(data.detail || "Funds transferred successfully.");
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage(err.detail || "Failed to transfer funds.");
      }
    } catch {
      setActionMessage("Network error transferring funds.");
    } finally {
      setSubmitting(false);
    }
  };

  const openCreditDebitForAccount = (accId: number, type: "credit" | "debit") => {
    setCreditDebitForm({
      account_id: String(accId),
      action_type: type,
      amount: "",
      description: "",
      reference: "",
    });
    setShowCreditDebitModal(true);
  };

  /**
   * The link a member follows to give straight to one account.
   *
   * It is the public giving form's deep link (?purpose=), which opens the form
   * with that account already chosen — so an officer can paste it into a
   * WhatsApp group and the member only has to enter an amount.
   */
  const supportLinkFor = (account: TreasuryAccount) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sdalomalinda.or.ke";
    // The giving form keys accounts by their description (what givers read);
    // fall back to the short name for accounts that never got a description.
    const label = (account.description || account.name).trim();
    return `${origin}/give?purpose=${encodeURIComponent(label)}`;
  };

  const copySupportLink = async (account: TreasuryAccount) => {
    const link = supportLinkFor(account);
    try {
      await navigator.clipboard.writeText(link);
      showAlert("Link copied", `Paste it wherever members can act on it. It opens the giving form with ${account.name} already selected.`, "success");
    } catch {
      showAlert("Copy this link", link, "info");
    }
  };

  /** Promote an account: open the drive form with this account answering for it.
   *
   * The drive's account reference is the account's short name, which is exactly
   * what the M-Pesa prompt shows and what the drive's progress reads — so a
   * promoted account's money and its drive's totals are the same money.
   *
   * The form opens over this desk rather than navigating to the drives console;
   * the officer stays here until the drive actually exists.
   */
  const openPromoteForAccount = (account: TreasuryAccount) => {
    setOpenMenuAccountId(null);
    setPromoteAccount(account);
  };

  const openEditForAccount = (account: TreasuryAccount) => {
    setEditForm({
      name: account.name,
      description: account.description || "",
      account_number: account.account_number || "",
      account_type: account.account_type,
      department: account.department || "",
    });
    setEditAccount(account);
    setOpenMenuAccountId(null);
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAccount) return;
    setSubmitting(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/accounts/${editAccount.id}/`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          ...editForm,
          // Empty string is "no department" — the church's own money.
          department: editForm.department || null,
        }),
      });
      if (res.ok) {
        setEditAccount(null);
        showAlert("Account updated", `${editForm.description || editForm.name} keeps its new details.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        // The API's wording explains the 12-character M-Pesa cap by name.
        const detail = typeof err === "object" && err !== null ? Object.values(err).flat().join(" ") : "";
        showAlert("Could not update account", detail || "Try again.", "error", { toast: true, timer: 4500, showConfirmButton: false });
      }
    } catch {
      showAlert("Could not update account", "The desk could not be reached.", "error", { toast: true, timer: 4500, showConfirmButton: false });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAccount = async (account: TreasuryAccount, fromMenu?: boolean) => {
    if (!window.confirm(`Delete "${account.description || account.name}"? Its movement history goes with it.`)) return;
    setActionMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/accounts/${account.id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        if (fromMenu) setOpenMenuAccountId(null);
        showAlert("Account deleted", `${account.description || account.name} and its movement history are gone.`, "success", { toast: true, timer: 4000, showConfirmButton: false });
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        const detail = authErrors(err);
        showAlert("Could not delete account", detail || "Try again.", "error", { toast: true, timer: 4500, showConfirmButton: false });
      }
    } catch {
      showAlert("Could not delete account", "The desk could not be reached.", "error", { toast: true, timer: 4500, showConfirmButton: false });
    } finally {
      setSubmitting(false);
    }
  };

  const openTransferFromAccount = (sourceAccId: number) => {
    const target = accounts.find(a => a.id !== sourceAccId);
    setTransferForm({
      source_account_id: String(sourceAccId),
      target_account_id: target ? String(target.id) : "",
      amount: "",
      description: "",
      reference: "",
    });
    setShowTransferModal(true);
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case "bank":
        return <Landmark className="h-5 w-5 text-bark" />;
      case "mobile_money":
        return <Smartphone className="h-5 w-5 text-ember" />;
      case "cash":
        return <Wallet className="h-5 w-5 text-sage-strong" />;
      default:
        return <Building2 className="h-5 w-5 text-moss" />;
    }
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {actionMessage && (
        <div className="mx-5 mt-3 shrink-0 rounded-xl border border-sand-mute bg-white p-3 text-xs font-semibold text-bark shadow-xs sm:mx-6">
          {actionMessage}
        </div>
      )}

      {/* ── The chosen view lives here; the accounts table keeps the full
          height, while Expenses and the departments' withdrawal queue hand
          the space to their own desks. ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {view === "withdrawals" ? (
          <WithdrawalRequestsPanel search={withdrawalSearch} statusFilter={withdrawalFilter} fromDate={withdrawalFrom} toDate={withdrawalTo} onChanged={fetchAccounts} onLoaded={handleWithdrawalRowsLoaded} registerRefresh={(fn) => { withdrawalRefreshRef.current = fn; }} workspace="treasury" />
        ) : view === "expenditure" ? (
          <ExpenditureManager search={expenseSearch} category={expenseCategory} fromDate={expenseFrom} toDate={expenseTo} registerRefresh={(fn) => { expenseRefreshRef.current = fn; }} />
        ) : (
        /* Table on desktop, cards on phones — RecordList owns the breakpoint pair. */
        <RecordList
          rows={filteredAccounts}
          loading={loading}
          rowKey={(acc) => acc.id}
          tableWrapperClassName="flex-1 min-h-0 overflow-auto custom-table-scrollbar"
          tableClassName="w-full text-left text-sm"
          headClassName="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm"
          headRowClassName=""
          headCellClassName=""
          headers={[
            { label: "#", className: "w-12 px-4 py-3 text-left" },
            { label: "Description", className: "px-4 py-3" },
            { label: "Account", className: "px-4 py-3" },
            { label: "Account No.", className: "px-4 py-3" },
            { label: "Type", className: "px-4 py-3" },
            { label: "Balance (KES)", className: "px-4 py-3 text-right" },
            { label: "Actions", className: "px-4 py-3 text-center" },
          ]}
          loadingLabel="Loading treasury accounts..."
          stateClassName="px-4 py-12 text-center text-moss"
          tableEmptyClassName="px-4 py-12 text-center"
          tableEmpty={
            <>
              <p className="text-sm font-semibold text-bark">No Treasury Accounts configured yet.</p>
              <p className="mt-1 text-xs text-moss">Click &quot;Add Account&quot; below to set up bank, paybill, or cash accounts.</p>
            </>
          }
          cardsStateClassName="py-12 text-center text-sm text-moss"
          cardsEmpty={
            <>
              <Landmark className="mx-auto h-10 w-10 text-moss" />
              <p className="mt-3 text-sm font-semibold text-bark">No Treasury Accounts configured yet.</p>
              <p className="mt-1 text-xs text-moss">Tap &quot;Add Account&quot; below to set up bank, paybill, or cash accounts.</p>
            </>
          }
          cardsClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 custom-table-scrollbar"
          renderCard={(acc) => (                <div key={acc.id} className={`space-y-2 rounded-xl border border-sand-line bg-sand-linen text-xs ${"p-3.5"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="shrink-0 rounded-lg bg-white p-1.5">{getAccountIcon(acc.account_type)}</div>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-bark">{acc.name}</h4>
                      {acc.account_number && (
                        <p className="truncate font-mono text-[11px] text-moss">{acc.account_number}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-moss">
                    {acc.account_type_display || acc.account_type}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-moss">Balance</span>
                  <span className="text-sm font-bold text-bark">
                    KES {Number(acc.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {acc.description && <p className="text-[11px] leading-relaxed text-moss">{acc.description}</p>}
                {acc.department_name && (
                  <p className="text-[11px] font-semibold text-sage-strong">Connected to {acc.department_name}</p>
                )}
                <div className="mt-2 rounded-2xl border border-sand-line bg-white p-1.5" data-action-menu>
                  <button
                    onClick={() => setOpenMenuAccountId(openMenuAccountId === acc.id ? null : acc.id)}
                    aria-expanded={openMenuAccountId === acc.id}
                    aria-label={`Actions for ${acc.description || acc.name}`}
                    className="flex w-full items-center justify-between gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-bark transition hover:bg-sand"
                  >
                    <span className="text-moss">More</span>
                    <MoreVertical className="h-3.5 w-3.5 text-moss" />
                  </button>
                  {openMenuAccountId === acc.id && (
                    <div className="mt-1 w-46 rounded-2xl border border-sand-line bg-white p-1 shadow-2xl ring-1 ring-black/5">
                      {([
                        { label: "Credit", icon: <ArrowDownLeft className="h-4 w-4 text-sage-strong" />, run: () => { setOpenMenuAccountId(null); openCreditDebitForAccount(acc.id, "credit"); } },
                        { label: "Debit", icon: <ArrowUpRight className="h-4 w-4 text-alert" />, run: () => { setOpenMenuAccountId(null); openCreditDebitForAccount(acc.id, "debit"); } },
                        { label: "Transfer", icon: <ArrowRightLeft className="h-4 w-4 text-ember" />, run: () => { setOpenMenuAccountId(null); openTransferFromAccount(acc.id); }, disabled: accounts.length < 2 },
                        { label: "Promote", icon: <Megaphone className="h-4 w-4 text-sage-strong" />, run: () => { setOpenMenuAccountId(null); openPromoteForAccount(acc); } },
                        { label: "Support", icon: <HandHeart className="h-4 w-4 text-ember" />, run: () => { setOpenMenuAccountId(null); setSupportAccount(acc); } },
                        { label: "Edit", icon: <Pencil className="h-4 w-4 text-bark" />, run: () => { setOpenMenuAccountId(null); openEditForAccount(acc); } },
                        { label: "Delete", icon: <Trash2 className="h-4 w-4 text-alert" />, run: () => { setOpenMenuAccountId(null); handleDeleteAccount(acc); } },
                      ] as const).map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          disabled={"disabled" in action && action.disabled}
                          onClick={action.run}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {action.icon}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>            )}
          renderRow={(acc, idx) => (
                  <tr key={acc.id} className="hover:bg-sand-linen">
                    <td className={`px-4 ${rowPad} font-mono text-xs font-semibold text-moss`}>{idx + 1}</td>
                    <td className={`px-4 ${rowPad}`}>
                      <div className="flex items-center gap-2.5">
                        <div className="shrink-0 rounded-lg bg-sand p-1.5">{getAccountIcon(acc.account_type)}</div>
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-bark" title={acc.description || acc.name}>
                            {acc.description || acc.name}
                          </span>
                          {acc.department_name && (
                            <span className="block truncate text-[11px] text-sage-strong">
                              {acc.department_name}&apos;s fund
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 ${rowPad} font-mono text-xs font-semibold text-moss`} title="Shown in the M-Pesa prompt (max 12 characters)">
                      {acc.name}
                    </td>
                    <td className={`whitespace-nowrap px-4 ${rowPad} font-mono text-xs text-moss`}>{acc.account_number || "—"}</td>
                    <td className={`whitespace-nowrap px-4 ${rowPad}`}>
                      <span className="rounded-full bg-mist-select px-2.5 py-0.5 text-xs font-semibold text-sage">
                        {acc.account_type_display || acc.account_type}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 ${rowPad} text-right font-semibold text-bark`}>
                      KES {Number(acc.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`px-4 ${rowPad}`}>
                      <div className="relative flex items-center justify-center" data-action-menu>
                        <button
                          onClick={() => setOpenMenuAccountId(openMenuAccountId === acc.id ? null : acc.id)}
                          aria-expanded={openMenuAccountId === acc.id}
                          aria-label={`Actions for ${acc.description || acc.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-sand-mute bg-white px-2.5 py-1.5 text-xs font-semibold text-bark transition hover:bg-sand"
                        >
                          Actions
                          <MoreVertical className="h-3.5 w-3.5 text-moss" />
                        </button>
                        {openMenuAccountId === acc.id && (
                          <div className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-2xl border border-sand-line bg-white p-1.5 shadow-2xl ring-1 ring-black/5">
                            {([
                              { label: "Credit", icon: <ArrowDownLeft className="h-4 w-4 text-sage-strong" />, run: () => openCreditDebitForAccount(acc.id, "credit") },
                              { label: "Debit", icon: <ArrowUpRight className="h-4 w-4 text-alert" />, run: () => openCreditDebitForAccount(acc.id, "debit") },
                              { label: "Transfer", icon: <ArrowRightLeft className="h-4 w-4 text-ember" />, run: () => openTransferFromAccount(acc.id), disabled: accounts.length < 2 },
                              { label: "Promote", icon: <Megaphone className="h-4 w-4 text-sage-strong" />, run: () => openPromoteForAccount(acc) },
                              { label: "Support", icon: <HandHeart className="h-4 w-4 text-ember" />, run: () => setSupportAccount(acc) },
                              { label: "Edit", icon: <Pencil className="h-4 w-4 text-bark" />, run: () => openEditForAccount(acc) },
                              { label: "Delete", icon: <Trash2 className="h-4 w-4 text-alert" />, run: () => handleDeleteAccount(acc) },
                            ] as const).map((action) => (
                              <button
                                key={action.label}
                                type="button"
                                disabled={"disabled" in action && action.disabled}
                                onClick={() => { setOpenMenuAccountId(null); action.run(); }}
                                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-bark transition hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {action.icon}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
        />
        )}
      </div>

      {/* ── Footer: the accounts desk's own bar, in the shape the other tables
          use. The metrics live down here so the row under the toggles stays
          free for the table and its search; Expenses brings its own footer, so
          this bar steps aside for it. ── */}
      {view === "accounts" && (
        <div className="page-actions">
        {/* A phone reads this bar as two rows — the words the ledger keeps
           above the buttons that act — and one row on the wider screens,
           as it always read. */}
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 border-t border-sand-line bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-moss">
            <span>
              Total liquidity:{" "}
              <strong className="text-ember">
                KES {totalLiquidity.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
              </strong>
            </span>
            <span>
              Showing <strong className="text-bark">{filteredAccounts.length}</strong> of {accounts.length}{" "}
              {accounts.length === 1 ? "account" : "accounts"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
              {/* Refreshing re-reads the books without leaving the desk —
                  its icon lives in the header band now, beside the search
                  and the filters it serves, so the foot below carries only
                  the writes it guards. */}
              {/* The congregation's statement is written from the same desk that
                  keeps the accounts: publishing it is what tells members what
                  the month's giving and spending came to. */}
              <button
                type="button"
                onClick={openReportComposer}
                disabled={preparingReport}
                className="h-9 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sand-mute bg-white px-3 text-xs font-semibold text-bark shadow-sm transition hover:border-ember hover:text-ember disabled:opacity-60 sm:px-3.5"
              >
                <FileText className="h-4 w-4" />
                <span className="sm:hidden">{preparingReport ? "…" : "Report"}</span>
                <span className="hidden sm:inline">{preparingReport ? "Preparing…" : "Publish report"}</span>
              </button>
              <button
                type="button"
                onClick={openAssignModal}
                className="h-9 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-sand-mute bg-white px-3 text-xs font-semibold text-bark shadow-sm transition hover:border-ember hover:text-ember sm:px-3.5"
                title="Assign accounts to ministries and departments"
              >
                <Settings2 className="h-4 w-4 text-moss" />
                <span className="sm:hidden">Assign</span>
                <span className="hidden sm:inline">Assign Accounts</span>
              </button>
              {/* An account is the one way to a drive: each row can be Promoted,
                  which opens the drive form with that account answering for it.
                  A separate "Add Fund Drive" button was a second, disconnected
                  path to the same thing. */}
              <button
                type="button"
                onClick={() => setShowAddAccountModal(true)}
                className="h-9 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ember px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark sm:px-3.5"
              >
                <Plus className="h-4 w-4" />
                <span>Add Account</span>
              </button>
          </div>
        </div>
        </div>
      )}

      {/* Modal: Assign Accounts to Departments / Ministries */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-sand-line px-6 py-4">
              <div>
                <h3 className="text-base font-bold text-bark">Assign Accounts to Ministries & Departments</h3>
                <p className="mt-0.5 text-xs text-moss">
                  Configure which treasury funds are accessible at each ministry desk for viewing and withdrawal requests.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="rounded-full p-1.5 text-moss transition hover:bg-sand hover:text-bark"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            {loadingAssignments ? (
              <div className="flex flex-1 items-center justify-center p-12 text-xs font-semibold text-moss">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-ember" />
                Loading department assignments…
              </div>
            ) : (
              <div className="flex flex-1 min-h-0 flex-col md:flex-row">
                {/* Left side: Department List */}
                <div className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-sand-line overflow-y-auto max-h-48 md:max-h-[60vh] p-2 space-y-1">
                  <span className="block px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-moss">
                    Ministries & Departments
                  </span>
                  {departments.map((dept) => {
                    const assignedCount = (assignmentsConfig[dept.code] || []).length;
                    const isSelected = (selectedDeptForAssign || (departments[0]?.code ?? "")) === dept.code;
                    return (
                      <button
                        key={dept.code}
                        type="button"
                        onClick={() => setSelectedDeptForAssign(dept.code)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                          isSelected
                            ? "bg-ember text-white"
                            : "text-bark hover:bg-sand"
                        }`}
                      >
                        <span className="truncate">{dept.label}</span>
                        {assignedCount > 0 && (
                          <span
                            className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              isSelected ? "bg-white/20 text-white" : "bg-sand text-moss"
                            }`}
                          >
                            {assignedCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Right side: Accounts Checklist for selected department */}
                <div className="flex-1 min-h-0 overflow-y-auto p-5 max-h-[60vh]">
                  {(() => {
                    const activeDeptCode = selectedDeptForAssign || departments[0]?.code || "";
                    const activeDept = departments.find((d) => d.code === activeDeptCode);
                    const assignedAccIds = assignmentsConfig[activeDeptCode] || [];

                    if (!activeDept) {
                      return <div className="text-xs text-moss">Select a department on the left.</div>;
                    }

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-sand-line pb-3">
                          <div>
                            <h4 className="text-sm font-bold text-bark">{activeDept.label}</h4>
                            <p className="text-xs text-moss">
                              {assignedAccIds.length} account{assignedAccIds.length === 1 ? "" : "s"} assigned to this desk.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {accounts.map((acc) => {
                            const isAssigned = assignedAccIds.includes(acc.id);
                            return (
                              <label
                                key={acc.id}
                                className={`flex items-start gap-3 rounded-2xl border p-3 cursor-pointer transition ${
                                  isAssigned
                                    ? "border-ember bg-amber-50/50"
                                    : "border-sand-line bg-white hover:border-sand-mute hover:bg-sand-linen"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  onChange={() => handleToggleAccountForDept(activeDeptCode, acc.id)}
                                  className="mt-0.5 h-4 w-4 rounded text-ember focus:ring-ember"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="truncate text-xs font-bold text-bark">
                                      {acc.description || acc.name}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-moss">
                                    <span className="font-mono">{acc.name}</span>
                                    <span>•</span>
                                    <span>KES {Number(acc.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</span>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-sand-line px-6 py-4">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="rounded-full border border-sand-mute px-5 py-2 text-xs font-bold text-moss hover:bg-sand"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={savingAssignments || loadingAssignments}
                className="rounded-full bg-ember px-6 py-2 text-xs font-bold text-white hover:bg-ember-dark disabled:opacity-60"
              >
                {savingAssignments ? "Saving…" : "Save Assignments"}
              </button>
            </div>
          </div>
        </div>
      )}
      {reportDraft && (
        <ReportComposer
          report={null}
          initialDraft={reportDraft}
          onClose={() => setReportDraft(null)}
          onSaved={() => {
            setReportDraft(null);
            void showAlert(
              "Report published",
              "The statement is now on the congregation's Reports page under Giving.",
              "success"
            );
          }}
        />
      )}

      {/* Modal: the support link for one account, ready to send on */}
      {supportAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-6">
            <div>
              <h3 className="text-lg font-bold text-bark">Support {supportAccount.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-moss">
                Send this link to members, or paste it into a group. It opens the giving form with this account
                already chosen, so a member only has to enter an amount.
              </p>
            </div>
            <div className="rounded-2xl border border-sand-line bg-sand-linen p-3">
              <p className="break-all font-mono text-[11px] text-bark">{supportLinkFor(supportAccount)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copySupportLink(supportAccount)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-bark px-3 py-2 text-xs font-bold text-white transition hover:bg-moss-hover"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </button>
              <Link
                href={`/give?purpose=${encodeURIComponent(supportAccount.description || supportAccount.name)}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-bold text-bark transition hover:border-ember"
              >
                <HandHeart className="h-3.5 w-3.5 text-ember" />
                Open giving form
              </Link>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Support ${supportAccount.name}: ${supportLinkFor(supportAccount)}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-bold text-bark transition hover:border-ember"
              >
                <MessageCircle className="h-3.5 w-3.5 text-sage-strong" />
                Share on WhatsApp
              </a>
            </div>
            </div>
            {/* The always-visible close row at the foot — the requests modals' pattern. */}
            <div className="flex shrink-0 justify-end border-t border-sand-line px-6 pb-4 pt-3">
              <button
                type="button"
                onClick={() => setSupportAccount(null)}
                className="rounded-full border border-sand-mute px-5 py-2 text-xs font-bold text-moss transition hover:bg-sand"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote: the fund-drive form opens in place, so an account turns into
          a drive without this desk ever leaving the page. Only once the drive
          exists does the officer move on to the drives console. */}
      {promoteAccount && (
        <CampaignManagement
          key={promoteAccount.id}
          mode="admin"
          formOnly
          openCreate
          presetAccount={promoteAccount.name}
          presetAccountLabel={(promoteAccount.description || promoteAccount.name).trim()}
          onCreated={() => {
            setPromoteAccount(null);
            router.replace("/administration/fund-drives");
          }}
          onClosed={() => setPromoteAccount(null)}
        />
      )}

      {/* Modal 1: Add Account */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl animate-in fade-in zoom-in duration-150">
            <h3 className="shrink-0 px-6 pt-6 text-xl font-bold text-bark">Add Treasury Account</h3>
            <form onSubmit={handleAddAccount} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KCB Operating Account, Paybill 522522"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Account Type</label>
                  <select
                    value={addForm.account_type}
                    onChange={(e) => setAddForm({ ...addForm, account_type: e.target.value as any })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                  >
                    <option value="bank">Bank Account</option>
                    <option value="mobile_money">Mobile Money / Paybill</option>
                    <option value="cash">Petty Cash</option>
                    <option value="other">Other Account</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Account / Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. 1122334455"
                    value={addForm.account_number}
                    onChange={(e) => setAddForm({ ...addForm, account_number: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Initial Balance (KES)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={addForm.balance}
                  onChange={(e) => setAddForm({ ...addForm, balance: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Connected Department</label>
                <select
                  value={addForm.department}
                  onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                >
                  <option value="">None (the church&apos;s own money)</option>
                  {departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-moss">
                  The department whose desk may read this fund and request withdrawals from it. One fund per department.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional details about this account"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2 outline-none focus:border-ember"
                />
              </div>

              </div>

              {/* The always-visible action row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-sand-line px-6 pb-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="rounded-full border border-sand-mute px-5 py-2 text-xs font-bold text-moss hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-ember px-6 py-2 text-xs font-bold text-white hover:bg-ember-dark disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Account */}
      {editAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl animate-in fade-in zoom-in duration-150">
            <h3 className="shrink-0 px-6 pt-6 text-xl font-bold text-bark">Edit Treasury Account</h3>
            <form onSubmit={handleEditAccount} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Account Name</label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  title="Shown in the M-Pesa prompt (max 12 characters)"
                  placeholder="e.g. Tithe, Camporee"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
                <p className="mt-1 text-[11px] text-moss">
                  What M-Pesa shows in the prompt. Safaricom caps it at 12 characters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Description</label>
                <input
                  type="text"
                  maxLength={160}
                  placeholder="e.g. Adventist Men Ministry"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
                <p className="mt-1 text-[11px] text-moss">
                  What givers read on the giving form and in reports.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Account Type</label>
                  <select
                    value={editForm.account_type}
                    onChange={(e) => setEditForm({ ...editForm, account_type: e.target.value as TreasuryAccount["account_type"] })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                  >
                    <option value="bank">Bank Account</option>
                    <option value="mobile_money">Mobile Money / Paybill</option>
                    <option value="cash">Petty Cash</option>
                    <option value="other">Other Account</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Account / Ref #</label>
                  <input
                    type="text"
                    value={editForm.account_number}
                    onChange={(e) => setEditForm({ ...editForm, account_number: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Connected Department</label>
                <select
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                >
                  <option value="">None (the church&apos;s own money)</option>
                  {departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-moss">
                  The department whose desk may read this fund and request withdrawals from it. One fund per department.
                </p>
              </div>

              </div>

              {/* The always-visible action row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-sand-line px-6 pb-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditAccount(null)}
                  className="rounded-full border border-sand-mute px-5 py-2 text-xs font-bold text-moss hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-ember px-6 py-2 text-xs font-bold text-white hover:bg-ember-dark disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Credit / Debit Account */}
      {showCreditDebitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl animate-in fade-in zoom-in duration-150">
            <h3 className="shrink-0 px-6 pt-6 text-xl font-bold text-bark">Credit or Debit Account</h3>
            <form onSubmit={handleCreditDebit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Select Account</label>
                <select
                  required
                  value={creditDebitForm.account_id}
                  onChange={(e) => setCreditDebitForm({ ...creditDebitForm, account_id: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                >
                  <option value="">-- Choose Account --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Balance: KES {Number(a.balance).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Action Type</label>
                  <select
                    value={creditDebitForm.action_type}
                    onChange={(e) => setCreditDebitForm({ ...creditDebitForm, action_type: e.target.value as any })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                  >
                    <option value="credit">Credit (+ Deposit)</option>
                    <option value="debit">Debit (- Outflow)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Amount (KES)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={creditDebitForm.amount}
                    onChange={(e) => setCreditDebitForm({ ...creditDebitForm, amount: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Description / Reason</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank interest credit, Sound system deposit debit"
                  value={creditDebitForm.description}
                  onChange={(e) => setCreditDebitForm({ ...creditDebitForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Reference / Voucher # (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. CHQ-1002 or DEP-881"
                  value={creditDebitForm.reference}
                  onChange={(e) => setCreditDebitForm({ ...creditDebitForm, reference: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              </div>

              {/* The always-visible action row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-sand-line px-6 pb-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreditDebitModal(false)}
                  className="rounded-full border border-sand-mute px-5 py-2 text-xs font-bold text-moss hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`rounded-full px-6 py-2 text-xs font-bold text-white transition disabled:opacity-60 ${
                    creditDebitForm.action_type === "credit" ? "bg-sage-strong hover:bg-sage-deepest" : "bg-alert hover:bg-alert-deep"
                  }`}
                >
                  {submitting ? "Processing..." : creditDebitForm.action_type === "credit" ? "Credit Account" : "Debit Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Transfer Funds */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-xl animate-in fade-in zoom-in duration-150">
            <h3 className="shrink-0 px-6 pt-6 text-xl font-bold text-bark">Transfer Funds Between Accounts</h3>
            <form onSubmit={handleTransfer} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 pt-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">From Source Account (Debit)</label>
                <select
                  required
                  value={transferForm.source_account_id}
                  onChange={(e) => setTransferForm({ ...transferForm, source_account_id: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                >
                  <option value="">-- Choose Source Account --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Available: KES {Number(a.balance).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">To Target Account (Credit)</label>
                <select
                  required
                  value={transferForm.target_account_id}
                  onChange={(e) => setTransferForm({ ...transferForm, target_account_id: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                >
                  <option value="">-- Choose Target Account --</option>
                  {accounts
                    .filter((a) => String(a.id) !== transferForm.source_account_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} (Current: KES {Number(a.balance).toLocaleString()})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Amount to Transfer (KES)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Description / Purpose of Transfer</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. M-Pesa paybill sweep to KCB main account"
                  value={transferForm.description}
                  onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Reference (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. TRF-909"
                  value={transferForm.reference}
                  onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              </div>

              {/* The always-visible action row at the foot — the requests modals' pattern. */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-sand-line px-6 pb-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded-full border border-sand-mute px-5 py-2 text-xs font-bold text-moss hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-ember px-6 py-2 text-xs font-bold text-white hover:bg-ember-dark disabled:opacity-60"
                >
                  {submitting ? "Transferring..." : "Complete Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
