"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Building2, Smartphone, Wallet, Landmark, HandHeart, Megaphone, Copy, MessageCircle, MoreVertical, Pencil, Trash2, FileText } from "lucide-react";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { showAlert } from "@/lib/alerts";
import { dayFirst, dayFirstTime } from "@/lib/dates";
import { RecordList } from "./record-list";
import { ReportComposer, blankDraft, type Draft } from "./report-composer";
import { ExpenditureManager } from "./expenditure-manager";
import { densityCellPad } from "@/lib/table-density";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** The movement endpoint returns its newest rows up to this many; the log says so. */
const TRANSACTION_LOG_LIMIT = 150;

type TreasuryAccount = {
  id: number;
  name: string;
  account_number: string;
  account_type: "bank" | "mobile_money" | "cash" | "other";
  account_type_display: string;
  balance: string | number;
  description: string;
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
  requested_by: string;
  created_at: string;
};

/**
 * The departments' withdrawal queue — the treasurer's side of the fund
 * arrangement. A department's leadership sees its money on its own desk but
 * cannot move it; the asks land here, and answering one approves the debit
 * (the ledger line writes itself) or declines it with a word back.
 */
function WithdrawalRequestsPanel() {
  const [rows, setRows] = useState<WithdrawalRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
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
    // The state writes ride a microtask, which is what keeps the effect
    // from cascading the render.
    let alive = true;
    void Promise.resolve().then(() => {
      if (alive) load();
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const answer = async (id: number, approve: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/members/department-withdrawals/review/`, {
        method: "POST",
        headers: { ...fundAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ id, approve, reply: reply.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not save the answer.");
      setAnswering(null);
      setReply("");
      showAlert(
        approve ? "Withdrawal approved" : "Withdrawal declined",
        approve ? "The fund is debited and the desk has been told." : "The desk has your reply.",
        "success"
      );
      load();
    } catch (error) {
      showAlert("Could not save the answer", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

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
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-bark">
                  {row.department} — KES {Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-0.5 text-xs text-moss">{row.reason}</p>
                <p className="mt-1 text-[11px] text-moss-faint">
                  {row.account_name} holds KES {Number(row.account_balance).toLocaleString("en-KE", { minimumFractionDigits: 2 })} · asked by{" "}
                  {row.requested_by} · {dayFirst(row.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => answer(row.id, true)}
                  disabled={busy}
                  className="rounded-xl bg-bark px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-bark/90 disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setAnswering(answering === row.id ? null : row.id)}
                  className="rounded-xl border border-sand-mute px-3 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                >
                  Decline
                </button>
              </div>
            </div>
            {answering === row.id && (
              <div className="mt-3 border-t border-sand-line pt-3">
                <label className="block text-xs font-semibold text-bark">
                  Why are you declining?
                  <textarea
                    rows={2}
                    maxLength={255}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="The desk reads this with your answer."
                    className="mt-1 block w-full resize-y rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember"
                  />
                </label>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnswering(null);
                      setReply("");
                    }}
                    className="rounded-xl border border-sand-mute px-3 py-1.5 text-xs font-semibold text-moss transition hover:text-bark"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => answer(row.id, false)}
                    disabled={busy}
                    className="rounded-xl bg-bark px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-bark/90 disabled:opacity-60"
                  >
                    Decline request
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type AccountTransaction = {
  id: number;
  account: number;
  account_name: string;
  transaction_type: "credit" | "debit" | "transfer_in" | "transfer_out";
  transaction_type_display: string;
  amount: string | number;
  description: string;
  reference: string;
  related_account_name?: string;
  created_at: string;
};

export function TreasuryAccountsManager({ initialView }: { initialView?: "accounts" | "income" | "expenditure" | "withdrawals" } = {}) {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  // Three views over one desk: the accounts themselves, the movement log
  // behind them, and the spending that leaves them. Church Accounts opens
  // first — it is what the desk visits for.
  const router = useRouter();
  const [view, setView] = useState<"accounts" | "income" | "expenditure" | "withdrawals">(initialView ?? "accounts");
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

  // Forms
  const [addForm, setAddForm] = useState({
    name: "",
    account_number: "",
    account_type: "bank",
    balance: "",
    description: "",
  });

  const [editForm, setEditForm] = useState({ name: "", description: "", account_number: "", account_type: "bank" as TreasuryAccount["account_type"] });

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

  const fetchAccountsAndTransactions = async () => {
    setLoading(true);
    try {
      const [accRes, txRes] = await Promise.all([
        fetch(`${API_URL}/api/members/treasury/accounts/`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/members/treasury/account-transactions/`, { headers: authHeaders() }),
      ]);
      if (accRes.ok) setAccounts(await accRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountsAndTransactions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalLiquidity = accounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);

  // The desk searches by description, the short prompt name, or the account
  // number — the same three wordings the table itself shows.
  const [accountSearch, setAccountSearch] = useState("");
  const filteredAccounts = accounts.filter((a) => {
    const needle = accountSearch.trim().toLowerCase();
    if (!needle) return true;
    return `${a.description || ""} ${a.name} ${a.account_number || ""}`.toLowerCase().includes(needle);
  });
  const [transactionSearch, setTransactionSearch] = useState("");
  // The date window the Income view is read through — the ledger's own pair.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const withinWindow = (iso: string) => {
    const day = (iso || "").slice(0, 10);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    return true;
  };
  const filteredTransactions = transactions.filter((tx) => {
    if (!withinWindow(tx.created_at)) return false;
    const needle = transactionSearch.trim().toLowerCase();
    if (!needle) return true;
    const account = accounts.find((a) => a.id === tx.account);
    return `${tx.description || ""} ${tx.reference || ""} ${tx.account_name || ""} ${tx.related_account_name || ""} ${account?.description || ""} ${tx.transaction_type_display || tx.transaction_type}`
      .toLowerCase()
      .includes(needle);
  });

  /** Money arriving in an account (a credit, or the receiving half of a transfer). */
  const isCreditMovement = (tx: AccountTransaction) =>
    tx.transaction_type === "credit" || tx.transaction_type === "transfer_in";

  const moneyIn = transactions
    .filter(isCreditMovement)
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  const moneyOut = transactions
    .filter((tx) => !isCreditMovement(tx))
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

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
        }),
      });
      if (res.ok) {
        setShowAddAccountModal(false);
        setAddForm({ name: "", account_number: "", account_type: "bank", balance: "", description: "" });
        setActionMessage("Treasury account created successfully.");
        await fetchAccountsAndTransactions();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage(err.detail || "Failed to create treasury account.");
      }
    } catch {
      setActionMessage("Network error creating account.");
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
        await fetchAccountsAndTransactions();
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
        await fetchAccountsAndTransactions();
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
   */
  const openPromoteForAccount = (account: TreasuryAccount) => {
    const params = new URLSearchParams({ new: "1", account: account.name });
    const label = (account.description || account.name).trim();
    if (label) params.set("label", label);
    router.push(`/administration/fund-drives?${params.toString()}`);
  };

  const openEditForAccount = (account: TreasuryAccount) => {
    setEditForm({
      name: account.name,
      description: account.description || "",
      account_number: account.account_number || "",
      account_type: account.account_type,
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
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditAccount(null);
        setActionMessage("Treasury account updated.");
        await fetchAccountsAndTransactions();
      } else {
        const err = await res.json().catch(() => ({}));
        // The API's wording explains the 12-character M-Pesa cap by name.
        const detail = typeof err === "object" && err !== null ? Object.values(err).flat().join(" ") : "Failed to update account.";
        setActionMessage(detail || "Failed to update account.");
      }
    } catch {
      setActionMessage("Network error updating account.");
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
        setActionMessage("Treasury account deleted.");
        if (fromMenu) setOpenMenuAccountId(null);
        await fetchAccountsAndTransactions();
      } else {
        const err = await res.json().catch(() => ({}));
        const detail = authErrors(err);
        setActionMessage(detail || "Failed to delete account.");
      }
    } catch {
      setActionMessage("Network error deleting account.");
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
      {/* ── Header: the desk's three views as one segmented toggle, with the
          search and the date window beside them; the metrics ride the footer
          below, so this row is free for the controls. ── */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-sand-line px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 lg:flex-1">
            <span className="lg:hidden">
              <BackToOverviewArrow />
            </span>
            {/* The views, as one segmented toggle — the Contributions
                Ledger's own shape: chips riding inside a single sand pill. */}
            <div className="flex min-w-0 flex-1 rounded-xl border border-sand-mute bg-sand p-1">
              {([
                { key: "accounts", label: "Church Accounts" },
                { key: "income", label: "Income" },
                { key: "expenditure", label: "Expenditure" },
                { key: "withdrawals", label: "Requests" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setView(tab.key)}
                  aria-pressed={view === tab.key}
                  className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-center transition ${
                    view === tab.key ? "bg-bark text-white shadow-sm" : "text-moss hover:text-bark"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search and the date window ride beside the toggles. The
              expenditure view owns its own filter bar, so they step aside. */}
          {view !== "expenditure" && view !== "withdrawals" && (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <input
                type="text"
                placeholder={view === "accounts" ? "Search by description, account..." : "Search movements..."}
                value={view === "accounts" ? accountSearch : transactionSearch}
                onChange={(e) => (view === "accounts" ? setAccountSearch(e.target.value) : setTransactionSearch(e.target.value))}
                className="w-full min-w-0 rounded-xl border border-sand-line bg-sand px-4 py-2.5 text-xs focus:border-ember focus:outline-none sm:w-60"
                aria-label={view === "accounts" ? "Search church accounts" : "Search account movements"}
              />
              {view === "income" && (
                <div className="flex items-center justify-between gap-2 sm:justify-start">
                  <label className="flex items-center gap-1 text-xs font-medium text-moss">
                    <span>From</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="rounded-xl border border-sand-mute bg-white px-2.5 py-1.5 text-xs outline-none focus:border-ember"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs font-medium text-moss">
                    <span>To</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="rounded-xl border border-sand-mute bg-white px-2.5 py-1.5 text-xs outline-none focus:border-ember"
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {actionMessage && (
        <div className="mx-5 mt-3 shrink-0 rounded-xl border border-sand-mute bg-white p-3 text-xs font-semibold text-bark shadow-xs sm:mx-6">
          {actionMessage}
        </div>
      )}

      {/* ── The chosen view lives here; the accounts and income tables stay
          mounted, while Expenditure and the departments' withdrawal queue
          hand the space to their own desks. ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {view === "withdrawals" ? (
          <WithdrawalRequestsPanel />
        ) : view === "expenditure" ? (
          <ExpenditureManager embedded />
        ) : (
          <>
        {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair.
            Both stay mounted with the chosen one shown, so whichever is on screen
            keeps the full height of the workspace instead of sharing it. */}
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
              <p className="mt-1 text-xs text-moss">Click "Add Account" below to set up bank, paybill, or cash accounts.</p>
            </>
          }
          cardsStateClassName="py-12 text-center text-sm text-moss"
          cardsEmpty={
            <>
              <Landmark className="mx-auto h-10 w-10 text-moss" />
              <p className="mt-3 text-sm font-semibold text-bark">No Treasury Accounts configured yet.</p>
              <p className="mt-1 text-xs text-moss">Tap "Add Account" below to set up bank, paybill, or cash accounts.</p>
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
                        <span className="font-semibold text-bark" title={acc.description || acc.name}>
                          {acc.description || acc.name}
                        </span>
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
          hidden={view !== "accounts"}
        />

        <RecordList
            rows={filteredTransactions}
            loading={loading}
            rowKey={(tx) => tx.id}
            tableWrapperClassName="flex-1 min-h-0 overflow-auto custom-table-scrollbar"
            tableClassName="w-full text-left text-sm"
            headClassName="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm"
            headRowClassName=""
            headCellClassName=""
            headers={[
              { label: "Date", className: "px-4 py-3 text-left" },
              { label: "Account", className: "px-4 py-3" },
              { label: "Type", className: "px-4 py-3" },
              { label: "Amount (KES)", className: "px-4 py-3 text-right" },
              { label: "Description", className: "px-4 py-3" },
              { label: "Ref", className: "px-4 py-3" },
            ]}
            loadingLabel="Loading account transactions..."
            stateClassName="px-4 py-12 text-center text-moss"
            tableEmptyClassName="px-4 py-12 text-center"
            tableEmpty={
              <>
                <p className="text-sm font-semibold text-bark">No account transactions recorded yet.</p>
                <p className="mt-1 text-xs text-moss">
                  Credits, debits and transfers appear here the moment they are recorded.
                </p>
              </>
            }
            cardsStateClassName="py-12 text-center text-sm text-moss"
            cardsEmpty={
              <>
                <ArrowRightLeft className="mx-auto h-10 w-10 text-moss" />
                <p className="mt-3 text-sm font-semibold text-bark">No account transactions recorded yet.</p>
                <p className="mt-1 text-xs text-moss">
                  Credits, debits and transfers appear here the moment they are recorded.
                </p>
              </>
            }
            cardsClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 custom-table-scrollbar"
            renderCard={(tx) => {
              const isCredit = isCreditMovement(tx);
              return (
                <div key={tx.id} className={`space-y-2 rounded-xl border border-sand-line bg-sand-linen text-xs ${"p-3.5"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-bark">{tx.account_name}</h4>
                      <p className="text-[11px] text-moss">
                        {dayFirstTime(tx.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        isCredit ? "bg-mist-select text-sage-strong" : "bg-alert-wash text-alert"
                      }`}
                    >
                      {tx.transaction_type_display}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-moss">Amount</span>
                    <span className={`text-sm font-bold ${isCredit ? "text-sage-strong" : "text-alert"}`}>
                      {isCredit ? "+" : "−"}KES {Number(tx.amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-moss">
                    {tx.description}
                    {tx.related_account_name && <span className="ml-1">({tx.related_account_name})</span>}
                  </p>
                  {tx.reference && <p className="font-mono text-[11px] text-moss">Ref {tx.reference}</p>}
                </div>
              );
            }}
            renderRow={(tx) => {
              const isCredit = isCreditMovement(tx);
              return (
                <tr key={tx.id} className="hover:bg-sand-linen">
                  <td className={`whitespace-nowrap px-4 ${rowPad} text-xs text-moss`}>
                    {dayFirstTime(tx.created_at)}
                  </td>
                  <td className={`whitespace-nowrap px-4 ${rowPad} font-semibold text-bark`}>{tx.account_name}</td>
                  <td className={`whitespace-nowrap px-4 ${rowPad}`}>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                        isCredit ? "bg-mist-select text-sage-strong" : "bg-alert-wash text-alert"
                      }`}
                    >
                      {tx.transaction_type_display}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 ${rowPad} text-right font-semibold ${
                      isCredit ? "text-sage-strong" : "text-alert"
                    }`}
                  >
                    {isCredit ? "+" : "−"}
                    {Number(tx.amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`max-w-[280px] truncate px-4 ${rowPad} text-xs text-bark`} title={tx.description || undefined}>
                    {tx.description}
                    {tx.related_account_name && <span className="ml-1 text-moss">({tx.related_account_name})</span>}
                  </td>
                  <td className={`whitespace-nowrap px-4 ${rowPad} font-mono text-xs text-moss`}>
                    {tx.reference || "—"}
                  </td>
                </tr>
              );
            }}
            hidden={view !== "income"}
        />
          </>
        )}
      </div>

      {/* ── Footer: one bar for the desk's own tables, in the shape the other
          tables use. The metrics live down here so the row under the toggles
          stays free for the views, search and dates; Expenditure brings its
          own footer, so this bar steps aside for it. ── */}
      {view !== "expenditure" && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-sand-line bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-moss">
            {view === "accounts" ? (
              <>
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
              </>
            ) : (
              <>
                <span>
                  Showing <strong className="text-bark">{filteredTransactions.length}</strong> of {transactions.length} movement
                  {transactions.length === 1 ? "" : "s"}
                </span>
                <span>
                  In: <strong className="text-sage-strong">KES {moneyIn.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</strong>
                </span>
                <span>
                  Out: <strong className="text-alert">KES {moneyOut.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</strong>
                </span>
                {transactions.length >= TRANSACTION_LOG_LIMIT && (
                  <span>Only the most recent {TRANSACTION_LOG_LIMIT} movements are listed.</span>
                )}
              </>
            )}
          </div>
          {view === "accounts" && (
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
          )}
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
