"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Building2, Smartphone, Wallet, Landmark, HandHeart, Megaphone, Copy, MessageCircle, MoreVertical, Pencil, Trash2, FileText, Printer, SlidersHorizontal } from "lucide-react";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { CampaignManagement } from "@/components/campaign-management";
import { TreasuryNav } from "@/components/treasury-nav";
import { usePageHeader } from "@/components/app-frame";
import { showAlert } from "@/lib/alerts";
import { dayFirst, firstDayOfMonth, localDate } from "@/lib/dates";
import { RecordList } from "./record-list";
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
  status: "pending" | "elder_approved" | "approved" | "declined" | "reversed";
  requested_by: string;
  elder_approved_by: string | null;
  elder_approved_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  reply: string;
  created_at: string;
};

/**
 * Popover filter near the search input to toggle between All, Pending, Approved, and Rejected requests.
 */
function WithdrawalFilterPopover({
  value,
  onChange,
}: {
  value: "all" | "pending" | "approved" | "rejected";
  onChange: (v: "all" | "pending" | "approved" | "rejected") => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const labels: Record<string, string> = {
    all: "All",
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };

  return (
    <div className="relative inline-block shrink-0" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
          value !== "all"
            ? "border-ember bg-ember/10 text-ember"
            : "border-sand-mute bg-white text-bark hover:bg-sand"
        }`}
        aria-label="Filter withdrawal requests"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>{labels[value] ?? "All"}</span>
      </button>
      {open && (
        <div className="absolute right-0 sm:right-auto sm:left-0 top-full z-40 mt-1.5 w-44 rounded-2xl border border-sand-line bg-white p-1.5 text-left shadow-2xl ring-1 ring-black/5">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-moss-faint">
            Filter by status
          </p>
          {(
            [
              { key: "all", label: "All requests" },
              { key: "pending", label: "Pending" },
              { key: "approved", label: "Approved" },
              { key: "rejected", label: "Rejected" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                onChange(item.key);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                value === item.key
                  ? "bg-sand-linen text-ember"
                  : "text-bark hover:bg-sand"
              }`}
            >
              <span>{item.label}</span>
              {value === item.key && <span className="text-ember font-bold">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The departments' withdrawal queue — showing all non-reversed requests across
 * every department in a structured, actionable table.
 * Approval is a two-step process:
 *   1. An elder clears the request ("Elder Approve")
 *   2. The treasurer then approves (debiting the fund and reflecting in Expenses) or declines
 * Approved requests remain visible so the treasurer can reverse them if needed.
 */
function WithdrawalRequestsPanel({
  search = "",
  statusFilter = "all",
}: {
  search?: string;
  statusFilter?: "all" | "pending" | "approved" | "rejected";
} = {}) {
  const [rows, setRows] = useState<WithdrawalRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAction, setOpenAction] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const rowPad = densityCellPad();

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_URL}/api/members/department-withdrawals/review/`, { headers: fundAuthHeaders() })
      .then((res) => (res.ok ? res.json() : { requests: [] }))
      .then((data) => setRows(Array.isArray(data?.requests) ? data.requests : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) load(); });
    return () => { alive = false; };
  }, [load]);

  const act = async (id: number, action: string, extraReply?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/members/department-withdrawals/review/`, {
        method: "POST",
        headers: { ...fundAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, reply: (extraReply ?? "").trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not save the answer.");
      setOpenAction(null);
      setReply("");
      const messages: Record<string, [string, string]> = {
        elder_approve: ["Elder approval recorded", "The treasurer can now act on this request."],
        approve: ["Withdrawal approved", "The fund has been debited and reflected in Expenses."],
        decline: ["Request declined", "The desk has your reply."],
        reverse: ["Withdrawal reversed", "The fund has been credited back and expense record removed."],
      };
      const [title, msg] = messages[action] ?? ["Done", ""];
      showAlert(title, msg, "success");
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
      elder_approved: "bg-mist-select text-bark",
      approved: "bg-green-50 text-green-800",
      declined: "bg-red-50 text-red-700",
      reversed: "bg-sand text-moss",
    };
    const labels: Record<string, string> = {
      pending: "Pending",
      elder_approved: "Elder Approved",
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

  // The report is printed from the backend now: the same rows under the same
  // filters arrive as a real PDF — one that ends in three signature slots
  // (the authorizing officer, the one issuing, and the receiver), which the
  // browser's print dialog of the live table could never carry.
  const printReport = async () => {
    setPrinting(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${API_URL}/api/members/department-withdrawals/pdf/?${params.toString()}`, {
        headers: fundAuthHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not generate the report.");
      }
      const url = URL.createObjectURL(await res.blob());
      // The PDF opens in its own tab, where the browser offers print and
      // save; a blocked popup falls back to a download so the copy still lands.
      if (!window.open(url, "_blank")) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `Withdrawal_Requests_${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      showAlert("Could not print", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setPrinting(false);
    }
  };

  const filteredRows = rows.filter((row) => {
    if (statusFilter === "pending") {
      if (row.status !== "pending" && row.status !== "elder_approved") return false;
    } else if (statusFilter === "approved") {
      if (row.status !== "approved") return false;
    } else if (statusFilter === "rejected") {
      if (row.status !== "declined") return false;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const match =
        row.department.toLowerCase().includes(q) ||
        row.account_name.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q) ||
        row.requested_by.toLowerCase().includes(q) ||
        (row.elder_approved_by && row.elder_approved_by.toLowerCase().includes(q)) ||
        (row.decided_by && row.decided_by.toLowerCase().includes(q)) ||
        (row.reply && row.reply.toLowerCase().includes(q)) ||
        row.amount.includes(q);
      if (!match) return false;
    }
    return true;
  });

  if (loading) {
    return <p className="py-10 text-center text-xs text-moss">Loading the requests…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="m-5 rounded-2xl border border-dashed border-sand-line px-4 py-10 text-center">
        <p className="text-sm font-semibold text-bark">Nothing waiting</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-moss">
          When a department&apos;s leadership asks for money from its fund, the ask lands here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {filteredRows.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <div className="m-5 rounded-2xl border border-dashed border-sand-line px-4 py-10 text-center">
            <p className="text-sm font-semibold text-bark">No matching requests</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-moss">
              Try adjusting your search query or filter selection.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-table-scrollbar">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-xs">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Department & Account</th>
                <th className="px-4 py-3">Purpose & Details</th>
                <th className="px-4 py-3 text-right">Amount (KES)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right no-print">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-soft bg-white">
              {filteredRows.map((row) => (
                <tr key={row.id} className="transition hover:bg-sand-linen/60">
                  <td className={`whitespace-nowrap px-4 ${rowPad} text-moss font-mono text-[11px]`}>
                    {dayFirst(row.created_at)}
                  </td>
                  <td className={`px-4 ${rowPad} font-medium text-bark`}>
                    <p className="font-semibold text-bark">{row.department}</p>
                    <p className="text-[11px] text-moss-faint">{row.account_name}</p>
                  </td>
                  <td className={`px-4 ${rowPad} text-moss`}>
                    <p className="font-medium text-bark">{row.reason}</p>
                    <p className="text-[11px] text-moss-faint">
                      Asked by {row.requested_by} · Bal: KES {Number(row.account_balance).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </p>
                    {row.elder_approved_by && (
                      <p className="text-[10px] text-moss-faint">
                        Elder approved by {row.elder_approved_by}
                      </p>
                    )}
                    {row.decided_by && (row.status === "approved" || row.status === "declined") && (
                      <p className="text-[10px] italic text-moss-faint">
                        {row.status === "approved" ? "Approved" : "Rejected"} by {row.decided_by}
                        {row.reply ? ` — &ldquo;${row.reply}&rdquo;` : ""}
                      </p>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-4 ${rowPad} text-right font-bold text-bark`}>
                    KES {Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`whitespace-nowrap px-4 ${rowPad} text-center`}>
                    {statusBadge(row.status)}
                  </td>
                  <td className={`whitespace-nowrap px-4 ${rowPad} text-right no-print`}>
                    <div className="flex justify-end gap-1.5">
                      {/* Step 1: Elder must approve before treasurer can act */}
                      {row.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => act(row.id, "elder_approve")}
                          disabled={busy}
                          className="rounded-lg border border-mist-select bg-mist-select/30 px-2.5 py-1 text-[11px] font-semibold text-bark transition hover:bg-mist-select/60 disabled:opacity-60"
                        >
                          Elder Approve
                        </button>
                      )}
                      {/* Step 2: Treasurer approves once elder has cleared it */}
                      {row.status === "elder_approved" && (
                        <button
                          type="button"
                          onClick={() => act(row.id, "approve")}
                          disabled={busy}
                          className="rounded-lg bg-bark px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-bark/90 disabled:opacity-60"
                        >
                          Approve
                        </button>
                      )}
                      {/* Respond: available while pending or elder_approved, to approve, or reject with a reply. */}
                      {(row.status === "pending" || row.status === "elder_approved") && (
                        <button
                          type="button"
                          onClick={() => setOpenAction(row.id)}
                          className="rounded-lg border border-sand-mute px-2.5 py-1 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                        >
                          Respond
                        </button>
                      )}
                      {/* Reverse: available after approval */}
                      {row.status === "approved" && (
                        <button
                          type="button"
                          onClick={() => {
                            showAlert(
                              "Reverse withdrawal?",
                              `This will credit KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })} back to ${row.account_name} and remove the corresponding expense record.`,
                              "warning",
                              {
                                showCancelButton: true,
                                confirmButtonText: "Yes, reverse it",
                                cancelButtonText: "Cancel",
                              }
                            ).then((result) => {
                              if (result.isConfirmed) act(row.id, "reverse");
                            });
                          }}
                          disabled={busy}
                          className="rounded-lg border border-sand-mute px-2.5 py-1 text-[11px] font-semibold text-moss transition hover:border-red-400 hover:text-red-600 disabled:opacity-60"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action modal: approve the request, or decline it with a reply. */}
      {openAction !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-sand-line">
            <h4 className="text-sm font-bold text-bark">Respond to request</h4>
            <p className="mt-0.5 text-xs text-moss">
              Ask the department&apos;s leadership to approve the request, or decline it with a reply explaining why the money cannot be released.
            </p>
            <textarea
              rows={3}
              maxLength={255}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="A short reply the department can read…"
              className="mt-3 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2 border-t border-sand-line pt-3">
              <button
                type="button"
                onClick={() => {
                  setOpenAction(null);
                  setReply("");
                }}
                className="rounded-xl border border-sand-mute px-3 py-1.5 text-xs font-semibold text-moss transition hover:text-bark"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = reply.trim() ? "decline" : "approve";
                  act(openAction, action, reply);
                }}
                disabled={busy}
                className="rounded-xl bg-bark px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-bark/90 disabled:opacity-60"
              >
                {busy ? "Saving…" : reply.trim() ? "Decline request" : "Approve request"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center justify-between border-t border-sand-line bg-white px-4 py-3 text-xs text-moss">
        <div>
          {filteredRows.length} {filteredRows.length === 1 ? "request" : "requests"}
          {filteredRows.length !== rows.length ? ` (filtered from ${rows.length})` : ""} ·{" "}
          <span className="text-moss">  <span className="text-moss">{filteredRows.filter((r) => r.status === "pending" || r.status === "elder_approved").length} awaiting action</span></span>
        </div>
        <button
          type="button"
          onClick={printReport}
          disabled={printing}
          className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember shadow-xs disabled:opacity-60"
          aria-label="Print withdrawal requests report"
        >
          <Printer className={`h-3.5 w-3.5 ${printing ? "animate-spin" : ""}`} />
          <span>{printing ? "Preparing…" : "Print"}</span>
        </button>
      </div>
    </div>
  );
}

type TreasuryDeskView = "accounts" | "expenditure" | "withdrawals";

/**
 * The desk answers three views. Anything else in the address bar — an old
 * `?view=income` link, say — opens Church Accounts rather than a view that no
 * longer exists.
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
  // ledgers live on the reconciliation page; the four desks here are this
  // page's own views. Rendering it through the band (rather than as a row in
  // this component's own header) is what keeps the treasury to a single line
  // of toggles — the band shows this strip instead of the section's pages.
  const { setCustomToggles, setHeaderRightAction, setCustomHeader } = usePageHeader();
  useEffect(() => {
    setCustomToggles(
      <TreasuryNav
        active={view === "accounts" ? "accounts" : view === "expenditure" ? "expenses" : "requests"}
        onSelect={(next) => {
          if (next === "givings") router.push("/administration/reconciliation?mode=all_givings");
          else if (next === "summary") router.push("/administration/reconciliation?mode=summary");
          else if (next === "accounts") setView("accounts");
          else if (next === "drives") router.push("/administration/fund-drives");
          else if (next === "expenses") setView("expenditure");
          else setView("withdrawals");
        }}
      />
    );
    return () => setCustomToggles(null);
  }, [setCustomToggles, view, router]);
  // The desk answers three of the treasury's views under the console's
  // accounts tab, and the rail row that led here is named "Church Accounts".
  // Naming the view the treasurer chose keeps the shell's heading in step with
  // the toggle strip above, the way the ledger does for its two views.
  useEffect(() => {
    setCustomHeader(
      {
        accounts: { label: "Church Accounts", description: "The church's treasury accounts, their balances and their movements." },
        expenditure: { label: "Expenses", description: "Spending recorded against the church's accounts." },
        withdrawals: { label: "Requests", description: "The departments' asks for money from their funds." },
      }[view]
    );
    return () => setCustomHeader(null);
  }, [setCustomHeader, view]);

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
      if (res.ok) setAccounts(await res.json());
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
  // Withdrawal requests search and status filter (all / pending / approved / rejected)
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [withdrawalFilter, setWithdrawalFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  // The spending window opens on the church's month to date — the same window
  // the reconciliation ledger and the report composer open on — so the desk
  // lands on what it is reviewing rather than on the whole history.
  const [expenseFrom, setExpenseFrom] = useState(firstDayOfMonth);
  const [expenseTo, setExpenseTo] = useState(localDate);

  // The desk's search — and, on Expenses/Requests, its filters — rides the shell's
  // header beside the page's name, so the heading and its search share a row
  // and the toggles sit below both.
  useEffect(() => {
    if (view === "withdrawals") {
      setHeaderRightAction(
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <WithdrawalFilterPopover value={withdrawalFilter} onChange={setWithdrawalFilter} />
          <input
            type="text"
            placeholder="Search department, purpose, requester..."
            value={withdrawalSearch}
            onChange={(e) => setWithdrawalSearch(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-64"
            aria-label="Search withdrawal requests"
          />
        </div>
      );
      return () => setHeaderRightAction(null);
    }
    if (view === "expenditure") {
      setHeaderRightAction(
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="Search by title, payee or receipt..."
            value={expenseSearch}
            onChange={(e) => setExpenseSearch(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-60"
            aria-label="Search expenditures"
          />
          <select
            value={expenseCategory}
            onChange={(e) => setExpenseCategory(e.target.value)}
            className="w-full rounded-xl border border-sand-mute bg-white px-2.5 py-1.5 text-xs font-semibold text-bark outline-none focus:border-ember sm:w-auto"
            aria-label="Filter expenditures by category"
          >
            <option value="all">All categories</option>
            {EXPENDITURE_CATEGORIES.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <label className="flex items-center gap-1 text-xs font-medium text-moss">
              <span>From</span>
              <input
                type="date"
                value={expenseFrom}
                onChange={(e) => setExpenseFrom(e.target.value)}
                className="rounded-xl border border-sand-mute bg-white px-2 py-1 text-xs outline-none focus:border-ember"
                aria-label="Expenditures from date"
              />
            </label>
            <label className="flex items-center gap-1 text-xs font-medium text-moss">
              <span>To</span>
              <input
                type="date"
                value={expenseTo}
                onChange={(e) => setExpenseTo(e.target.value)}
                className="rounded-xl border border-sand-mute bg-white px-2 py-1 text-xs outline-none focus:border-ember"
                aria-label="Expenditures to date"
              />
            </label>
          </div>
        </div>
      );
      return () => setHeaderRightAction(null);
    }
    setHeaderRightAction(
      <input
        type="text"
        placeholder="Search by description, account..."
        value={accountSearch}
        onChange={(e) => setAccountSearch(e.target.value)}
        className="w-full min-w-0 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-60"
        aria-label="Search church accounts"
      />
    );
    return () => setHeaderRightAction(null);
  }, [setHeaderRightAction, view, accountSearch, expenseSearch, expenseCategory, expenseFrom, expenseTo, withdrawalSearch, withdrawalFilter]);

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
      showAlert("Link copied", `Paste it wherever members can act on it — it opens the giving form with ${account.name} already selected.`, "success");
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
      {/* ── The phone's way back. The six treasury views ride the shell's band
          above (see `TreasuryNav`) and the search rides the shell's header
          beside the page's name, so only the back arrow needs a row here; the
          metrics ride the footer below. ── */}
      <div className="flex shrink-0 items-center border-b border-sand-line px-5 py-1.5 sm:px-6 lg:hidden">
        <BackToOverviewArrow />
      </div>

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
          <WithdrawalRequestsPanel search={withdrawalSearch} statusFilter={withdrawalFilter} />
        ) : view === "expenditure" ? (
          <ExpenditureManager search={expenseSearch} category={expenseCategory} fromDate={expenseFrom} toDate={expenseTo} />
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
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-sand-line bg-white px-4 py-3 sm:px-6">
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
      )}

      {/* Modal: the church's financial statement, opened from the ledger's own
          month to date and published to members when the desk confirms it. */}
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
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-xl">
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
            <div className="flex justify-end border-t border-sand-line pt-3">
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
            router.push("/administration/fund-drives");
          }}
          onClosed={() => setPromoteAccount(null)}
        />
      )}

      {/* Modal 1: Add Account */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-150">
            <h3 className="text-xl font-bold text-bark">Add Treasury Account</h3>
            <form onSubmit={handleAddAccount} className="space-y-4 text-sm">
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
                  <option value="">None — the church&apos;s own money</option>
                  {departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-moss">
                  The department whose desk may read this fund and request withdrawals from it — the choir&apos;s Ensemble, the youth ministries&apos; AYM fund, and so on. One fund per department.
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

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sand-line">
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
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-150">
            <h3 className="text-xl font-bold text-bark">Edit Treasury Account</h3>
            <form onSubmit={handleEditAccount} className="space-y-4 text-sm">
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
                  What M-Pesa shows in the prompt — Safaricom caps it at 12 characters.
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
                  <option value="">None — the church&apos;s own money</option>
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

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sand-line">
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
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-150">
            <h3 className="text-xl font-bold text-bark">Credit or Debit Account</h3>
            <form onSubmit={handleCreditDebit} className="space-y-4 text-sm">
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

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sand-line">
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
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-150">
            <h3 className="text-xl font-bold text-bark">Transfer Funds Between Accounts</h3>
            <form onSubmit={handleTransfer} className="space-y-4 text-sm">
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

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sand-line">
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
