"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Undo2, Smartphone, Receipt, CircleAlert } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type RefundableContribution = {
  id: number;
  amount: string;
  purpose: string;
  donor_name: string;
  phone_number: string;
  mpesa_receipt_number: string;
  paid_at: string;
  refund: boolean;
  refund_status: "" | "pending" | "completed" | "failed";
};

type MpesaRefund = {
  id: number;
  amount: string;
  phone_number: string;
  reason: string;
  status: "pending" | "completed" | "failed";
  outcome_description: string;
  transaction_id: string;
  initiated_by_name: string;
  contribution_purpose: string;
  donor_name: string;
  contribution_receipt: string;
  completed_at: string | null;
  created_at: string;
};

function formatKes(value: string | number) {
  return `KES ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    completed: "bg-[#eef2ed] text-[#3d7146] border-[#dce6da]",
    failed: "bg-[#fdf2f2] text-[#b91c1c] border-[#fde8e8]",
  };
  const label = status || "pending";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${map[label] ?? "bg-[#f7f4ee] text-[#617068] border-[#dfdbd1]"}`}
    >
      {label}
    </span>
  );
}

export function MpesaRefundManager() {
  const [contributions, setContributions] = useState<RefundableContribution[]>([]);
  const [refunds, setRefunds] = useState<MpesaRefund[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  // Refund confirmation modal state
  const [refundTarget, setRefundTarget] = useState<RefundableContribution | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json" };
  };

  const fetchData = useCallback(async () => {
    try {
      const [contribRes, refundRes] = await Promise.all([
        fetch(`${API_URL}/api/members/treasury/refundable-contributions/`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/members/treasury/refunds/`, { headers: authHeaders() }),
      ]);
      if (contribRes.ok) setContributions(await contribRes.json());
      if (refundRes.ok) setRefunds(await refundRes.json());
    } catch {
      // ignore transient network errors; lists keep last known state
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // While a refund is pending, poll for the async B2C callback outcome.
  useEffect(() => {
    const hasPending = refunds.some((r) => r.status === "pending");
    if (hasPending && pollTimer.current === null) {
      pollTimer.current = setInterval(fetchData, 10000);
    } else if (!hasPending && pollTimer.current !== null) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    return () => {
      if (pollTimer.current !== null) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [refunds, fetchData]);

  const openRefundModal = (c: RefundableContribution) => {
    setRefundTarget(c);
    setReason("");
    setActionMessage(null);
    setActionError(false);
  };

  const handleRefundSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTarget) return;
    setSubmitting(true);
    setActionMessage(null);
    setActionError(false);
    try {
      const res = await fetch(
        `${API_URL}/api/members/treasury/contributions/${refundTarget.id}/refund/`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ phone_number: refundTarget.phone_number, reason }),
        }
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionMessage(
          `Refund of ${formatKes(refundTarget.amount)} to ${refundTarget.phone_number} submitted (status: ${data.status ?? "pending"}). The page updates automatically once Safaricom confirms.`
        );
        setRefundTarget(null);
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(true);
        setActionMessage(
          err.detail ||
            (err.contribution ? String(err.contribution) : "") ||
            "Failed to initiate refund."
        );
      }
    } catch {
      setActionError(true);
      setActionMessage("Network error initiating refund.");
    } finally {
      setSubmitting(false);
    }
  };

  const refundableCount = contributions.filter((c) => !c.refund).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#26352f]">M-Pesa Refunds</h2>
          <p className="mt-1 text-sm text-[#617068]">
            Refund completed M-Pesa contributions back to the member&apos;s phone and track each payout until Safaricom confirms it.
          </p>
        </div>
        <button
          onClick={async () => {
            setLoading(true);
            await fetchData();
            setLoading(false);
          }}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[#c9c5bb] bg-white px-4 py-2 text-xs font-bold text-[#26352f] transition hover:bg-[#f7f4ee] sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-[#b36b3c] ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {actionMessage && (
        <div
          className={`flex items-start gap-2 rounded-2xl border p-4 text-xs font-semibold shadow-xs ${
            actionError
              ? "border-[#fde8e8] bg-[#fdf2f2] text-[#b91c1c]"
              : "border-[#c9c5bb] bg-white text-[#26352f]"
          }`}
        >
          {actionError && <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          {actionMessage}
        </div>
      )}

      {/* Refundable contributions — ledger-style container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#dfdbd1] bg-white">
        <div className="flex items-center justify-between border-b border-[#dfdbd1] px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold text-[#26352f]">Recent M-Pesa Contributions</h3>
          <span className="rounded-full bg-[#f7f4ee] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#617068]">
            {refundableCount} refundable
          </span>
        </div>

        {/* Mobile Cards View */}
        <div className="custom-table-scrollbar min-h-0 flex-1 overflow-y-auto p-3 md:hidden">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#617068]">Loading contributions...</div>
          ) : contributions.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="mx-auto h-10 w-10 text-[#617068]" />
              <p className="mt-3 text-sm font-semibold text-[#26352f]">No completed M-Pesa contributions yet.</p>
            </div>
          ) : (
            contributions.map((c) => (
              <div key={c.id} className="space-y-2 rounded-xl border border-[#dfdbd1] bg-[#faf7f2] p-3.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="shrink-0 rounded-lg bg-white p-1.5">
                      <Smartphone className="h-5 w-5 text-[#b36b3c]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-[#26352f]">{c.donor_name}</h4>
                      <p className="truncate text-[11px] text-[#617068]">{c.purpose}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-[#26352f]">{formatKes(c.amount)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#617068]">
                  <span className="font-mono">{c.phone_number || "—"}</span>
                  <span>{formatDateTime(c.paid_at)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#eeeae2] pt-2">
                  {c.refund ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#617068]">
                      Refunded <StatusPill status={c.refund_status} />
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#617068]">
                      {c.mpesa_receipt_number ? `Receipt ${c.mpesa_receipt_number}` : "No receipt"}
                    </span>
                  )}
                  {!c.refund && (
                    <button
                      onClick={() => openRefundModal(c)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#fdf2f2] px-2.5 py-1 text-[11px] font-bold text-[#b91c1c] transition hover:bg-[#fde8e8]"
                    >
                      <Undo2 className="h-3 w-3" />
                      <span>Refund</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View */}
        <div className="custom-table-scrollbar hidden min-h-0 flex-1 overflow-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068] shadow-sm">
              <tr>
                <th className="w-12 px-4 py-3 text-left">#</th>
                <th className="px-4 py-3">Donor</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Amount (KES)</th>
                <th className="px-4 py-3">Paid At</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eeeae2]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[#617068]">
                    Loading contributions...
                  </td>
                </tr>
              ) : contributions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[#617068]">
                    No completed M-Pesa contributions yet.
                  </td>
                </tr>
              ) : (
                contributions.map((c, idx) => (
                  <tr key={c.id} className="transition hover:bg-[#faf7f2]">
                    <td className="px-4 py-3 text-xs text-[#617068]">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#26352f]">{c.donor_name}</p>
                      {c.mpesa_receipt_number && (
                        <p className="font-mono text-[11px] text-[#617068]">{c.mpesa_receipt_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#617068]">{c.purpose}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#617068]">{c.phone_number || "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#26352f]">{formatKes(c.amount)}</td>
                    <td className="px-4 py-3 text-xs text-[#617068]">{formatDateTime(c.paid_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {c.refund ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-[#617068]">Refunded</span>
                          <StatusPill status={c.refund_status} />
                        </span>
                      ) : (
                        <button
                          onClick={() => openRefundModal(c)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#fdf2f2] px-2.5 py-1.5 text-[11px] font-bold text-[#b91c1c] transition hover:bg-[#fde8e8]"
                        >
                          <Undo2 className="h-3 w-3" />
                          <span>Refund</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refund History */}
      <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-[#dfdbd1] bg-white">
        <div className="flex items-center justify-between border-b border-[#dfdbd1] px-4 py-3 sm:px-5">
          <h3 className="text-sm font-bold text-[#26352f]">Refund History</h3>
          <span className="rounded-full bg-[#f7f4ee] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#617068]">
            {refunds.length} total
          </span>
        </div>
        <div className="custom-table-scrollbar max-h-72 overflow-y-auto">
          {refunds.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#617068]">
              No refunds initiated yet.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f7f4ee] text-xs font-semibold uppercase tracking-wider text-[#617068]">
                <tr>
                  <th className="px-4 py-3">Donor</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Amount (KES)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Initiated By</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eeeae2]">
                {refunds.map((r) => (
                  <tr key={r.id} className="transition hover:bg-[#faf7f2]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[#26352f]">{r.donor_name || "—"}</p>
                      {r.outcome_description && (
                        <p className="max-w-xs truncate text-[11px] text-[#617068]" title={r.outcome_description}>
                          {r.outcome_description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#617068]">{r.contribution_purpose || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#617068]">{r.phone_number}</td>
                    <td className="px-4 py-3 text-right font-bold text-[#26352f]">{formatKes(r.amount)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                      {r.transaction_id && (
                        <p className="mt-1 font-mono text-[10px] text-[#617068]">{r.transaction_id}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#617068]">{r.initiated_by_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-[#617068]">{formatDateTime(r.completed_at || r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Refund Confirmation Modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="animate-in fade-in zoom-in duration-150 w-full max-w-md space-y-5 rounded-3xl bg-white p-6 shadow-xl">
            <div>
              <h3 className="text-xl font-bold text-[#26352f]">Confirm M-Pesa Refund</h3>
              <p className="mt-1 text-xs text-[#617068]">
                This pays the full contribution amount back to the member&apos;s phone via B2C. It cannot be undone once Safaricom accepts it.
              </p>
            </div>

            <div className="space-y-2 rounded-2xl bg-[#faf7f2] p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#617068]">Donor</span>
                <span className="font-bold text-[#26352f]">{refundTarget.donor_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#617068]">Account</span>
                <span className="font-semibold text-[#26352f]">{refundTarget.purpose}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#617068]">Receipt</span>
                <span className="font-mono text-[#26352f]">{refundTarget.mpesa_receipt_number || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#617068]">Refund Phone</span>
                <span className="font-mono font-bold text-[#26352f]">{refundTarget.phone_number || "—"}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#eeeae2] pt-2">
                <span className="text-[#617068]">Refund Amount</span>
                <span className="text-base font-bold text-[#b91c1c]">{formatKes(refundTarget.amount)}</span>
              </div>
            </div>

            <form onSubmit={handleRefundSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#617068]">Reason (required)</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Duplicate contribution on 21/09/2026"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-[#c9c5bb] px-3.5 py-2 outline-none focus:border-[#b36b3c]"
                />
              </div>

              {!refundTarget.phone_number && (
                <p className="rounded-xl bg-[#fdf2f2] p-3 text-[11px] font-semibold text-[#b91c1c]">
                  This contribution has no phone number on record — the refund will be rejected. Record the payer&apos;s number first.
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-[#dfdbd1] pt-3">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="rounded-full border border-[#c9c5bb] px-5 py-2 text-xs font-bold text-[#617068] hover:bg-[#f7f4ee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !refundTarget.phone_number}
                  className="rounded-full bg-[#b36b3c] px-6 py-2 text-xs font-bold text-white hover:bg-[#96552e] disabled:opacity-60"
                >
                  {submitting ? "Submitting..." : "Initiate Refund"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
