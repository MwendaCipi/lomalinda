"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Pencil, Plus, Trash2 } from "lucide-react";

import { BackToOverviewArrow } from "@/components/back-to-overview-arrow";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** One year's budget, as the API serves it. */
type ChurchBudget = {
  id: number;
  year: number;
  total_income: string | number;
  total_expenses: string | number;
  notes: string;
  published_to_public: boolean;
};

const money = (value: string | number) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

const currentYear = new Date().getFullYear();

/**
 * The church budget desk — where the treasurer posts the year's budget.
 *
 * One row per year: what the church plans to receive, what it plans to
 * spend, and the notes that explain the plan. A budget is written here and
 * published from here — the public budget page (/support/budget) reads only
 * what the treasurer has let out, so the desk can shape the figures before
 * the congregation sees them. Department budgets live on each department's
 * own desk; this is the church-wide plan.
 */
export function ChurchBudgetManager() {
  const [budgets, setBudgets] = useState<ChurchBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ChurchBudget | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    year: String(currentYear),
    total_income: "",
    total_expenses: "",
    notes: "",
    published_to_public: false,
  });

  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("access_token") || ""}`,
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/budgets/`, { headers: headers() });
      setBudgets(res.ok ? await res.json() : []);
    } catch {
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred by a microtask so the fetch is not started in the effect's own
    // synchronous body (the convention across the desks).
    void Promise.resolve().then(load);
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ year: String(currentYear), total_income: "", total_expenses: "", notes: "", published_to_public: false });
    setShowModal(true);
  };

  const openEdit = (budget: ChurchBudget) => {
    setEditing(budget);
    setForm({
      year: String(budget.year),
      total_income: String(budget.total_income ?? ""),
      total_expenses: String(budget.total_expenses ?? ""),
      notes: budget.notes || "",
      published_to_public: budget.published_to_public,
    });
    setShowModal(true);
  };

  const save = async () => {
    const year = Number(form.year);
    if (!year || year < 2000 || year > 2100) {
      showAlert("Invalid year", "Enter a year between 2000 and 2100.", "error");
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        year,
        total_income: form.total_income === "" ? 0 : Number(form.total_income),
        total_expenses: form.total_expenses === "" ? 0 : Number(form.total_expenses),
        notes: form.notes.trim(),
        published_to_public: form.published_to_public,
      });
      const res = await fetch(
        editing ? `${API_URL}/api/members/budgets/${editing.id}/` : `${API_URL}/api/members/budgets/`,
        { method: editing ? "PATCH" : "POST", headers: headers(), body }
      );
      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        throw new Error(Object.values(problem).flat().join(" ") || "The budget could not be saved.");
      }
      setShowModal(false);
      setActionMessage(editing ? `The ${form.year} budget has been updated.` : `The ${form.year} budget has been posted.`);
      await load();
    } catch (err) {
      showAlert("Could not save the budget", err instanceof Error ? err.message : "Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (budget: ChurchBudget) => {
    const next = !budget.published_to_public;
    const res = await fetch(`${API_URL}/api/members/budgets/${budget.id}/`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ published_to_public: next }),
    });
    if (res.ok) {
      setActionMessage(next ? `The ${budget.year} budget is now on the public budget page.` : `The ${budget.year} budget is back behind the desk.`);
      await load();
    }
  };

  const remove = async (budget: ChurchBudget) => {
    const answer = await showAlert(
      `Delete the ${budget.year} budget?`,
      "The year's plan disappears from the desk and, if it was published, from the public budget page. This cannot be undone.",
      "warning",
      { showCancelButton: true, confirmButtonText: "Delete", cancelButtonText: "Keep it" }
    );
    if (!answer.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/budgets/${budget.id}/`, { method: "DELETE", headers: headers() });
    if (res.ok) {
      setActionMessage(`The ${budget.year} budget has been deleted.`);
      await load();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-8 overflow-hidden p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <BackToOverviewArrow />
          <div className="md:hidden">
            <h2 className="text-2xl font-bold text-bark">Church Budget</h2>
            <p className="mt-1 text-sm text-moss">Post the year&apos;s plan and decide when the congregation sees it.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-ember-dark"
        >
          <Plus className="h-4 w-4" />
          <span>Post Budget</span>
        </button>
      </div>

      {actionMessage && (
        <div className="rounded-2xl border border-sand-mute bg-white p-4 text-xs font-semibold text-bark shadow-xs">
          {actionMessage}
        </div>
      )}

      {/* Budget years */}
      <div className="min-h-0 flex-1 overflow-y-auto custom-hover-scrollbar">
        {loading ? (
          <div className="rounded-2xl border border-sand-line bg-white p-10 text-center text-sm text-moss">Loading budgets…</div>
        ) : budgets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sand-mute bg-white p-10 text-center">
            <Calendar className="mx-auto h-10 w-10 text-moss" />
            <h3 className="mt-3 text-sm font-semibold text-bark">No budget on record yet</h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-moss">
              Post the church&apos;s budget for the year — what it plans to receive and to spend — and publish
              it to the congregation&apos;s budget page when it is ready.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((budget) => {
              const income = Number(budget.total_income || 0);
              const expenses = Number(budget.total_expenses || 0);
              const balance = income - expenses;
              return (
                <article key={budget.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-xs sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 text-base font-bold text-bark">
                        {budget.year} Budget
                        {budget.published_to_public ? (
                          <span className="rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage">Published</span>
                        ) : (
                          <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-moss">Behind the desk</span>
                        )}
                      </h3>
                      <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                        <div>
                          <dt className="text-moss">Planned income</dt>
                          <dd className="font-bold text-sage">{money(income)}</dd>
                        </div>
                        <div>
                          <dt className="text-moss">Planned spending</dt>
                          <dd className="font-bold text-alert">{money(expenses)}</dd>
                        </div>
                        <div>
                          <dt className="text-moss">Planned balance</dt>
                          <dd className={`font-bold ${balance >= 0 ? "text-bark" : "text-alert"}`}>{money(balance)}</dd>
                        </div>
                      </dl>
                      {budget.notes && <p className="mt-2 max-w-2xl whitespace-pre-line text-xs leading-5 text-moss">{budget.notes}</p>}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePublished(budget)}
                        className="rounded-xl border border-sand-line px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
                      >
                        {budget.published_to_public ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(budget)}
                        aria-label={`Edit the ${budget.year} budget`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line px-3 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(budget)}
                        aria-label={`Delete the ${budget.year} budget`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line px-3 py-1.5 text-xs font-semibold text-brick transition hover:border-brick"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Post / edit budget modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="max-h-[92vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-sand-line pb-3">
              <h3 className="text-xl font-bold text-bark">{editing ? `Edit the ${editing.year} Budget` : "Post Budget"}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-xs font-bold text-moss hover:text-bark">
                Close
              </button>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
              className="space-y-4 text-sm"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Year *</label>
                  <input
                    type="number"
                    required
                    min={2000}
                    max={2100}
                    value={form.year}
                    onChange={(e) => setForm({ ...form, year: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-moss">Planned income (KES)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.total_income}
                    onChange={(e) => setForm({ ...form, total_income: e.target.value })}
                    className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Planned spending (KES)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.total_expenses}
                  onChange={(e) => setForm({ ...form, total_expenses: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-moss">Notes</label>
                <textarea
                  rows={4}
                  placeholder="What the plan assumes, and anything the congregation should read with the figures…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-sand-mute px-3.5 py-2.5 outline-none focus:border-ember"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs font-medium text-bark">
                <input
                  type="checkbox"
                  checked={form.published_to_public}
                  onChange={(e) => setForm({ ...form, published_to_public: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-sage"
                />
                <span>Publish to the congregation now — the budget appears on the church&apos;s budget page.</span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-sage px-8 text-sm font-medium text-white transition hover:bg-sage-deep disabled:opacity-60"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Post the budget"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
