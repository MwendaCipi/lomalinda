"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { ComboboxPopover } from "@/components/combobox-popover";

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
 *  the treasury accounts in priority order. ``department_id`` is null for the
 *  church's own money; a set id is a department's or ministry's fund. */
type AccountOption = {
  id: number;
  name: string;
  label: string;
  department_id: number | null;
};

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
 *
 * The picker offers the church's own accounts only — a department's or
 * ministry's fund is read at its own desk, and a payment that really names one
 * belongs there, not here. Each row stays one line tall however many accounts
 * the church holds: the checkboxes live in a combo popover (see
 * AccountsPicker) instead of sprawling across the cell.
 */
export function UnassignedPaymentsPanel({ onAssigned }: { onAssigned?: () => void }) {
  const [rows, setRows] = useState<HeldPayment[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  /** row.id → checked accounts with their amounts */
  const [picked, setPicked] = useState<Record<number, PickedAccount[]>>({});
  /** The one row whose account picker is open — a single popover at a time. */
  const [openPickerId, setOpenPickerId] = useState<number | null>(null);

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

  /** The church's own accounts — departments' and ministries' funds stay at
   *  their own desks, so this desk never offers them. */
  const churchAccounts = accounts.filter((a) => a.department_id == null);

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
                  <AccountsPicker
                    accounts={churchAccounts}
                    paymentAmount={row.amount}
                    picked={rowPicked}
                    onToggle={(account) => toggleAccount(row, account)}
                    onAmount={(accountId, amount) => updateAmount(row.id, accountId, amount)}
                    open={openPickerId === row.id}
                    onOpenChange={(open) => setOpenPickerId(open ? row.id : null)}
                    fill
                  />
                  <PickedSummary picked={rowPicked} accounts={churchAccounts} />
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
                      <AccountsPicker
                        accounts={churchAccounts}
                        paymentAmount={row.amount}
                        picked={rowPicked}
                        onToggle={(account) => toggleAccount(row, account)}
                        onAmount={(accountId, amount) => updateAmount(row.id, accountId, amount)}
                        open={openPickerId === row.id}
                        onOpenChange={(open) => setOpenPickerId(open ? row.id : null)}
                      />
                      <PickedSummary picked={rowPicked} accounts={churchAccounts} className="mt-1.5" />
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

/**
 * One row's account picker: a combo box whose popover holds the checkboxes.
 *
 * The unassigned desk lists every church account the treasury keeps, so a
 * table of inline checkboxes grows with each account and buries the payment
 * rows. The trigger hugs one line — the picked account's name, or a count —
 * and the popover carries the ticking and the amount for each tick, the way
 * the users table's role picker does.
 */
function AccountsPicker({
  accounts,
  paymentAmount,
  picked,
  onToggle,
  onAmount,
  open,
  onOpenChange,
  fill = false,
}: {
  accounts: AccountOption[];
  paymentAmount: string;
  picked: PickedAccount[];
  onToggle: (account: AccountOption) => void;
  onAmount: (accountId: number, amount: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fill?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The panel lives in document.body (see ComboboxPopover), so outside-click
  // must count it as inside or the first click inside would close the picker.
  const panelRef = useRef<HTMLDivElement>(null);
  /** Only the breakpoint twin on screen owns the popover: the phone cards and
   *  the desktop table both mount a picker per row, and the hidden twin's
   *  zero-size anchor would measure to the page's corner and float a second
   *  popover there. */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(open && (containerRef.current?.offsetWidth ?? 0) > 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !(panelRef.current && panelRef.current.contains(target))
      ) {
        onOpenChange(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onOpenChange]);

  const paymentTotal = parseFloat(paymentAmount) || 0;
  const credited = picked.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const names = picked
    .map((p) => accounts.find((a) => a.id === p.accountId)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div className={`relative ${fill ? "block" : "inline-block"}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`${fill ? "flex w-full justify-between" : "inline-flex"} items-center gap-1.5 rounded-xl border border-sand-line bg-white px-2.5 py-1.5 text-xs font-medium text-bark transition hover:border-ember focus:border-ember focus:outline-none`}
      >
        <span className="min-w-0 truncate">
          {picked.length === 0
            ? "Choose accounts"
            : picked.length === 1
              ? names[0] ?? "1 account"
              : `${names[0] ?? "Accounts"} +${picked.length - 1} more`}
        </span>
        <svg className={`h-3 w-3 shrink-0 text-moss transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <ComboboxPopover
        anchorRef={containerRef}
        panelRef={panelRef}
        open={mounted}
        minW={300}
        panelClassName="rounded-xl border border-sand-line bg-white shadow-lg overflow-hidden"
      >
        <div className="max-h-72 overflow-y-auto custom-table-scrollbar">
          <div className="sticky top-0 z-10 border-b border-sand-paper bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-moss">
            Church account
          </div>
          {accounts.map((a) => {
            const entry = picked.find((p) => p.accountId === a.id);
            const checked = Boolean(entry);
            const detail = a.label && a.label !== a.name ? a.label : "";
            return (
              <div key={a.id} className={`flex items-center gap-2 pr-2.5 ${checked ? "bg-mist-select" : "hover:bg-sand"}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => onToggle(a)}
                  className={`flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-left text-xs transition ${
                    checked ? "font-semibold text-bark" : "text-moss-dark"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      checked ? "border-ember bg-ember text-white" : "border-sand-mute bg-white"
                    }`}
                  >
                    {checked && (
                      <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{a.name}</span>
                    {detail && <span className="block truncate text-[10px] font-normal text-moss">{detail}</span>}
                  </span>
                </button>
                {checked && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={entry?.amount ?? ""}
                    onChange={(e) => onAmount(a.id, e.target.value)}
                    className="w-20 shrink-0 rounded-lg border border-sand-line bg-white px-2 py-1 text-xs font-semibold text-bark text-right outline-none focus:border-ember"
                    aria-label={`Amount for ${a.name}`}
                  />
                )}
              </div>
            );
          })}
          {accounts.length === 0 && (
            <p className="px-3 py-3 text-xs text-moss">No church accounts yet.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-sand-paper bg-white px-3 py-2">
          <span className={`text-[10px] ${credited > 0 ? "font-semibold text-ember" : "text-moss"}`}>
            {credited > 0
              ? `KES ${credited.toLocaleString("en-KE", { minimumFractionDigits: 2 })} of KES ${paymentTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`
              : "Tick an account to credit"}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl bg-bark px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-ember"
          >
            Done
          </button>
        </div>
      </ComboboxPopover>
    </div>
  );
}

/** The accounts this payment will be credited to, one compact line each —
 *  the picker closed, the treasurer still sees the split before Assign. */
function PickedSummary({
  picked,
  accounts,
  className = "",
}: {
  picked: PickedAccount[];
  accounts: AccountOption[];
  className?: string;
}) {
  if (picked.length === 0) return null;
  return (
    <ul className={`space-y-0.5 ${className}`}>
      {picked.map((p) => {
        const account = accounts.find((a) => a.id === p.accountId);
        return (
          <li key={p.accountId} className="text-[11px] text-moss">
            <span className="font-semibold text-bark">{account?.name ?? "Account"}</span>
            {" · KES "}
            {(parseFloat(p.amount) || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
          </li>
        );
      })}
    </ul>
  );
}
