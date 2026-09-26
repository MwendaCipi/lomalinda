"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Building2, Smartphone, Wallet, Landmark, HandHeart, Megaphone, Copy, MessageCircle, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { RecordList } from "./record-list";

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

export function TreasuryAccountsManager() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  // Two views over one set of data: the accounts themselves, and the movement
  // log behind them. Accounts opens first — it is what the desk visits for.
  const router = useRouter();
  const [view, setView] = useState<"accounts" | "transactions">("accounts");
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modals
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  // The row actions menu, and the account being edited in its dialog.
  const [openMenuAccountId, setOpenMenuAccountId] = useState<number | null>(null);
  const [editAccount, setEditAccount] = useState<TreasuryAccount | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setOpenMenuAccountId(null);
      }
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
  const filteredTransactions = transactions.filter((tx) => {
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
        return <Landmark className="h-5 w-5 text-[#26352f]" />;
      case "mobile_money":
        return <Smartphone className="h-5 w-5 text-[#b36b3c]" />;
      case "cash":
        return <Wallet className="h-5 w-5 text-[#3d7146]" />;
      default:
        return <Building2 className="h-5 w-5 text-[#617068]" />;
    }
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      {/* ── Header: which of the two tables is showing, its search, and the way between them ── */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[#dfdbd1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <h2 className="text-xl font-bold text-[#26352f]">Treasury Accounts</h2>
          <p className="text-xs text-[#617068]">
            {view === "accounts"
              ? `${filteredAccounts.length} of ${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`
              : `${filteredTransactions.length} of ${transactions.length} ${transactions.length === 1 ? "movement" : "movements"}`}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder={view === "accounts" ? "Search by description, account..." : "Search movements..."}
            value={view === "accounts" ? accountSearch : transactionSearch}
            onChange={(e) => (view === "accounts" ? setAccountSearch(e.target.value) : setTransactionSearch(e.target.value))}
            className="w-full min-w-0 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none sm:w-60"
            aria-label={view === "accounts" ? "Search treasury accounts" : "Search account transactions"}
          />
          <div
            className="flex h-[38px] shrink-0 items-center self-start rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] p-0.5 sm:self-auto"
            role="group"
            aria-label="Treasury view"
          >
            {([
              { key: "accounts" as const, label: `Accounts (${accounts.length})` },
              { key: "transactions" as const, label: `Transaction log (${transactions.length})` },
            ]).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setView(option.key)}
                aria-pressed={view === option.key}
                className={`h-8 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition ${
                  view === option.key ? "bg-[#26352f] text-white shadow-sm" : "text-[#617068] hover:text-[#26352f]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="mx-5 mt-3 shrink-0 rounded-xl border border-[#c9c5bb] bg-white p-3 text-xs font-semibold text-[#26352f] shadow-xs sm:mx-6">
          {actionMessage}
        </div>
      )}

      {/* ── Both tables live here; the chosen one is shown, and only its rows scroll ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Table on desktop, cards on phones — RecordList owns the breakpoint pair.
            Both stay mounted with the chosen one shown, so whichever is on screen
            keeps the full height of the workspace instead of sharing it. */}
        <RecordList
          rows={filteredAccounts}
          loading={loading}
          rowKey={(acc) => acc.id}
          tableWrapperClassName="flex-1 min-h-0 overflow-auto custom-table-scrollbar"
          tableClassName="w-full text-left text-sm"
          headClassName="sticky top-0 z-10 bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068] shadow-sm"
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
          stateClassName="px-4 py-12 text-center text-[#617068]"
          tableEmptyClassName="px-4 py-12 text-center"
          tableEmpty={
            <>
              <p className="text-sm font-semibold text-[#26352f]">No Treasury Accounts configured yet.</p>
              <p className="mt-1 text-xs text-[#617068]">Click "Add Account" below to set up bank, paybill, or cash accounts.</p>
            </>
          }
          cardsStateClassName="py-12 text-center text-sm text-[#617068]"
          cardsEmpty={
            <>
              <Landmark className="mx-auto h-10 w-10 text-[#617068]" />
              <p className="mt-3 text-sm font-semibold text-[#26352f]">No Treasury Accounts configured yet.</p>
              <p className="mt-1 text-xs text-[#617068]">Tap "Add Account" below to set up bank, paybill, or cash accounts.</p>
            </>
          }
          cardsClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 custom-table-scrollbar"
          renderCard={(acc) => (
              <div key={acc.id} className="space-y-2 rounded-xl border border-[#dfdbd1] bg-[#faf7f2] p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="shrink-0 rounded-lg bg-white p-1.5">{getAccountIcon(acc.account_type)}</div>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-[#26352f]">{acc.name}</h4>
                      {acc.account_number && (
                        <p className="truncate font-mono text-[11px] text-[#617068]">{acc.account_number}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[#617068]">
                    {acc.account_type_display || acc.account_type}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#617068]">Balance</span>
                  <span className="text-sm font-bold text-[#26352f]">
                    KES {Number(acc.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {acc.description && <p className="text-[11px] leading-relaxed text-[#617068]">{acc.description}</p>}
                <div className="mt-2 rounded-2xl border border-[#dfdbd1] bg-white p-1.5">
                  <button
                    onClick={() => setOpenMenuAccountId(openMenuAccountId === acc.id ? null : acc.id)}
                    aria-expanded={openMenuAccountId === acc.id}
                    aria-label={`Actions for ${acc.description || acc.name}`}
                    className="flex w-full items-center justify-between gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
                  >
                    <span className="text-[#617068]">More</span>
                    <MoreVertical className="h-3.5 w-3.5 text-[#617068]" />
                  </button>
                  {openMenuAccountId === acc.id && (
                    <div className="mt-1 w-46 rounded-2xl border border-[#dfdbd1] bg-white p-1 shadow-2xl ring-1 ring-black/5">
                      {([
                        { label: "Credit", icon: <ArrowDownLeft className="h-4 w-4 text-[#3d7146]" />, run: () => { setOpenMenuAccountId(null); openCreditDebitForAccount(acc.id, "credit"); } },
                        { label: "Debit", icon: <ArrowUpRight className="h-4 w-4 text-[#b91c1c]" />, run: () => { setOpenMenuAccountId(null); openCreditDebitForAccount(acc.id, "debit"); } },
                        { label: "Transfer", icon: <ArrowRightLeft className="h-4 w-4 text-[#b36b3c]" />, run: () => { setOpenMenuAccountId(null); openTransferFromAccount(acc.id); }, disabled: accounts.length < 2 },
                        { label: "Promote", icon: <Megaphone className="h-4 w-4 text-[#3d7146]" />, run: () => { setOpenMenuAccountId(null); openPromoteForAccount(acc); } },
                        { label: "Support", icon: <HandHeart className="h-4 w-4 text-[#b36b3c]" />, run: () => { setOpenMenuAccountId(null); setSupportAccount(acc); } },
                        { label: "Edit", icon: <Pencil className="h-4 w-4 text-[#26352f]" />, run: () => { setOpenMenuAccountId(null); openEditForAccount(acc); } },
                        { label: "Delete", icon: <Trash2 className="h-4 w-4 text-[#b91c1c]" />, run: () => { setOpenMenuAccountId(null); handleDeleteAccount(acc); } },
                      ] as const).map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          disabled={"disabled" in action && action.disabled}
                          onClick={action.run}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-40"
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
                  <tr key={acc.id} className="hover:bg-[#faf7f2]">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#617068]">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="shrink-0 rounded-lg bg-[#f7f4ee] p-1.5">{getAccountIcon(acc.account_type)}</div>
                        <span className="font-semibold text-[#26352f]" title={acc.description || acc.name}>
                          {acc.description || acc.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#617068]" title="Shown in the M-Pesa prompt (max 12 characters)">
                      {acc.name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#617068]">{acc.account_number || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-xs font-semibold text-[#5f8067]">
                        {acc.account_type_display || acc.account_type}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#26352f]">
                      KES {Number(acc.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative flex items-center justify-center" ref={openMenuAccountId === acc.id ? actionsMenuRef : undefined}>
                        <button
                          onClick={() => setOpenMenuAccountId(openMenuAccountId === acc.id ? null : acc.id)}
                          aria-expanded={openMenuAccountId === acc.id}
                          aria-label={`Actions for ${acc.description || acc.name}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
                        >
                          Actions
                          <MoreVertical className="h-3.5 w-3.5 text-[#617068]" />
                        </button>
                        {openMenuAccountId === acc.id && (
                          <div className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-2xl border border-[#dfdbd1] bg-white p-1.5 shadow-2xl ring-1 ring-black/5">
                            {([
                              { label: "Credit", icon: <ArrowDownLeft className="h-4 w-4 text-[#3d7146]" />, run: () => openCreditDebitForAccount(acc.id, "credit") },
                              { label: "Debit", icon: <ArrowUpRight className="h-4 w-4 text-[#b91c1c]" />, run: () => openCreditDebitForAccount(acc.id, "debit") },
                              { label: "Transfer", icon: <ArrowRightLeft className="h-4 w-4 text-[#b36b3c]" />, run: () => openTransferFromAccount(acc.id), disabled: accounts.length < 2 },
                              { label: "Promote", icon: <Megaphone className="h-4 w-4 text-[#3d7146]" />, run: () => openPromoteForAccount(acc) },
                              { label: "Support", icon: <HandHeart className="h-4 w-4 text-[#b36b3c]" />, run: () => setSupportAccount(acc) },
                              { label: "Edit", icon: <Pencil className="h-4 w-4 text-[#26352f]" />, run: () => openEditForAccount(acc) },
                              { label: "Delete", icon: <Trash2 className="h-4 w-4 text-[#b91c1c]" />, run: () => handleDeleteAccount(acc) },
                            ] as const).map((action) => (
                              <button
                                key={action.label}
                                type="button"
                                disabled={"disabled" in action && action.disabled}
                                onClick={() => { setOpenMenuAccountId(null); action.run(); }}
                                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-40"
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
            headClassName="sticky top-0 z-10 bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068] shadow-sm"
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
            stateClassName="px-4 py-12 text-center text-[#617068]"
            tableEmptyClassName="px-4 py-12 text-center"
            tableEmpty={
              <>
                <p className="text-sm font-semibold text-[#26352f]">No account transactions recorded yet.</p>
                <p className="mt-1 text-xs text-[#617068]">
                  Credits, debits and transfers appear here the moment they are recorded.
                </p>
              </>
            }
            cardsStateClassName="py-12 text-center text-sm text-[#617068]"
            cardsEmpty={
              <>
                <ArrowRightLeft className="mx-auto h-10 w-10 text-[#617068]" />
                <p className="mt-3 text-sm font-semibold text-[#26352f]">No account transactions recorded yet.</p>
                <p className="mt-1 text-xs text-[#617068]">
                  Credits, debits and transfers appear here the moment they are recorded.
                </p>
              </>
            }
            cardsClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 custom-table-scrollbar"
            renderCard={(tx) => {
              const isCredit = isCreditMovement(tx);
              return (
                <div key={tx.id} className="space-y-2 rounded-xl border border-[#dfdbd1] bg-[#faf7f2] p-3.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-[#26352f]">{tx.account_name}</h4>
                      <p className="text-[11px] text-[#617068]">
                        {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        isCredit ? "bg-[#eef2ed] text-[#3d7146]" : "bg-[#fdf2f2] text-[#b91c1c]"
                      }`}
                    >
                      {tx.transaction_type_display}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#617068]">Amount</span>
                    <span className={`text-sm font-bold ${isCredit ? "text-[#3d7146]" : "text-[#b91c1c]"}`}>
                      {isCredit ? "+" : "−"}KES {Number(tx.amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-[#617068]">
                    {tx.description}
                    {tx.related_account_name && <span className="ml-1">({tx.related_account_name})</span>}
                  </p>
                  {tx.reference && <p className="font-mono text-[11px] text-[#617068]">Ref {tx.reference}</p>}
                </div>
              );
            }}
            renderRow={(tx) => {
              const isCredit = isCreditMovement(tx);
              return (
                <tr key={tx.id} className="hover:bg-[#faf7f2]">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-[#617068]">
                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#26352f]">{tx.account_name}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                        isCredit ? "bg-[#eef2ed] text-[#3d7146]" : "bg-[#fdf2f2] text-[#b91c1c]"
                      }`}
                    >
                      {tx.transaction_type_display}
                    </span>
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                      isCredit ? "text-[#3d7146]" : "text-[#b91c1c]"
                    }`}
                  >
                    {isCredit ? "+" : "−"}
                    {Number(tx.amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="max-w-[280px] truncate px-4 py-3 text-xs text-[#26352f]" title={tx.description || undefined}>
                    {tx.description}
                    {tx.related_account_name && <span className="ml-1 text-[#617068]">({tx.related_account_name})</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#617068]">
                    {tx.reference || "—"}
                  </td>
                </tr>
              );
            }}
            hidden={view !== "transactions"}
        />
      </div>

      {/* ── Footer: one bar for both views, in the shape the other tables use ──
          One row on every screen: the stats on the left, the Add Account
          button on the right (the account count never earned the space it
          took from a phone's footer). */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#dfdbd1] bg-white px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#617068]">
          {view === "accounts" ? (
            <span>
              Total liquidity:{" "}
              <strong className="text-[#b36b3c]">
                KES {totalLiquidity.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
              </strong>
            </span>
          ) : (
            <>
              <span>
                Showing <strong className="text-[#26352f]">{transactions.length}</strong> movement
                {transactions.length === 1 ? "" : "s"}
              </span>
              <span>
                In: <strong className="text-[#3d7146]">KES {moneyIn.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</strong>
              </span>
              <span>
                Out: <strong className="text-[#b91c1c]">KES {moneyOut.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</strong>
              </span>
              {transactions.length >= TRANSACTION_LOG_LIMIT && (
                <span>Only the most recent {TRANSACTION_LOG_LIMIT} movements are listed.</span>
              )}
            </>
          )}
        </div>
        {view === "accounts" && (
          /* An account is the one way to a drive: each row can be Promoted,
              which opens the drive form with that account answering for it.
              A separate "Add Fund Drive" button was a second, disconnected
              path to the same thing. */
          <button
            type="button"
            onClick={() => setShowAddAccountModal(true)}
            className="h-9 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#b36b3c] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#96552e] sm:px-3.5"
          >
            <Plus className="h-4 w-4" />
            <span>Add Account</span>
          </button>
        )}
      </div>

      {/* Modal: the support link for one account, ready to send on */}
      {supportAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-xl">
            <div>
              <h3 className="text-lg font-bold text-[#26352f]">Support {supportAccount.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#617068]">
                Send this link to members, or paste it into a group. It opens the giving form with this account
                already chosen, so a member only has to enter an amount.
              </p>
            </div>
            <div className="rounded-2xl border border-[#dfdbd1] bg-[#faf7f2] p-3">
              <p className="break-all font-mono text-[11px] text-[#26352f]">{supportLinkFor(supportAccount)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copySupportLink(supportAccount)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#26352f] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#3a4a43]"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </button>
              <Link
                href={`/give?purpose=${encodeURIComponent(supportAccount.description || supportAccount.name)}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c]"
              >
                <HandHeart className="h-3.5 w-3.5 text-[#b36b3c]" />
                Open giving form
              </Link>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Support ${supportAccount.name}: ${supportLinkFor(supportAccount)}`)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#c9c5bb] bg-white px-3 py-2 text-xs font-bold text-[#26352f] transition hover:border-[#b36b3c]"
              >
                <MessageCircle className="h-3.5 w-3.5 text-[#3d7146]" />
                Share on WhatsApp
              </a>
            </div>
            <div className="flex justify-end border-t border-[#dfdbd1] pt-3">
              <button
                type="button"
                onClick={() => setSupportAccount(null)}
                className="rounded-full border border-[#c9c5bb] px-5 py-2 text-xs font-bold text-[#617068] transition hover:bg-[#f7f4ee]"
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
            <h3 className="text-xl font-bold text-[#26352f]">Add Treasury Account</h3>
            <form onSubmit={handleAddAccount} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KCB Operating Account, Paybill 522522"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Account Type</label>
                  <select
                    value={addForm.account_type}
                    onChange={(e) => setAddForm({ ...addForm, account_type: e.target.value as any })}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
                  >
                    <option value="bank">Bank Account</option>
                    <option value="mobile_money">Mobile Money / Paybill</option>
                    <option value="cash">Petty Cash</option>
                    <option value="other">Other Account</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Account / Ref #</label>
                  <input
                    type="text"
                    placeholder="e.g. 1122334455"
                    value={addForm.account_number}
                    onChange={(e) => setAddForm({ ...addForm, account_number: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Initial Balance (KES)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={addForm.balance}
                  onChange={(e) => setAddForm({ ...addForm, balance: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional details about this account"
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#dfdbd1]">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="rounded-full border border-[#c9c5bb] px-5 py-2 text-xs font-bold text-[#617068] hover:bg-[#f7f4ee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-[#b36b3c] px-6 py-2 text-xs font-bold text-white hover:bg-[#96552e] disabled:opacity-60"
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
            <h3 className="text-xl font-bold text-[#26352f]">Edit Treasury Account</h3>
            <form onSubmit={handleEditAccount} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Account Name</label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  title="Shown in the M-Pesa prompt (max 12 characters)"
                  placeholder="e.g. Tithe, Camporee"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
                <p className="mt-1 text-[11px] text-[#617068]">
                  What M-Pesa shows in the prompt — Safaricom caps it at 12 characters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Description</label>
                <input
                  type="text"
                  maxLength={160}
                  placeholder="e.g. Adventist Men Ministry"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
                <p className="mt-1 text-[11px] text-[#617068]">
                  What givers read on the giving form and in reports.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Account Type</label>
                  <select
                    value={editForm.account_type}
                    onChange={(e) => setEditForm({ ...editForm, account_type: e.target.value as TreasuryAccount["account_type"] })}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
                  >
                    <option value="bank">Bank Account</option>
                    <option value="mobile_money">Mobile Money / Paybill</option>
                    <option value="cash">Petty Cash</option>
                    <option value="other">Other Account</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Account / Ref #</label>
                  <input
                    type="text"
                    value={editForm.account_number}
                    onChange={(e) => setEditForm({ ...editForm, account_number: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#dfdbd1]">
                <button
                  type="button"
                  onClick={() => setEditAccount(null)}
                  className="rounded-full border border-[#c9c5bb] px-5 py-2 text-xs font-bold text-[#617068] hover:bg-[#f7f4ee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-[#b36b3c] px-6 py-2 text-xs font-bold text-white hover:bg-[#96552e] disabled:opacity-60"
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
            <h3 className="text-xl font-bold text-[#26352f]">Credit or Debit Account</h3>
            <form onSubmit={handleCreditDebit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Select Account</label>
                <select
                  required
                  value={creditDebitForm.account_id}
                  onChange={(e) => setCreditDebitForm({ ...creditDebitForm, account_id: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Action Type</label>
                  <select
                    value={creditDebitForm.action_type}
                    onChange={(e) => setCreditDebitForm({ ...creditDebitForm, action_type: e.target.value as any })}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
                  >
                    <option value="credit">Credit (+ Deposit)</option>
                    <option value="debit">Debit (- Outflow)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Amount (KES)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={creditDebitForm.amount}
                    onChange={(e) => setCreditDebitForm({ ...creditDebitForm, amount: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Description / Reason</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank interest credit, Sound system deposit debit"
                  value={creditDebitForm.description}
                  onChange={(e) => setCreditDebitForm({ ...creditDebitForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Reference / Voucher # (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. CHQ-1002 or DEP-881"
                  value={creditDebitForm.reference}
                  onChange={(e) => setCreditDebitForm({ ...creditDebitForm, reference: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#dfdbd1]">
                <button
                  type="button"
                  onClick={() => setShowCreditDebitModal(false)}
                  className="rounded-full border border-[#c9c5bb] px-5 py-2 text-xs font-bold text-[#617068] hover:bg-[#f7f4ee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`rounded-full px-6 py-2 text-xs font-bold text-white transition disabled:opacity-60 ${
                    creditDebitForm.action_type === "credit" ? "bg-[#3d7146] hover:bg-[#2e5735]" : "bg-[#b91c1c] hover:bg-[#991b1b]"
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
            <h3 className="text-xl font-bold text-[#26352f]">Transfer Funds Between Accounts</h3>
            <form onSubmit={handleTransfer} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">From Source Account (Debit)</label>
                <select
                  required
                  value={transferForm.source_account_id}
                  onChange={(e) => setTransferForm({ ...transferForm, source_account_id: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
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
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">To Target Account (Credit)</label>
                <select
                  required
                  value={transferForm.target_account_id}
                  onChange={(e) => setTransferForm({ ...transferForm, target_account_id: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3 py-2.5 outline-none focus:border-[#b36b3c]"
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
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Amount to Transfer (KES)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={transferForm.amount}
                  onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Description / Purpose of Transfer</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. M-Pesa paybill sweep to KCB main account"
                  value={transferForm.description}
                  onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Reference (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. TRF-909"
                  value={transferForm.reference}
                  onChange={(e) => setTransferForm({ ...transferForm, reference: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2.5 outline-none focus:border-[#b36b3c]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#dfdbd1]">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded-full border border-[#c9c5bb] px-5 py-2 text-xs font-bold text-[#617068] hover:bg-[#f7f4ee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-[#b36b3c] px-6 py-2 text-xs font-bold text-white hover:bg-[#96552e] disabled:opacity-60"
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
