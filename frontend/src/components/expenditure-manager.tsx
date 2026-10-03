"use client";

import { useEffect, useState } from "react";
import { Plus, Receipt, Trash2, X } from "lucide-react";
import { RecordList } from "./record-list";
import { showAlert } from "@/lib/alerts";
import { densityCellPad } from "@/lib/table-density";
import { dayFirst, localDate } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type TreasuryAccount = {
  id: number;
  name: string;
  balance: string | number;
};

type Expenditure = {
  id: number;
  title: string;
  amount: string | number;
  category: string;
  category_display: string;
  account?: number;
  account_name?: string;
  payment_method: string;
  vendor_payee: string;
  receipt_number: string;
  expenditure_date: string;
  notes: string;
  recorded_by_name?: string;
  created_at: string;
};

/**
 * The spending categories, in one place: the desk draws them in its header
 * filter and this view reads the same list, so the two can never drift.
 */
export const EXPENDITURE_CATEGORIES: { key: string; label: string }[] = [
  { key: "operations", label: "Church Operations" },
  { key: "evangelism", label: "Evangelism & Missions" },
  { key: "utilities", label: "Utilities" },
  { key: "maintenance", label: "Maintenance & Repairs" },
  { key: "welfare", label: "Welfare & Assistance" },
  { key: "sabbath_school", label: "Sabbath School" },
  { key: "building", label: "Building & Development" },
  { key: "other", label: "Other Expenditure" },
];

/**
 * The church's spending, as one of the treasury desk's views.
 *
 * It is hosted by the accounts desk (the shell's toggle strip already names
 * it), so it reads like the accounts table beside it: the search and the
 * category sit in the shell's header row, the rows are `RecordList` — a table
 * on a PC, cards on a phone — and the footer carries the total and the
 * Record button. Recording and removing a record announce themselves with a
 * toast, the same way the desk's account information does.
 */
export function ExpenditureManager({
  search = "",
  category = "all",
  fromDate = "",
  toDate = "",
}: {
  /** The desk's search, drawn in the shell's header row beside the page name. */
  search?: string;
  /** The category the desk's header filter narrowed to. */
  category?: string;
  /** The first day of the window the desk's header is showing (ISO date). */
  fromDate?: string;
  /** The last day of that window (ISO date). */
  toDate?: string;
} = {}) {
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loading, setLoading] = useState(false);
  // The desk-wide compact-rows preference, shared with the other tables.
  const rowPad = densityCellPad();

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "operations",
    account: "",
    payment_method: "cash",
    vendor_payee: "",
    receipt_number: "",
    expenditure_date: localDate(),
    notes: "",
  });

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json" };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expRes, accRes] = await Promise.all([
        fetch(`${API_URL}/api/members/treasury/expenditures/`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/members/treasury/accounts/`, { headers: authHeaders() }),
      ]);
      if (expRes.ok) setExpenditures(await expRes.json());
      if (accRes.ok) setAccounts(await accRes.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateExpenditure = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/expenditures/`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          ...form,
          account: form.account ? Number(form.account) : null,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setForm({
          title: "",
          amount: "",
          category: "operations",
          account: "",
          payment_method: "cash",
          vendor_payee: "",
          receipt_number: "",
          expenditure_date: localDate(),
          notes: "",
        });
        showAlert("Expenditure recorded", "The record is saved and the designated account debited.", "success", {
          toast: true,
          timer: 4000,
          showConfirmButton: false,
        });
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showAlert("Could not record the expenditure", err.detail || "Try again.", "error", {
          toast: true,
          timer: 4500,
          showConfirmButton: false,
        });
      }
    } catch {
      showAlert("Could not record the expenditure", "The desk could not be reached.", "error", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpenditure = async (expenditure: Expenditure) => {
    if (!confirm(`Delete "${expenditure.title}"? If it debited an account, that movement stays.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/expenditures/${expenditure.id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        showAlert("Expenditure removed", `"${expenditure.title}" is off the spending record.`, "success", {
          toast: true,
          timer: 4000,
          showConfirmButton: false,
        });
        await fetchData();
      } else {
        showAlert("Could not remove the expenditure", "Try again.", "error", {
          toast: true,
          timer: 4500,
          showConfirmButton: false,
        });
      }
    } catch {
      showAlert("Could not remove the expenditure", "The desk could not be reached.", "error", {
        toast: true,
        timer: 4500,
        showConfirmButton: false,
      });
    }
  };

  const needle = search.trim().toLowerCase();
  const filteredExpenditures = expenditures.filter((exp) => {
    const matchesCategory = category === "all" || exp.category === category;
    if (!matchesCategory) return false;
    // The date inputs and the record both speak ISO (YYYY-MM-DD), so the
    // window is a plain string comparison — no parsing, no timezone drift.
    const day = (exp.expenditure_date || "").slice(0, 10);
    if (fromDate && day < fromDate) return false;
    if (toDate && day > toDate) return false;
    if (!needle) return true;
    return `${exp.title || ""} ${exp.vendor_payee || ""} ${exp.receipt_number || ""} ${exp.account_name || ""}`
      .toLowerCase()
      .includes(needle);
  });

  const filteredTotal = filteredExpenditures.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RecordList
        rows={filteredExpenditures}
        loading={loading}
        rowKey={(exp) => exp.id}
        tableWrapperClassName="flex-1 min-h-0 overflow-auto custom-table-scrollbar"
        tableClassName="w-full text-left text-sm"
        headClassName="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm"
        headRowClassName=""
        headCellClassName=""
        headers={[
          { label: "Date", className: "px-4 py-3 text-left" },
          // No receipt column: the vendor and the account carry the record,
          // and the width is better spent on the title.
          { label: "Title / Description", className: "px-4 py-3" },
          { label: "Category", className: "px-4 py-3" },
          { label: "Debited Account", className: "px-4 py-3" },
          { label: "Payee / Vendor", className: "px-4 py-3" },
          { label: "Amount (KES)", className: "px-4 py-3 text-right" },
          { label: "Action", className: "px-4 py-3 text-center" },
        ]}
        loadingLabel="Loading expenditure records..."
        stateClassName="px-4 py-12 text-center text-moss"
        tableEmptyClassName="px-4 py-12 text-center"
        tableEmpty={
          <>
            <p className="text-sm font-semibold text-bark">No expenditure records found.</p>
            <p className="mt-1 text-xs text-moss">Record the church&apos;s spending with the button below.</p>
          </>
        }
        cardsStateClassName="py-12 text-center text-sm text-moss"
        cardsEmpty={
          <>
            <Receipt className="mx-auto h-10 w-10 text-moss" />
            <p className="mt-3 text-sm font-semibold text-bark">No expenditure records found.</p>
            <p className="mt-1 text-xs text-moss">Tap &quot;Record Expenditure&quot; below to log the church&apos;s spending.</p>
          </>
        }
        cardsClassName="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 custom-table-scrollbar"
        renderCard={(exp) => (
          <div key={exp.id} className="space-y-2 rounded-xl border border-sand-line bg-sand-linen text-xs p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-bold text-bark" title={exp.title}>{exp.title}</h4>
                <p className="text-[11px] text-moss">{dayFirst(exp.expenditure_date)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-moss">
                {exp.category_display || exp.category}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-moss">Amount</span>
              <span className="text-sm font-bold text-alert">
                KES {Number(exp.amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[11px] text-moss">
              {exp.account_name || "No account debited"}
              {exp.vendor_payee && ` · ${exp.vendor_payee}`}
            </p>
            {exp.notes && <p className="text-[11px] leading-relaxed text-moss">{exp.notes}</p>}
            <div className="flex justify-end border-t border-sand-line pt-2">
              <button
                type="button"
                onClick={() => handleDeleteExpenditure(exp)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-[11px] font-semibold text-moss transition hover:border-alert hover:text-alert"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        )}
        renderRow={(exp) => (
          <tr key={exp.id} className="hover:bg-sand-linen">
            <td className={`whitespace-nowrap px-4 ${rowPad} text-xs text-moss`}>{dayFirst(exp.expenditure_date)}</td>
            <td className={`px-4 ${rowPad} min-w-[240px] font-semibold text-bark`}>
              {exp.title}
              {exp.notes && <p className="text-[11px] font-normal text-moss">{exp.notes}</p>}
            </td>
            <td className={`whitespace-nowrap px-4 ${rowPad}`}>
              <span className="rounded-full bg-mist-select px-2.5 py-0.5 text-xs font-semibold text-sage">
                {exp.category_display || exp.category}
              </span>
            </td>
            <td className={`whitespace-nowrap px-4 ${rowPad} text-xs font-semibold text-bark`}>{exp.account_name || "—"}</td>
            <td className={`whitespace-nowrap px-4 ${rowPad} text-xs text-moss`}>{exp.vendor_payee || "—"}</td>
            <td className={`whitespace-nowrap px-4 ${rowPad} text-right font-semibold text-alert`}>
              KES {Number(exp.amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
            </td>
            <td className={`px-4 ${rowPad} text-center`}>
              <button
                type="button"
                onClick={() => handleDeleteExpenditure(exp)}
                aria-label={`Delete ${exp.title}`}
                className="rounded-lg p-1.5 text-moss transition hover:bg-alert-wash hover:text-alert"
                title="Delete Expenditure"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </td>
          </tr>
        )}
      />

      {/* Footer: what the filtered spending comes to, with the Record button
          beside it — the shape the accounts desk's bar uses. */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sand-line bg-white px-4 py-3 sm:px-6">
        <p className="text-xs text-moss">
          Showing <strong className="text-bark">{filteredExpenditures.length}</strong> of {expenditures.length} records · Total:{" "}
          <strong className="text-alert">KES {filteredTotal.toLocaleString("en-KE", { minimumFractionDigits: 2 })}</strong>
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="h-9 inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ember px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark"
        >
          <Plus className="h-4 w-4" />
          <span>Record Expenditure</span>
        </button>
      </div>

      {/* Record Expenditure Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="text-xl font-bold text-bark">Record Expenditure</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-xs font-bold text-moss hover:text-bark"
              >
                <X className="inline h-3.5 w-3.5" aria-hidden="true" /> Close
              </button>
            </div>

            <form onSubmit={handleCreateExpenditure} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Title / Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sabbath School Bibles, Sound System Maintenance"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Amount (KES)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  >
                    {EXPENDITURE_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Treasury Account to Debit</label>
                <select
                  value={form.account}
                  onChange={(e) => setForm({ ...form, account: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                >
                  <option value="">-- None (Record without Debit) --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Balance: KES {Number(a.balance).toLocaleString()})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-moss">Selecting an account automatically debits its balance.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Payment Method</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  >
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa / Mobile</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Expenditure Date</label>
                  <input
                    type="date"
                    required
                    value={form.expenditure_date}
                    onChange={(e) => setForm({ ...form, expenditure_date: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Payee / Vendor Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Kenya Power, SoundMaster"
                    value={form.vendor_payee}
                    onChange={(e) => setForm({ ...form, vendor_payee: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Receipt / Voucher #</label>
                  <input
                    type="text"
                    placeholder="e.g. REC-908"
                    value={form.receipt_number}
                    onChange={(e) => setForm({ ...form, receipt_number: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional expense details or notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2 outline-none focus:border-ember"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sand-line">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-full border border-sand-mute px-5 py-2 text-xs font-bold text-moss hover:bg-sand"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-ember px-6 py-2 text-xs font-bold text-white hover:bg-ember-dark disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Record Expenditure"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
