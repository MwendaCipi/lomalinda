"use client";

import { useEffect, useState } from "react";
import { Plus, Receipt, Filter, Search, Trash2, X } from "lucide-react";
import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { useTableDensity, densityCellPad, DensityToggle } from "@/lib/table-density";

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

export function ExpenditureManager() {
  const [expenditures, setExpenditures] = useState<Expenditure[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  // The desk-wide compact-rows preference, shared with the other tables.
  const { dense, toggleDensity } = useTableDensity();
  const rowPad = densityCellPad(dense);

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
    expenditure_date: new Date().toISOString().split("T")[0],
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
    setActionMessage(null);
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
          expenditure_date: new Date().toISOString().split("T")[0],
          notes: "",
        });
        setActionMessage("Expenditure record added successfully and account debited.");
        await fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage(err.detail || "Failed to record expenditure.");
      }
    } catch {
      setActionMessage("Network error recording expenditure.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpenditure = async (id: number) => {
    if (!confirm("Are you sure you want to delete this expenditure record?")) return;
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/expenditures/${id}/`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.ok) {
        setActionMessage("Expenditure record removed.");
        await fetchData();
      } else {
        setActionMessage("Failed to delete expenditure.");
      }
    } catch {
      setActionMessage("Network error deleting expenditure.");
    }
  };

  const filteredExpenditures = expenditures.filter((exp) => {
    const matchesCategory = selectedCategory === "all" || exp.category === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      exp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.vendor_payee.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.receipt_number.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categoryOptions = [
    { key: "operations", label: "Church Operations" },
    { key: "evangelism", label: "Evangelism & Missions" },
    { key: "utilities", label: "Utilities" },
    { key: "maintenance", label: "Maintenance & Repairs" },
    { key: "welfare", label: "Welfare & Assistance" },
    { key: "sabbath_school", label: "Sabbath School" },
    { key: "building", label: "Building & Development" },
    { key: "other", label: "Other Expenditure" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <BackToOverviewArrow />
          {/* Named by the strip above on a wide screen. */}
          <div className="md:hidden">
            <h2 className="text-2xl font-bold text-bark">Church Expenditures</h2>
            <p className="mt-1 text-sm text-moss">
              Record church expenses, debit designated treasury accounts, and track disbursement logs.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-ember-dark"
        >
          <Plus className="h-4 w-4" />
          <span>Record Expenditure</span>
        </button>
      </div>

      {actionMessage && (
        <div className="rounded-2xl border border-sand-mute bg-white p-4 text-xs font-semibold text-bark shadow-xs">
          {actionMessage}
        </div>
      )}

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-sand-line bg-white p-4 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-moss" />
          <input
            type="text"
            placeholder="Search by title, payee vendor, or receipt #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-sand-mute pl-10 pr-4 py-2 text-xs text-bark outline-none focus:border-ember"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-moss" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark outline-none focus:border-ember"
          >
            <option value="all">All Categories</option>
            {categoryOptions.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <DensityToggle dense={dense} onToggle={toggleDensity} />
        </div>
      </div>

      {/* Expenditures Table */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-sand-line bg-white shadow-xs">
          <div className="h-full overflow-auto custom-table-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-sand text-xs font-semibold uppercase tracking-wider text-moss">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Title / Description</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Debited Account</th>
                  <th className="px-5 py-3">Payee / Vendor</th>
                  <th className="px-5 py-3">Receipt / Ref</th>
                  <th className="px-5 py-3 text-right">Amount (KES)</th>
                  <th className="px-5 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-line">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-xs text-moss">
                      Loading expenditure records...
                    </td>
                  </tr>
                ) : filteredExpenditures.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-xs text-moss">
                      No expenditure records found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredExpenditures.map((exp) => (
                    <tr key={exp.id} className="hover:bg-sand-vellum">
                      <td className={`whitespace-nowrap px-5 ${rowPad} text-xs text-moss`}>
                        {exp.expenditure_date}
                      </td>
                      <td className={`px-5 ${rowPad} font-bold text-bark`}>
                        {exp.title}
                        {exp.notes && !dense && (
                          <p className="text-[11px] font-normal text-moss mt-0.5">{exp.notes}</p>
                        )}
                      </td>
                      <td className={`whitespace-nowrap px-5 ${rowPad}`}>
                        <span className="inline-flex rounded-full bg-sand px-2.5 py-0.5 text-[10px] font-bold text-moss uppercase">
                          {exp.category_display || exp.category}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-5 ${rowPad} text-xs font-semibold text-bark`}>
                        {exp.account_name || "—"}
                      </td>
                      <td className={`whitespace-nowrap px-5 ${rowPad} text-xs text-moss`}>
                        {exp.vendor_payee || "—"}
                      </td>
                      <td className={`whitespace-nowrap px-5 ${rowPad} text-xs font-mono text-moss`}>
                        {exp.receipt_number || "—"}
                      </td>
                      <td className={`whitespace-nowrap px-5 ${rowPad} text-right font-black text-alert`}>
                        KES {Number(exp.amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`whitespace-nowrap px-5 ${rowPad} text-center`}>
                        <button
                          onClick={() => handleDeleteExpenditure(exp.id)}
                          className="rounded-lg p-1.5 text-moss hover:bg-alert-wash hover:text-alert transition"
                          title="Delete Expenditure"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
                  >
                    {categoryOptions.map((c) => (
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
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
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
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3 py-2.5 outline-none focus:border-ember"
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
