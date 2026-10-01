"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, EyeOff, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
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

  /** The Actions popover: which statement's menu is open, and where to draw
   *  it. The register scrolls horizontally, so a plain absolute menu would
   *  be clipped by the table's edge — the menu is positioned against the
   *  page, above or below its button as the room allows. */
  const [openMenu, setOpenMenu] = useState<{ report: Report; x: number; y: number; below: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toggleMenu = (report: Report, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (openMenu?.report.id === report.id) {
      setOpenMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setOpenMenu({
      report,
      x: rect.right,
      y: rect.bottom,
      below: rect.bottom + 190 <= window.innerHeight,
    });
  };

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

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

  /** The statement as a page: fetched with the viewer's own credentials, so
   *  a draft hands out its PDF only to the desk that owns it — a plain link
   *  would carry no token and could never tell the desk from a stranger. */
  const downloadPdf = async (report: Report) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    try {
      const res = await fetch(`${API_URL}/api/members/reports/${report.id}/pdf/`, {
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
      a.download = `Financial_Report_${report.title.replace(/[^\w-]+/g, "_")}.pdf`;
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
        <>
        <div className="hidden overflow-x-auto rounded-2xl border border-sand-line bg-white shadow-sm md:block">
          {/* One list, two shapes: a desk scans a register — one row per
              statement, the figures as columns — while a phone reads a card
              per statement. The desk's actions ride the row's end; the
              congregation reads figures only. */}
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] font-bold uppercase tracking-wider text-ember">
              <tr className="border-b border-sand-line">
                <th className="px-4 py-3 font-bold">Period</th>
                <th className="px-4 py-3 font-bold">Statement</th>
                <th className="px-4 py-3 text-right font-bold">Trust Fund</th>
                <th className="px-4 py-3 text-right font-bold">Offerings</th>
                <th className="px-4 py-3 text-right font-bold">Expenditure</th>
                <th className="px-4 py-3 text-right font-bold">Total in hand</th>
                {canManage && <th className="px-4 py-3 text-right font-bold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-soft">
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="px-4 py-3">
                    <span className="font-semibold capitalize text-ember">{report.period_type}</span>
                    <span className="mt-0.5 block whitespace-nowrap text-[11px] text-moss">
                      {formatDay(report.period_start)} – {formatDay(report.period_end)}
                    </span>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    <span className="font-semibold text-bark">{report.title}</span>
                    {canManage && !report.published_to_members && (
                      <span className="ml-2 rounded-full border border-sand-mute px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-moss">
                        Draft
                      </span>
                    )}
                    {report.notes && (
                      <span className="mt-0.5 block truncate text-[11px] text-moss" title={report.notes}>
                        {report.notes}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-moss">{money(report.trust_fund)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-moss">{money(report.local_church_offerings)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-moss">{money(report.expenditure)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-bark">{money(report.total)}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {/* The row's actions live in one menu — nothing shows
                          until it is asked for. */}
                      <button
                        type="button"
                        onClick={(e) => toggleMenu(report, e)}
                        aria-expanded={openMenu?.report.id === report.id}
                        aria-label={`Actions for ${report.title}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-sand-mute px-2.5 py-1 text-[11px] font-semibold text-bark transition hover:border-ember hover:bg-sand-linen"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" /> Actions
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:hidden">
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
                {/* The paper copy is the desk's instrument — for the
                    noticeboard or the records file — so only the desk sees
                    the way to it. The server enforces this too. */}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => downloadPdf(report)}
                    className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-ember transition hover:text-bark"
                  >
                    <Download className="h-3.5 w-3.5" /> Download PDF
                  </button>
                )}
              </div>

              <h3 className="mt-3 text-lg font-semibold text-bark">{report.title}</h3>

              {/* The report's figures, in the field's own language: trust
                  fund and local offerings in, expenditure out, and the total
                  in hand — the local offerings less what was spent, with the
                  trust fund held apart. On a phone each figure takes its own
                  row (label left, amount right) — money columns on a 390px
                  card wrap every amount onto two lines. */}
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
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-ember">Total in hand</dt>
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
        </>
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

      {/* The Actions menu, drawn against the page so the register's own
          scrolling never clips it. */}
      {openMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 w-44 rounded-xl border border-sand-line bg-white py-1 shadow-lg"
          style={{
            top: openMenu.below ? openMenu.y + 4 : undefined,
            bottom: openMenu.below ? undefined : window.innerHeight - openMenu.y + 4,
            left: Math.max(8, openMenu.x - 176),
          }}
        >
          <button
            type="button"
            onClick={() => { setOpenMenu(null); void downloadPdf(openMenu.report); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
          >
            <Download size={12} aria-hidden="true" /> Download PDF
          </button>
          <button
            type="button"
            onClick={() => { setOpenMenu(null); void setPublished(openMenu.report, !openMenu.report.published_to_members); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
          >
            {openMenu.report.published_to_members ? <EyeOff size={12} aria-hidden="true" /> : <Eye size={12} aria-hidden="true" />}
            {openMenu.report.published_to_members ? "Unpublish" : "Publish"}
          </button>
          <button
            type="button"
            onClick={() => { setOpenMenu(null); openComposer(openMenu.report); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-bark hover:bg-sand"
          >
            <Pencil size={12} aria-hidden="true" /> Edit
          </button>
          <button
            type="button"
            onClick={() => { setOpenMenu(null); void remove(openMenu.report); }}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-alert hover:bg-alert-wash"
          >
            <Trash2 size={12} aria-hidden="true" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}
