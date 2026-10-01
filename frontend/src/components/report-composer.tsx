"use client";

import { FormEvent, useState } from "react";
import { Check, FileText, X } from "lucide-react";
import { parseApiErrors, type FieldErrors } from "@/lib/form-errors";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type PeriodType = "monthly" | "quarterly" | "annual";

export type Report = {
  id: number;
  title: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  trust_fund: string;
  local_church_offerings: string;
  expenditure: string;
  total: string;
  notes: string;
  published_to_members: boolean;
  created_at: string;
};

const PERIOD_TYPES: { value: PeriodType; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
];

/** Dates are plain days — the church's, not the reader's. */
const todayInNairobi = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());

export type Draft = {
  title: string;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  trust_fund: string;
  local_church_offerings: string;
  expenditure: string;
  notes: string;
  published_to_members: boolean;
};

/** A month-to-date starting point: the treasurer states a period, and the
 * commonest new report is the month they are in. */
export function blankDraft(): Draft {
  const today = todayInNairobi();
  return {
    title: "",
    period_type: "monthly",
    period_start: `${today.slice(0, 7)}-01`,
    period_end: today,
    trust_fund: "",
    local_church_offerings: "",
    expenditure: "",
    notes: "",
    published_to_members: true,
  };
}

export const draftFromReport = (report: Report): Draft => ({
  title: report.title,
  period_type: report.period_type,
  period_start: report.period_start,
  period_end: report.period_end,
  trust_fund: String(report.trust_fund ?? ""),
  local_church_offerings: String(report.local_church_offerings ?? ""),
  expenditure: String(report.expenditure ?? ""),
  notes: report.notes ?? "",
  published_to_members: report.published_to_members,
});

export const reportAuthHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
};

/**
 * The desk's report form — post or correct one statement.
 *
 * It is a modal rather than an inline form because writing a report is an
 * interruption to reading them, and it needs the whole width for the three
 * figures that have to line up. Both places a report can be written from — the
 * Reports page and the treasury accounts desk — open this same form, so a
 * statement is composed one way wherever the treasurer starts from.
 */
export function ReportComposer({
  report,
  initialDraft,
  onClose,
  onSaved,
}: {
  report: Report | null;
  /** A starting point for a new report — the ledger's own month to date, in
   *  the treasury's case. Ignored when correcting an existing report. */
  initialDraft?: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    report ? draftFromReport(report) : initialDraft ?? blankDraft()
  );
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
      trust_fund: draft.trust_fund || "0",
      local_church_offerings: draft.local_church_offerings || "0",
      expenditure: draft.expenditure || "0",
      notes: draft.notes.trim(),
      published_to_members: draft.published_to_members,
    };

    const res = await fetch(
      report ? `${API_URL}/api/members/reports/${report.id}/` : `${API_URL}/api/members/reports/`,
      { method: report ? "PATCH" : "POST", headers: reportAuthHeaders(), body: JSON.stringify(payload) }
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
      const parsed = parseApiErrors(data, ["title", "period_start", "period_end", "trust_fund", "local_church_offerings", "expenditure", "notes"]);
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
            Trust Fund (KES)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.trust_fund}
              onChange={(e) => set("trust_fund", e.target.value)}
              className={fieldClass}
            />
            {errors.trust_fund && (
              <span className="mt-1 block text-xs text-ember">{errors.trust_fund}</span>
            )}
          </label>
          <label className="text-sm font-medium text-bark">
            Local Church Offerings (KES)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.local_church_offerings}
              onChange={(e) => set("local_church_offerings", e.target.value)}
              className={fieldClass}
            />
            {errors.local_church_offerings && (
              <span className="mt-1 block text-xs text-ember">{errors.local_church_offerings}</span>
            )}
          </label>
          <label className="text-sm font-medium text-bark sm:col-span-2">
            Expenditure (KES)
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={draft.expenditure}
              onChange={(e) => set("expenditure", e.target.value)}
              className={fieldClass}
            />
            {errors.expenditure && (
              <span className="mt-1 block text-xs text-ember">{errors.expenditure}</span>
            )}
          </label>

          {/* The total is computed as the desk types — local offerings in,
              expenditure out, the trust fund held apart — so what the desk
              confirms is what the congregation will read. */}
          <div className="flex items-baseline justify-between rounded-xl bg-sand px-4 py-3 sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wider text-moss">Total (in hand)</span>
            <span className="text-lg font-bold text-bark">
              KES {(
                (Number(draft.local_church_offerings) || 0) -
                (Number(draft.expenditure) || 0)
              ).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
            </span>
          </div>

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
