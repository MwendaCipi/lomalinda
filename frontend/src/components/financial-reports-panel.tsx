"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Eye, EyeOff, FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { parseApiErrors, type FieldErrors } from "@/lib/form-errors";
import { useHeaderData } from "@/hooks/use-header-data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type PeriodType = "monthly" | "quarterly" | "annual";

type Report = {
  id: number;
  title: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  total_tithes: string;
  total_offerings: string;
  total_expenses: string;
  notes: string;
  published_to_members: boolean;
  created_at: string;
};

const PERIOD_TYPES: { value: PeriodType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

const money = (value: string | number) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

/** Dates arrive as plain days; they are periods, not moments, so read them in
 * the church's timezone rather than the browser's. */
const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Nairobi",
  });

const todayInNairobi = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());

type Draft = {
  title: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  total_tithes: string;
  total_offerings: string;
  total_expenses: string;
  notes: string;
  published_to_members: boolean;
};

/** A month-to-date starting point: the treasurer states a period, and the
 * commonest new report is the month they are in. */
function blankDraft(): Draft {
  const today = todayInNairobi();
  return {
    title: "",
    period_type: "monthly",
    period_start: `${today.slice(0, 7)}-01`,
    period_end: today,
    total_tithes: "",
    total_offerings: "",
    total_expenses: "",
    notes: "",
    published_to_members: true,
  };
}

const draftFromReport = (report: Report): Draft => ({
  title: report.title,
  period_type: report.period_type,
  period_start: report.period_start,
  period_end: report.period_end,
  total_tithes: String(report.total_tithes ?? ""),
  total_offerings: String(report.total_offerings ?? ""),
  total_expenses: String(report.total_expenses ?? ""),
  notes: report.notes ?? "",
  published_to_members: report.published_to_members,
});

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
};

/**
 * The published half of Reports: the statements the church puts out, and — for
 * the treasurer and the office — the desk that writes them.
 *
 * One endpoint serves both: the list is the published statements to everyone
 * else and the desk's full register to the treasurer, so the composer is a
 * privilege of the view rather than a second page. A report starts as a draft
 * the desk can still correct and only reaches the congregation when it is
 * published.
 */
export function FinancialReportsPanel() {
  const { me } = useHeaderData();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Report | null>(null);

  const canManage = Boolean(
    me && (me.is_staff || me.is_superuser || me.roles.includes("treasurer") || me.roles.includes("admin"))
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/members/reports/`, { headers: authHeaders() });
      if (res.ok) setReports(await res.json());
    } catch {
      // The page still reads as "nothing published yet" rather than an error.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openComposer = (report: Report | null) => {
    setEditing(report);
    setComposerOpen(true);
  };

  const setPublished = async (report: Report, published: boolean) => {
    const res = await fetch(`${API_URL}/api/members/reports/${report.id}/`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ published_to_members: published }),
    });
    if (!res.ok) {
      await showAlert(
        "Could not update the report",
        "The church's server did not accept the change. Please try again.",
        "error"
      );
      return;
    }
    setReports((rows) =>
      rows.map((row) => (row.id === report.id ? { ...row, published_to_members: published } : row))
    );
  };

  const remove = async (report: Report) => {
    const answer = await showAlert(
      `Remove “${report.title}”?`,
      "The report disappears from the congregation's Reports page. This cannot be undone.",
      "warning",
      {
        showCancelButton: true,
        confirmButtonText: "Remove",
        cancelButtonText: "Keep it",
        confirmButtonColor: brand.alert,
      }
    );
    if (!answer.isConfirmed) return;
    const res = await fetch(`${API_URL}/api/members/reports/${report.id}/`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      await showAlert("Could not remove the report", "Please try again.", "error");
      return;
    }
    setReports((rows) => rows.filter((row) => row.id !== report.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Published Statements</h2>
          <p className="mt-1 text-sm text-moss">
            The monthly, quarterly and annual statements the church publishes. Figures are what the
            treasurer has reconciled for the period they cover.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => openComposer(null)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-bark px-3 py-2 text-xs font-bold text-white transition hover:bg-bark/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Post report
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-moss">Loading financial reports…</p>
      ) : reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand-mute bg-white p-8 text-center text-sm text-moss">
          {canManage
            ? "No statements are on record yet. Post the first one and it will appear here for the congregation."
            : "No published financial statements have been posted yet."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <article key={report.id} className="flex flex-col rounded-2xl border border-sand-line bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold capitalize text-ember">
                  {report.period_type} · {formatDay(report.period_start)} – {formatDay(report.period_end)}
                </span>
                {/* Only the desk ever sees a draft, so the badge needs no
                    explanation for anyone else. */}
                {canManage && !report.published_to_members && (
                  <span className="rounded-full border border-sand-mute px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-moss">
                    Draft
                  </span>
                )}
              </div>

              <h3 className="mt-3 text-lg font-semibold text-bark">{report.title}</h3>

              {/* Three columns on a wide screen; on a phone each figure takes
                  its own row (label left, amount right) — three money columns
                  on a 390px card wrap every amount onto two lines. */}
              <dl className="mt-4 grid gap-2 border-t border-sand-line pt-4 text-sm sm:grid-cols-3 sm:gap-3">
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-[11px] uppercase tracking-wider text-moss">Tithes</dt>
                  <dd className="font-semibold text-bark sm:mt-1">{money(report.total_tithes)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-[11px] uppercase tracking-wider text-moss">Offerings</dt>
                  <dd className="font-semibold text-bark sm:mt-1">{money(report.total_offerings)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-[11px] uppercase tracking-wider text-moss">Expenses</dt>
                  <dd className="font-semibold text-bark sm:mt-1">{money(report.total_expenses)}</dd>
                </div>
              </dl>

              {report.notes && (
                <div className="mt-4 border-t border-sand-line pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-moss">Notes &amp; Details</p>
                  <p className="mt-1.5 text-sm leading-6 text-moss">{report.notes}</p>
                </div>
              )}

              {canManage && (
                // The outer `mt-auto` pushes the desk's buttons to the card's
                // floor (so a report without notes still lines up beside one
                // with notes) while the inner `pt-4` keeps a real gap when the
                // card is only as tall as its content.
                <div className="mt-auto pt-4">
                <div className="flex flex-wrap items-center gap-2 border-t border-sand-line pt-3">
                  <button
                    type="button"
                    onClick={() => setPublished(report, !report.published_to_members)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute px-2.5 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand-linen"
                  >
                    {report.published_to_members ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Unpublish
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Publish
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openComposer(report)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute px-2.5 py-1.5 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand-linen"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(report)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-sand-mute px-2.5 py-1.5 text-xs font-semibold text-moss transition hover:border-ember hover:text-ember"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {composerOpen && (
        <ReportComposer
          report={editing}
          onClose={() => setComposerOpen(false)}
          onSaved={() => {
            setComposerOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/**
 * The desk's report form — post or correct one statement.
 *
 * It is a modal rather than an inline form because writing a report is an
 * interruption to reading them, and it needs the whole width for the three
 * figures that have to line up.
 */
function ReportComposer({
  report,
  onClose,
  onSaved,
}: {
  report: Report | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => (report ? draftFromReport(report) : blankDraft()));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setGeneralError("");

    const payload = {
      title: draft.title.trim(),
      period_type: draft.period_type,
      period_start: draft.period_start,
      period_end: draft.period_end,
      total_tithes: draft.total_tithes || "0",
      total_offerings: draft.total_offerings || "0",
      total_expenses: draft.total_expenses || "0",
      notes: draft.notes.trim(),
      published_to_members: draft.published_to_members,
    };

    const res = await fetch(
      report ? `${API_URL}/api/members/reports/${report.id}/` : `${API_URL}/api/members/reports/`,
      { method: report ? "PATCH" : "POST", headers: authHeaders(), body: JSON.stringify(payload) }
    );

    if (res.status === 401 || res.status === 403) {
      setSaving(false);
      setGeneralError(
        res.status === 403
          ? "Posting financial reports belongs to the treasurer and the church office."
          : "Your session has ended. Sign in again to post a report."
      );
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const parsed = parseApiErrors(data, ["title", "period_start", "period_end", "total_tithes", "total_offerings", "total_expenses", "notes"]);
      setErrors(parsed.fieldErrors);
      setGeneralError(parsed.generalError || "The report could not be saved. Please check the figures and try again.");
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved();
  }

  const fieldClass = "mt-1 block w-full rounded-xl border border-sand-mute bg-white px-3 py-2 text-sm outline-none focus:border-ember";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-sand-line">
        <div className="flex items-start justify-between border-b border-sand-line pb-4">
          <div>
            <h2 className="text-xl font-semibold text-bark">
              {report ? "Edit report" : "Post a financial report"}
            </h2>
            <p className="mt-0.5 text-xs text-moss">
              {report
                ? "Corrections reach the congregation as soon as you save."
                : "Members read it under Giving › Reports once it is published."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-moss hover:bg-sand hover:text-bark"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {generalError && (
          <p className="mt-4 rounded-xl border border-ember/40 bg-sand-linen px-3 py-2 text-sm text-ember">
            {generalError}
          </p>
        )}

        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-bark sm:col-span-2">
            Title
            <input
              type="text"
              required
              maxLength={160}
              placeholder="e.g. August 2026 stewardship report"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              className={fieldClass}
            />
            {errors.title && <span className="mt-1 block text-xs text-ember">{errors.title}</span>}
          </label>

          <label className="text-sm font-medium text-bark">
            Period
            <select
              value={draft.period_type}
              onChange={(e) => set("period_type", e.target.value as PeriodType)}
              className={fieldClass}
            >
              {PERIOD_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-bark">
              From
              <input
                type="date"
                required
                value={draft.period_start}
                max={draft.period_end}
                onChange={(e) => set("period_start", e.target.value)}
                className={fieldClass}
              />
              {errors.period_start && (
                <span className="mt-1 block text-xs text-ember">{errors.period_start}</span>
              )}
            </label>
            <label className="text-sm font-medium text-bark">
              To
              <input
                type="date"
                required
                value={draft.period_end}
                min={draft.period_start}
                onChange={(e) => set("period_end", e.target.value)}
                className={fieldClass}
              />
              {errors.period_end && (
                <span className="mt-1 block text-xs text-ember">{errors.period_end}</span>
              )}
            </label>
          </div>

          <label className="text-sm font-medium text-bark">
            Tithes (KES)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.total_tithes}
              onChange={(e) => set("total_tithes", e.target.value)}
              className={fieldClass}
            />
            {errors.total_tithes && (
              <span className="mt-1 block text-xs text-ember">{errors.total_tithes}</span>
            )}
          </label>
          <label className="text-sm font-medium text-bark">
            Offerings (KES)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.total_offerings}
              onChange={(e) => set("total_offerings", e.target.value)}
              className={fieldClass}
            />
            {errors.total_offerings && (
              <span className="mt-1 block text-xs text-ember">{errors.total_offerings}</span>
            )}
          </label>
          <label className="text-sm font-medium text-bark sm:col-span-2">
            Expenses (KES)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.total_expenses}
              onChange={(e) => set("total_expenses", e.target.value)}
              className={fieldClass}
            />
            {errors.total_expenses && (
              <span className="mt-1 block text-xs text-ember">{errors.total_expenses}</span>
            )}
          </label>

          <label className="text-sm font-medium text-bark sm:col-span-2">
            Notes &amp; details
            <textarea
              rows={3}
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="What the figures include, and anything the congregation should understand about them."
              className={`${fieldClass} resize-y`}
            />
            {errors.notes && <span className="mt-1 block text-xs text-ember">{errors.notes}</span>}
          </label>

          {/* Checked by default: the point of posting a report is that members
              read it. Unticking keeps it as the desk's working copy. */}
          <label className="flex items-start gap-2.5 text-sm text-bark sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.published_to_members}
              onChange={(e) => set("published_to_members", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-sand-mute text-ember focus:ring-ember"
            />
            <span>
              Publish to members now
              <span className="mt-0.5 block text-xs text-moss">
                Leave this unticked to keep the report as a draft only the church office can see.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-sand-line pt-4 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-sand-mute px-4 py-2 text-sm font-semibold text-bark transition hover:bg-sand-linen"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-bark px-4 py-2 text-sm font-bold text-white transition hover:bg-bark/90 disabled:opacity-60"
            >
              {saving ? (
                "Saving…"
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {report ? "Save changes" : "Post report"}
                </>
              )}
            </button>
          </div>
        </form>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-moss">
          <FileText className="h-3.5 w-3.5" />
          Reports you publish appear on the congregation&apos;s Reports page immediately.
        </p>
      </div>
    </div>
  );
}
