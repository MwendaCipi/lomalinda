"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileText, X } from "lucide-react";
import { parseApiErrors, type FieldErrors } from "@/lib/form-errors";
import { showAlert } from "@/lib/alerts";

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

/** The ledger's answer for one period: what came in, what went out — the
 *  same starting point the desk's "Publish report" opens with. */
const fetchSuggestions = async (
  periodStart: string,
  periodEnd: string
): Promise<{ trust_fund: string; local_church_offerings: string; expenditure: string } | null> => {
  const params = new URLSearchParams({ start: periodStart, end: periodEnd });
  try {
    const res = await fetch(`${API_URL}/api/members/reports/suggestions/?${params.toString()}`, {
      headers: reportAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      trust_fund: String(data.trust_fund ?? ""),
      local_church_offerings: String(data.local_church_offerings ?? ""),
      expenditure: String(data.expenditure ?? ""),
    };
  } catch {
    return null;
  }
};

/** The statement as a page, downloaded with the viewer's own credentials —
 *  a plain link would carry no token, and a draft's PDF belongs to the desk. */
const downloadStatementPdf = async (reportId: number, title: string) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  try {
    const res = await fetch(`${API_URL}/api/members/reports/${reportId}/pdf/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      await showAlert(
        "Could not prepare the PDF",
        "The church's server could not produce the statement. Please try again.",
        "error"
      );
      return;
    }
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `Financial_Report_${title.replace(/[^\w-]+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch {
    await showAlert(
      "Could not prepare the PDF",
      "The church's server could not be reached. Please try again.",
      "error"
    );
  }
};

/**
 * The desk's report form — post or correct one statement.
 *
 * It is a modal rather than an inline form because writing a report is an
 * interruption to reading them, and it needs the whole width for the three
 * figures that have to line up. Both places a report can be written from — the
 * Reports page and the treasury accounts desk — open this same form, so a
 * statement is composed one way wherever the treasurer starts from.
 *
 * The figures belong to the period: moving the From/To dates re-asks the
 * ledger what that period brought in and spent, and the total follows the
 * dates with it. Typing a figure keeps the typed value — the desk's word
 * stands until the period itself changes.
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
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  // How many figure-refreshes have been asked for: only the newest may write.
  const refreshRef = useRef(0);
  // Whether the desk has typed a figure since the period last moved: a fetch
  // that was already in flight must not overwrite what they are typing.
  const typedRef = useRef(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const setFigure = (key: "trust_fund" | "local_church_offerings" | "expenditure", value: string) => {
    typedRef.current = true;
    set(key, value);
  };

  // The period's figures, straight from the ledger, whenever the dates move —
  // including the period the form opened with. A typed figure survives only
  // while the period stands still: moving the period is asking about different
  // money, so the ledger answers again and the total follows the dates.
  useEffect(() => {
    typedRef.current = false;
    const asked = ++refreshRef.current;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setRefreshing(true);
    });
    void fetchSuggestions(draft.period_start, draft.period_end).then((next) => {
      if (cancelled || asked !== refreshRef.current) return;
      if (next && !typedRef.current) {
        setDraft((current) => ({ ...current, ...next }));
      }
      setRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
    // Only the period re-asks the ledger; the figures themselves are the
    // answer, not a dependency.
  }, [draft.period_start, draft.period_end]);

  /** Anything the desk has changed since the form opened: what the download
   *  would not carry until the statement is saved. */
  const dirty = useMemo(() => {
    const initial = report ? draftFromReport(report) : initialDraft ?? blankDraft();
    return (Object.keys(initial) as (keyof Draft)[]).some((key) => draft[key] !== initial[key]);
  }, [draft, report, initialDraft]);

  /** The period's PDF, from the saved statement. */
  const downloadStatement = async () => {
    if (report) {
      if (dirty) {
        const answer = await showAlert(
          "Unsaved corrections",
          "Download the statement as it is saved — your corrections stay on screen until you save them.",
          "info",
          { confirmButtonText: "Download", showCancelButton: true, cancelButtonText: "Keep editing" }
        );
        if (!answer.isConfirmed) return;
      }
      setDownloading(true);
      await downloadStatementPdf(report.id, report.title);
      setDownloading(false);
      return;
    }
    if (dirty) {
      await showAlert(
        "The statement is not saved yet",
        "Post the report first, then download the PDF — the page is printed from the saved statement.",
        "info"
      );
      return;
    }
    // A fresh form with nothing changed: the figures are the ledger's own, so
    // posting it here is what "download" means — the PDF can only be printed
    // from a saved statement.
    const answer = await showAlert(
      "Post this statement?",
      "A report is downloaded from the church's records, so this one will be posted first — then the PDF downloads.",
      "info",
      { confirmButtonText: "Post & download", showCancelButton: true, cancelButtonText: "Not now" }
    );
    if (!answer.isConfirmed) return;
    setDownloading(true);
    try {
      const res = await fetch(`${API_URL}/api/members/reports/`, {
        method: "POST",
        headers: reportAuthHeaders(),
        body: JSON.stringify({
          title: draft.title.trim(),
          period_type: draft.period_type,
          period_start: draft.period_start,
          period_end: draft.period_end,
          trust_fund: draft.trust_fund || "0",
          local_church_offerings: draft.local_church_offerings || "0",
          expenditure: draft.expenditure || "0",
          notes: draft.notes.trim(),
          published_to_members: draft.published_to_members,
        }),
      });
      if (!res.ok) {
        setDownloading(false);
        setGeneralError("The report could not be saved. Please check the figures and try again.");
        return;
      }
      const saved = await res.json();
      await downloadStatementPdf(saved.id, saved.title ?? draft.title);
      setDownloading(false);
      onSaved();
    } catch {
      setDownloading(false);
      setGeneralError("The report could not be saved. Please check the figures and try again.");
    }
  };

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
              onChange={(e) => setFigure("trust_fund", e.target.value)}
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
              onChange={(e) => setFigure("local_church_offerings", e.target.value)}
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
              onChange={(e) => setFigure("expenditure", e.target.value)}
              className={fieldClass}
            />
            {errors.expenditure && (
              <span className="mt-1 block text-xs text-ember">{errors.expenditure}</span>
            )}
          </label>

          {/* The total is computed as the desk works — local offerings in,
              expenditure out, the trust fund held apart — and it follows the
              period: move the dates and the ledger re-answers, so what the
              desk confirms is what the congregation will read. */}
          <div className="flex items-baseline justify-between rounded-xl bg-sand px-4 py-3 sm:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wider text-moss">
              Total (in hand)
              {refreshing && <span className="ml-2 normal-case tracking-normal text-moss-faint">counting…</span>}
            </span>
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
              type="button"
              onClick={downloadStatement}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-sand-mute px-4 py-2 text-sm font-semibold text-bark transition hover:border-ember hover:text-ember disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {downloading ? "Preparing…" : "Download report"}
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
