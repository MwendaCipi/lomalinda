"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  HandHeart,
  MessageCircle,
  FileText,
  MoreVertical,
  Share2,
  Clock,
  User,
  Landmark,
  X,
} from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { dayFirstTime } from "@/lib/dates";
import { RecordList } from "./record-list";
import { densityCellPad } from "@/lib/table-density";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Contribution = {
  id: string;
  raw_id: number;
  purpose: string;
  amount: string;
  donor_name: string;
  giver_phone?: string;
  giver_email?: string;
  payment_method: string;
  receipt_number: string;
  received_at: string;
  status: string;
  source: "digital" | "cash";
};

type TreasuryAccount = {
  id: number;
  name: string;
  account_number: string;
  account_type: string;
  account_type_display: string;
  balance: string | number;
  description: string;
  department: string | null;
  department_name: string;
  created_at: string;
};

type Department = {
  code: string;
  label: string;
};

const FUND_GIVING_PURPOSES = [
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

export function DepartmentContributionsTable({
  onRequestWithdrawal,
}: {
  onRequestWithdrawal?: (department: string, amount: string, reason: string) => void;
}) {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [sharing, setSharing] = useState<string | null>(null);
  const [contributions, setContributions] = useState<Record<string, Contribution[]>>({});
  const [loadingContributions, setLoadingContributions] = useState<string | null>(null);

  const rowPad = densityCellPad();

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/accounts/`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
        },
      });
      if (res.ok) setAccounts(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/members/departments/?all=true`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const rows = ((data?.departments ?? []) as { code: string; label: string }[]).map(
          (d) => ({ code: d.code, label: d.label })
        );
        setDepartments(rows);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const fetchContributions = useCallback(
    async (accountId: number, purpose: string) => {
      setLoadingContributions(purpose);
      try {
        const res = await fetch(
          `${API_URL}/api/members/treasury/purpose-contributions/?purpose=${encodeURIComponent(
            purpose
          )}&from_date=2026-01-01&to_date=2026-12-31`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          setContributions((prev) => ({
            ...prev,
            [purpose]: Array.isArray(data) ? data : [],
          }));
        }
      } catch {
        // ignore
      } finally {
        setLoadingContributions(null);
      }
    },
    []
  );

  const [accountSearch, setAccountSearch] = useState("");

  const getContributionsForDepartment = (departmentName: string): Contribution[] => {
    const allContributions: Contribution[] = [];
    const deptAccounts = accounts.filter((a) => {
      const code = a.department as string | null | undefined;
      return code === departmentName || code === null || code === undefined;
    });
    for (const account of deptAccounts) {
      const purpose = account.name;
      const contribs: Contribution[] = contributions[purpose] || [];
      for (const c of contribs) {
        allContributions.push({
          ...c,
          purpose: purpose,
        });
      }
    }
    return allContributions.sort(
      (a, b) => new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime()
    );
  };

  const departmentAccounts = accounts.filter((a) => a.department !== null && a.department !== undefined);

  const getAccountBalance = (account: TreasuryAccount): number => {
    return Number(account.balance || 0);
  };

  const shareOnWhatsApp = async (account: TreasuryAccount) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sdalomalinda.or.ke";
    const label = (account.description || account.name).trim();
    const link = `${origin}/give?purpose=${encodeURIComponent(label)}`;
    try {
      await navigator.clipboard.writeText(link);
      showAlert("Link copied", `Share this link on WhatsApp: ${link}`, "success");
    } catch {
      showAlert("Share via WhatsApp", link, "info");
    }
  };

  const requestWithdrawal = async (account: TreasuryAccount) => {
    if (!withdrawAmount || !withdrawReason) {
      showAlert("Missing details", "Enter the amount and reason for the withdrawal request.", "warning");
      return;
    }
    if (onRequestWithdrawal) {
      onRequestWithdrawal?.(account.department || "Church Accounts", withdrawAmount, withdrawReason);
    } else {
      showAlert("Request sent", `Withdrawal request for KES ${withdrawAmount} sent to the elders and treasurer.`, "success");
    }
    setWithdrawAmount("");
    setWithdrawReason("");
    setShowWithdrawModal(false);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
      {/* Department Selector */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by title, department or account..."
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              className="w-full rounded-xl border border-sand-mute bg-white px-4 py-2 text-sm outline-none focus:border-ember"
              aria-label="Search accounts"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedDepartment(null)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              selectedDepartment === null
                ? "bg-bark text-white shadow-sm"
                : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
            }`}
          >
            All departments
          </button>
          {departments.map((dept) => (
            <button
              key={dept.code}
              type="button"
              onClick={() => setSelectedDepartment(dept.code)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                selectedDepartment === dept.code
                  ? "bg-bark text-white shadow-sm"
                  : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
              }`}
            >
              {dept.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accounts Table */}
      <div className="space-y-4">
        {departmentAccounts
          .filter((acc) => {
            if (!accountSearch.trim()) return true;
            const needle = accountSearch.trim().toLowerCase();
            return (
              `${acc.description || ""} ${acc.name} ${acc.account_number || ""}`.toLowerCase().includes(needle)
            );
          })
          .map((account) => {
            const contributionsList = getContributionsForDepartment(account.department || "Church Accounts");
            const initialAmount = account.balance || "0";
            const hasAccount = account.name;
            const isEmpty = contributionsList.length === 0 && Number(account.balance || 0) === 0;

            return (
              <div key={account.id} className="rounded-2xl border border-sand-line bg-white shadow-sm">
                {/* Account Header */}
                <div className="p-4 border-b border-sand-line">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`rounded-lg p-2 ${account.account_type === "bank" ? "bg-bark/10" : account.account_type === "mobile_money" ? "bg-ember/10" : account.account_type === "cash" ? "bg-sage/10" : "bg-moss/10"}`}>
                        <Landmark className="h-5 w-5 text-bark" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-bark truncate">{account.name}</h3>
                        {account.description && (
                          <p className="text-xs text-moss truncate">{account.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => shareOnWhatsApp(account)}
                        disabled={String(sharing) === String(account.id)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-60"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Share on WhatsApp</span>
                        <span className="sm:hidden">Share</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowWithdrawModal(true)}
                        disabled={String(sharing) === String(account.id)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-ember bg-ember px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ember-dark disabled:opacity-60"
                      >
                        <ArrowDownLeft className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Request Withdrawal</span>
                        <span className="sm:hidden">Withdraw</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Account Details */}
                <div className="px-4 py-3 bg-sand-linen border-b border-sand-line">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-xs text-moss">
                      <span className="font-mono">{account.account_number || "—"}</span>
                      <span className="rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-semibold text-sage">
                        {account.account_type_display}
                      </span>
                      {account.department_name && (
                        <span className="rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-semibold text-sage-bright">
                          {account.department_name}&apos;s fund
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-bark">KES {Number(account.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</p>
                      <p className="text-[11px] text-moss">Initial amount</p>
                    </div>
                  </div>
                </div>

                {/* Contributions Table */}
                <div className="p-4">
                  {isEmpty ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-moss">No contributions recorded for this account.</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-moss">Individual Contributions</h4>
                          <span className="text-[11px] font-semibold text-sage">{contributionsList.length} entries</span>
                        </div>
                        <div className="h-px bg-sand-line" />
                      </div>

                      <RecordList
                        rows={contributionsList}
                        loading={loadingContributions === String(account.id)}
                        rowKey={(c) => c.id}
                        tableWrapperClassName="max-h-[320px] overflow-y-auto custom-table-scrollbar"
                        tableClassName="w-full text-left text-xs"
                        headClassName="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm"
                        headRowClassName=""
                        headCellClassName="px-3 py-2.5"
                        headers={[
                          { label: "#", className: "w-8 px-3 py-2.5 text-left" },
                          { label: "Date", className: "px-3 py-2.5" },
                          { label: "Giver", className: "px-3 py-2.5" },
                          { label: "Method", className: "px-3 py-2.5" },
                          { label: "Receipt", className: "px-3 py-2.5 text-right" },
                          { label: "Amount (KES)", className: "px-3 py-2.5 text-right" },
                        ]}
                        loadingLabel="Loading contributions..."
                        stateClassName="px-3 py-12 text-center text-moss"
                        tableEmptyClassName="px-3 py-12 text-center"
                        tableEmpty={
                          <>
                            <p className="text-sm font-semibold text-bark">No contributions yet</p>
                            <p className="mt-1 text-xs text-moss">Givers will appear here as they contribute to this account.</p>
                          </>
                        }
                        cardsStateClassName="py-12 text-center text-sm text-moss"
                        cardsEmpty={
                          <>
                            <MessageCircle className="mx-auto h-8 w-8 text-moss" />
                            <p className="mt-2 text-sm font-semibold text-bark">No contributions yet</p>
                            <p className="mt-1 text-xs text-moss">Givers will appear here as they contribute to this account.</p>
                          </>
                        }
                        cardsClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 custom-table-scrollbar"
                        renderCard={(c) => (
                          <div key={c.id} className="space-y-2 rounded-xl border border-sand-line bg-sand-linen p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-bark">{c.donor_name}</p>
                                <p className="text-[11px] text-moss">{c.payment_method}</p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.status === "completed" ? "bg-emerald-100 text-emerald-800" : c.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                                {c.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px] text-moss">
                              <span>{dayFirstTime(c.received_at)}</span>
                              <span className="font-mono">{c.receipt_number}</span>
                              <span className="font-bold text-bark">KES {Number(c.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        )}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}

        {departmentAccounts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm font-semibold text-bark">No accounts connected to departments</p>
            <p className="mt-1 text-xs text-moss">Connect treasury accounts to departments to see their contributions and funding.</p>
          </div>
        )}
      </div>

      {/* Withdrawal Request Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setShowWithdrawModal(false)}>
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="text-lg font-bold text-bark">Request withdrawal</h3>
              <button type="button" onClick={() => setShowWithdrawModal(false)} className="text-moss hover:text-bark">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-bark">Amount (KES) *</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="e.g. 5000.00"
                  className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-4 py-2.5 text-sm outline-none focus:border-ember"
                  min="1"
                  step="1"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-bark">Reason *</label>
                <textarea
                  value={withdrawReason}
                  onChange={(e) => setWithdrawReason(e.target.value)}
                  placeholder="Why is the withdrawal needed? Explain the purpose..."
                  className="mt-1 w-full rounded-xl border border-sand-mute bg-white px-4 py-2.5 text-sm outline-none focus:border-ember resize-y"
                  rows={3}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="rounded-xl border border-sand-mute px-4 py-2 text-xs font-semibold text-moss transition hover:bg-sand"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => requestWithdrawal(accounts.find((a) => a.id === Number(sharing))!)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-dark"
              >
                <ArrowDownLeft className="h-4 w-4" />
                Request withdrawal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
