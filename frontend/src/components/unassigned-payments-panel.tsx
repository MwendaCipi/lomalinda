"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** One paybill payment held for a treasurer's assignment. */
type HeldPayment = {
  id: number;
  amount: string;
  currency: string;
  typed_reference: string;
  mpesa_receipt_number: string;
  donor_name: string;
  phone_number: string;
  paid_at: string;
};

/** The accounts a held payment can be assigned to — the giving list, which is
 *  the treasury accounts in priority order. */
type AccountOption = { id: number; name: string; label: string };

/** dd/mm/yyyy from an ISO timestamp — the desk's own date reading. */
function dmy(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** An account the treasurer has checked, with the amount credited to it. */
type PickedAccount = { accountId: number; amount: string };

/**
 * The treasurer's queue of unassigned paybill payments.
 *
 * Safaricom delivers every paybill payment — typed references included — and a
 * reference that names no treasury account (a typo, a blank, a ministry kept
 * outside the treasury) lands here rather than being credited to nothing. The
 * treasurer checks one or more accounts and enters the amount for each; the
 * amounts must add up to the payment, and one press credits them all at the
 * payment's own date, so the month the money arrived stays correct however late
 * the assignment.
 */
export function UnassignedPaymentsPanel({ onAssigned }: { onAssigned?: () => void }) {
  const [rows, setRows] = useState<HeldPayment[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  /** row.id → checked accounts with their amounts */
  const [picked, setPicked] = useState<Record<number, PickedAccount[]>>({});

  const load = () => {
    fetch(`${API_URL}/api/members/treasury/unassigned/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch(`${API_URL}/api/members/giving-accounts/`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const pickedAmount = (rowId: number) =>
    picked[rowId]?.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) || 0;

  const toggleAccount = (row: HeldPayment, account: AccountOption) => {
    setPicked((prev) => {
      const current = prev[row.id] ?? [];
      const existing = current.find((p) => p.accountId === account.id);
      let next: PickedAccount[];
      if (existing) {
        next = current.filter((p) => p.accountId !== account.id);
      } else {
        // New account: seed its amount at the payment's remaining balance.
        const remaining = Number(row.amount) - pickedAmount(row.id);
        next = [...current, { accountId: account.id, amount: String(Math.max(0, remaining)) }];
      }
      return { ...prev, [row.id]: next };
    });
  };

  const updateAmount = (rowId: number, accountId: number, amount: string) => {
    setPicked((prev) => ({
      ...prev,
      [rowId]: (prev[rowId] ?? []).map((p) => (p.accountId === accountId ? { ...p, amount } : p)),
    }));
  };

  const canAssign = (rowId: number) => {
    const pickedForRow = picked[rowId];
    if (!pickedForRow || pickedForRow.length === 0) return false;
    const total = pickedForRow.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    return Math.abs(total - Number(rows.find((r) => r.id === rowId)?.amount || 0)) < 0.01;
  };

  const assign = (row: HeldPayment) => {
    const pickedForRow = picked[row.id];
    if (!pickedForRow || pickedForRow.length === 0) {
      showAlert("Choose an account", "Check at least one account to credit.", "warning");
      return;
    }
    const total = pickedForRow.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    if (Math.abs(total - Number(row.amount)) >= 0.01) {
      showAlert(
        "Amounts don't add up",
        `The amounts you entered (KES ${total.toLocaleString("en-KE")}) must equal the payment (KES ${Number(row.amount).toLocaleString("en-KE")}).`,
        "warning",
      );
      return;
    }
    setAssigningId(row.id);
    fetch(`${API_URL}/api/members/treasury/contributions/${row.id}/assign/`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        allocations: pickedForRow.map((p) => ({ account_id: p.accountId, amount: p.amount })),
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          showAlert("Payment assigned", data.detail || `Credited across ${pickedForRow.length} account(s).`, "success", {
            toast: true,
            timer: 3000,
            showConfirmButton: false,
          });
          setRows((prev) => prev.filter((r) => r.id !== row.id));
          setPicked((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          onAssigned?.();
        } else {
          showAlert("Could not assign", data.detail || "Try again.", "error");
        }
      })
      .catch(() => showAlert("Network error", "Could not reach the server.", "error"))
      .finally(() => setAssigningId(null));
  };

  if (!loading && rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <Check className="mx-auto h-8 w-8 text-ember" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-bark">Every payment is assigned</p>
          <p className="mt-1 text-xs leading-5 text-moss">
            Paybill payments whose reference names a treasury account land there directly. Anything Safaricom
            sends with an unknown reference waits here for the treasurer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 custom-table-scrollbar sm:px-6">
        {/* Phone cards */}
        <div className="space-y-3 lg:hidden">
          {rows.map((row) => {
            const rowPicked = picked[row.id] ?? [];
            const totalPicked = pickedAmount(row.id);
            return (
              <div key={row.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-bark">
                      KES {Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="mt-0.5 text-xs text-moss">
                      Typed: <span className="font-semibold text-bark">{row.typed_reference || "(blank)"}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-moss">
                      {row.mpesa_receipt_number} · {dmy(row.paid_at)}
                    </p>
                    {(row.donor_name || row.phone_number) && (
                      <p className="mt-0.5 text-[11px] text-moss">
                        {[row.donor_name, row.phone_number].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-ember" aria-hidden="true" />
                </div>
                <div className="mt-3 space-y-2">
                  {accounts.map((a) => {
                    const checked = rowPicked.some((p) => p.accountId === a.id);
                    const entry = rowPicked.find((p) => p.accountId === a.id);
                    return (
                      <label
                        key={a.id}
                        className="flex items-center gap-2 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAccount(row, a)}
                          className="h-3.5 w-3.5 rounded border-sand-line text-ember focus:ring-ember/30"
                        />
                        <span className={checked ? "font-semibold text-bark" : "text-moss"}>
                          {a.name} — {a.label}
                        </span>
                        {checked && (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={entry?.amount ?? ""}
                            onChange={(e) => updateAmount(row.id, a.id, e.target.value)}
                            className="min-w-0 w-20 rounded-lg border border-sand-line bg-white px-2 py-1 text-xs font-semibold text-bark text-right outline-none focus:border-ember"
                            aria-label={`Amount for ${a.name}`}
                          />
                        )}
                      </label>
                    );
                  })}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={totalPicked > 0 ? "font-semibold text-ember" : "text-moss"}>
                      {totalPicked > 0
                        ? "Credited: " + totalPicked.toLocaleString("en-KE", { minimumFractionDigits: 2 }) + (Number(row.amount) - totalPicked >= 0.01 ? " · " + (Number(row.amount) - totalPicked).toLocaleString("en-KE", { minimumFractionDigits: 2 }) + " remaining" : " · fully allocated")
                        : "KES " + Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 }) + " to allocate"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => assign(row)}
                    disabled={!canAssign(row.id) || assigningId === row.id}
                    className="w-full rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {assigningId === row.id ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-sand-line text-xs uppercase tracking-wider text-moss">
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Typed reference</th>
                <th className="py-2 pr-3">Receipt</th>
                <th className="py-2 pr-3">Paid</th>
                <th className="py-2 pr-3">Giver</th>
                <th className="py-2">Assign to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowPicked = picked[row.id] ?? [];
                const totalPicked = pickedAmount(row.id);
                return (
                  <tr key={row.id} className="border-b border-sand-line/60 align-middle hover:bg-sand">
                    <td className="py-2.5 pr-3 text-xs font-semibold text-bark">
                      KES {Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-bark">
                      <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
                        {row.typed_reference || "(blank)"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-[11px] text-moss">{row.mpesa_receipt_number}</td>
                    <td className="py-2.5 pr-3 text-xs text-moss">{dmy(row.paid_at)}</td>
                    <td className="py-2.5 pr-3 text-xs text-moss">
                      {[row.donor_name, row.phone_number].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {accounts.map((a) => {
                          const checked = rowPicked.some((p) => p.accountId === a.id);
                          const entry = rowPicked.find((p) => p.accountId === a.id);
                          return (
                            <label key={a.id} className="flex items-center gap-1.5 cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAccount(row, a)}
                                className="h-3 w-3 rounded border-sand-line text-ember focus:ring-ember/30"
                              />
                              <span className={checked ? "font-semibold text-bark" : "text-moss"}>
                                {a.name}
                              </span>
                              {checked && (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={entry?.amount ?? ""}
                                  onChange={(e) => updateAmount(row.id, a.id, e.target.value)}
                                  className="min-w-0 w-16 rounded-lg border border-sand-line bg-white px-1.5 py-1 text-xs font-semibold text-bark text-right outline-none focus:border-ember"
                                  aria-label={`Amount for ${a.name}`}
                                />
                              )}
                            </label>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className={totalPicked > 0 ? "font-semibold text-ember" : "text-moss"}>
                          {totalPicked > 0
                            ? `KES ${totalPicked.toLocaleString("en-KE", { minimumFractionDigits: 2 })} of KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`
                            : `KES ${Number(row.amount).toLocaleString("en-KE", { minimumFractionDigits: 2 })} to allocate`}
                        </span>
                        <button
                          type="button"
                          onClick={() => assign(row)}
                          disabled={!canAssign(row.id) || assigningId === row.id}
                          className="shrink-0 rounded-xl bg-ember px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {assigningId === row.id ? "Assigning…" : "Assign"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
