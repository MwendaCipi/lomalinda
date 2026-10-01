"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { dayFirst } from "@/lib/dates";
import { useHeaderData } from "@/hooks/use-header-data";
import { ReportComposer, reportAuthHeaders as authHeaders, type Report } from "./report-composer";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

const money = (value: string | number) =>
  `KES ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;

/** Dates arrive as plain days; they are periods, not moments, so read them in
 * the church's timezone rather than the browser's. */
const formatDay = (iso: string) => dayFirst(iso);

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

  /** The list, as the API sees it for this viewer — published to everyone,
   *  the full register to the desk. */
  const fetchReports = useCallback(async (): Promise<Report[] | null> => {
    try {
      const res = await fetch(`${API_URL}/api/members/reports/`, { headers: authHeaders() });
      return res.ok ? ((await res.json()) as Report[]) : null;
    } catch {
      // The page still reads as "nothing published yet" rather than an error.
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    const rows = await fetchReports();
    if (rows) setReports(rows);
    setLoading(false);
  }, [fetchReports]);

  useEffect(() => {
    // Deferred by a microtask so the fetch is not started in the effect's own
    // synchronous body; the state it settles lands after the first paint.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
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

              {/* The report's figures, in the field's own language: trust fund
                  and local offerings in, expenditure out, and the total they
                  leave. On a wide screen three columns with the total beside
                  them; on a phone each figure takes its own row (label left,
                  amount right) — money columns on a 390px card wrap every
                  amount onto two lines. */}
              <dl className="mt-4 grid gap-2 border-t border-sand-line pt-4 text-sm sm:grid-cols-4 sm:gap-3">
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-[11px] uppercase tracking-wider text-moss">Trust Fund</dt>
                  <dd className="font-semibold text-bark sm:mt-1">{money(report.trust_fund)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-[11px] uppercase tracking-wider text-moss">Local Church Offerings</dt>
                  <dd className="font-semibold text-bark sm:mt-1">{money(report.local_church_offerings)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-[11px] uppercase tracking-wider text-moss">Expenditure</dt>
                  <dd className="font-semibold text-bark sm:mt-1">{money(report.expenditure)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 sm:block">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-ember">Total</dt>
                  <dd className="font-bold text-bark sm:mt-1">{money(report.total)}</dd>
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
