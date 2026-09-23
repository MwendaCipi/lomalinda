"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Building2, Smartphone, Wallet, Landmark, HandHeart, Copy, MessageCircle } from "lucide-react";
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
  const [view, setView] = useState<"accounts" | "transactions">("accounts");
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modals
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
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
    return `${origin}/give?purpose=${encodeURIComponent(account.name)}`;
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
      {/* ── Header: which of the two tables is showing, and the way between them ── */}
      <div className="flex shrink-0 flex-col gap-3 border-b border-[#dfdbd1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
          <h2 className="text-xl font-bold text-[#26352f]">Treasury Accounts</h2>
          <p className="text-xs text-[#617068]">
            {view === "accounts"
              ? `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`
              : `${transactions.length} ${transactions.length === 1 ? "movement" : "movements"}`}
          </p>
        </div>
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
          rows={accounts}
          loading={loading}
          rowKey={(acc) => acc.id}
          tableWrapperClassName="flex-1 min-h-0 overflow-auto custom-table-scrollbar"
          tableClassName="w-full text-left text-sm"
          headClassName="sticky top-0 z-10 bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068] shadow-sm"
          headRowClassName=""
          headCellClassName=""
          headers={[
            { label: "#", className: "w-12 px-4 py-3 text-left" },
            { label: "Account", className: "px-4 py-3" },
            { label: "Account No.", className: "px-4 py-3" },
            { label: "Type", className: "px-4 py-3" },
            { label: "Description", className: "px-4 py-3" },
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
                <div className="flex items-center gap-2 border-t border-[#eeeae2] pt-2">
                  <button
                    onClick={() => openCreditDebitForAccount(acc.id, "credit")}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#eef2ed] px-2.5 py-1 text-[11px] font-bold text-[#3d7146] transition hover:bg-[#dce6da]"
                  >
                    <ArrowDownLeft className="h-3 w-3" />
                    <span>Credit</span>
                  </button>
                  <button
                    onClick={() => openCreditDebitForAccount(acc.id, "debit")}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#fdf2f2] px-2.5 py-1 text-[11px] font-bold text-[#b91c1c] transition hover:bg-[#fde8e8]"
                  >
                    <ArrowUpRight className="h-3 w-3" />
                    <span>Debit</span>
                  </button>
                  <button
                    onClick={() => openTransferFromAccount(acc.id)}
                    disabled={accounts.length < 2}
                    title="Transfer from this account"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1 text-[11px] font-bold text-[#26352f] transition hover:bg-[#f7f4ee] disabled:opacity-40"
                  >
                    <ArrowRightLeft className="h-3 w-3 text-[#b36b3c]" />
                    <span>Transfer</span>
                  </button>
                  <button
                    onClick={() => setSupportAccount(acc)}
                    title="Share a giving link for this account"
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1 text-[11px] font-bold text-[#26352f] transition hover:bg-[#f7f4ee]"
                  >
                    <HandHeart className="h-3 w-3 text-[#b36b3c]" />
                    <span>Support</span>
                  </button>
                </div>
              </div>            )}
          renderRow={(acc, idx) => (
                  <tr key={acc.id} className="hover:bg-[#faf7f2]">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#617068]">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-[#f7f4ee] p-1.5">{getAccountIcon(acc.account_type)}</div>
                        <span className="font-semibold text-[#26352f]">{acc.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[#617068]">{acc.account_number || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-[#eef2ed] px-2.5 py-0.5 text-xs font-semibold text-[#5f8067]">
                        {acc.account_type_display || acc.account_type}
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3 text-xs text-[#617068]" title={acc.description || undefined}>
                      {acc.description || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#26352f]">
                      KES {Number(acc.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openCreditDebitForAccount(acc.id, "credit")}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#eef2ed] px-2.5 py-1 text-xs font-semibold text-[#3d7146] transition hover:bg-[#dce6da]"
                        >
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                          <span>Credit</span>
                        </button>
                        <button
                          onClick={() => openCreditDebitForAccount(acc.id, "debit")}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#fdf2f2] px-2.5 py-1 text-xs font-semibold text-[#b91c1c] transition hover:bg-[#fde8e8]"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          <span>Debit</span>
                        </button>
                        <button
                          onClick={() => openTransferFromAccount(acc.id)}
                          disabled={accounts.length < 2}
                          title="Transfer from this account"
                          className="inline-flex items-center gap-1 rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1 text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee] disabled:opacity-40"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5 text-[#b36b3c]" />
                          <span>Transfer</span>
                        </button>
                        <button
                          onClick={() => setSupportAccount(acc)}
                          title="Share a giving link for this account"
                          className="inline-flex items-center gap-1 rounded-lg border border-[#c9c5bb] bg-white px-2.5 py-1 text-xs font-semibold text-[#26352f] transition hover:bg-[#f7f4ee]"
                        >
                          <HandHeart className="h-3.5 w-3.5 text-[#b36b3c]" />
                          <span>Support</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
          hidden={view !== "accounts"}
        />

        <RecordList
            rows={transactions}
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

      {/* ── Footer: one bar for both views, in the shape the other tables use ── */}
      <div className="flex shrink-0 flex-col gap-3 border-t border-[#dfdbd1] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#617068]">
          {view === "accounts" ? (
            <>
              <span>
                Showing <strong className="text-[#26352f]">{accounts.length}</strong> account
                {accounts.length === 1 ? "" : "s"}
              </span>
              <span>
                Total liquidity:{" "}
                <strong className="text-[#b36b3c]">
                  KES {totalLiquidity.toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                </strong>
              </span>
            </>
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
          <div className="flex items-center gap-2">
            {/* Transferring is a per-account action (each row has Transfer), so the
                footer offers the other thing a treasurer needs here: a new drive. */}
            <Link
              href="/administration/fund-drives?new=1"
              className="h-9 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#c9c5bb] bg-white px-3 text-xs font-semibold text-[#26352f] shadow-sm transition hover:bg-[#f7f4ee] sm:px-3.5"
            >
              <HandHeart className="h-4 w-4 text-[#b36b3c]" />
              <span>Add Fund Drive</span>
            </Link>
            <button
              type="button"
              onClick={() => setShowAddAccountModal(true)}
              className="h-9 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#b36b3c] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#96552e] sm:px-3.5"
            >
              <Plus className="h-4 w-4" />
              <span>Add Account</span>
            </button>
          </div>
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
                href={`/give?purpose=${encodeURIComponent(supportAccount.name)}`}
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

      {/* Modal 2: Credit / Debit Account */}
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

      {/* Modal 3: Transfer Funds */}
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
