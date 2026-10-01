"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Printer, Receipt, RotateCw } from "lucide-react";
import { brand } from "@/lib/brand";
import { showAlert } from "@/lib/alerts";
import { localDate, firstDayOfMonth, dayFirst } from "@/lib/dates";
import { InKindGiftModal } from "@/components/in-kind-gift-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Same key the money-giving page writes and sign-out clears: one eye state
// per browser, covering both giving records.
const GIVINGS_VISIBLE_KEY = "my_givings_visible";

type InKindRecord = {
  id: number;
  donor_display: string;
  items_list: string[];
  purpose: string;
  notes: string;
  received_on: string;
  created_at: string;
};

const IN_KIND_PURPOSES = [
  "In-Kind Offering",
  "Welfare & Charity",
  "Building Project Materials",
  "Children Ministry Supplies",
  "Other",
];

function GiveInKindPageContent() {
  const [records, setRecords] = useState<InKindRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  // The giving form lives in a modal, opened by Give Now — the page itself is
  // the record of what has been given, mirroring the money-giving page.
  const [showGiveModal, setShowGiveModal] = useState(false);
  // Privacy first, same as the money-giving page: the record starts hidden,
  // the eye beside the heading reveals it, and the choice sticks across visits.
  const [givingsVisible, setGivingsVisible] = useState(false);

  // ── In-Kind Report filters ──────────────────────────────────
  const PAGE_SIZE = 50;
  const [signedIn, setSignedIn] = useState(false);
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(() => localDate());
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [reportSearch, setReportSearch] = useState("");
  const [page, setPage] = useState(1);
  const [serverCount, setServerCount] = useState(0);
  const [serverTotalItems, setServerTotalItems] = useState(0);

  const buildQuery = (pageNum: number, pageSize?: number) => {
    const params = new URLSearchParams();
    params.set("page", String(pageNum));
    if (pageSize) params.set("page_size", String(pageSize));
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (purposeFilter !== "all") params.set("purpose", purposeFilter);
    if (reportSearch.trim()) params.set("search", reportSearch.trim());
    return params.toString();
  };

  const fetchRecords = (pageNum: number) => {
    const token = localStorage.getItem("access_token");
    setLoadingRecords(true);
    fetch(`${API_URL}/api/members/in-kind/?${buildQuery(pageNum)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.results)) {
          setRecords(data.results);
          setServerCount(typeof data.count === "number" ? data.count : data.results.length);
          setServerTotalItems(typeof data.total_items === "number" ? data.total_items : 0);
        } else {
          setRecords([]);
          setServerCount(0);
          setServerTotalItems(0);
        }
      })
      .catch(() => {
        setRecords([]);
        setServerCount(0);
        setServerTotalItems(0);
      })
      .finally(() => setLoadingRecords(false));
  };

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      setSignedIn(true);
      // A member who revealed the record keeps it revealed on their next
      // visit; sign-out clears the key so shared devices start private.
      if (localStorage.getItem(GIVINGS_VISIBLE_KEY) === "1") setGivingsVisible(true);
    }
  }, []);

  // Refetch when filters change (debounced for search typing); resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      fetchRecords(1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, purposeFilter, reportSearch]);

  const totalPages = Math.max(1, Math.ceil(serverCount / PAGE_SIZE));

  const goToPage = (target: number) => {
    const clamped = Math.min(Math.max(1, target), totalPages);
    setPage(clamped);
    fetchRecords(clamped);
  };

  // ── In-Kind Report ──────────────────────────────────────────
  // In-Kind Report (server-filtered; `records` = current page)
  const reportPurposes = Array.from(
    new Set([...IN_KIND_PURPOSES, ...records.map((r) => r.purpose).filter(Boolean)])
  ).sort();

  // Fetch every page matching the current filters (for print / CSV export).
  const fetchAllFiltered = async (): Promise<InKindRecord[]> => {
    const token = localStorage.getItem("access_token");
    const all: InKindRecord[] = [];
    for (let p = 1; p <= 40; p++) {
      const res = await fetch(`${API_URL}/api/members/in-kind/?${buildQuery(p, 200)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) break;
      const data = await res.json().catch(() => null);
      const results: InKindRecord[] = data?.results ?? (Array.isArray(data) ? data : []);
      all.push(...results);
      if (results.length === 0 || !data?.results || all.length >= (data.count ?? all.length)) break;
    }
    return all;
  };

  const fmtReportDate = (r: InKindRecord) => dayFirst(r.received_on || r.created_at);

  const handlePrintReport = async () => {
    const all = await fetchAllFiltered();
    if (all.length === 0) {
      showAlert("Nothing to Print", "No in-kind gifts match the current filters.", "info");
      return;
    }
    const allItems = all.reduce((sum, r) => sum + (r.items_list?.length || 0), 0);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = all
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${esc(fmtReportDate(r))}</td><td>${esc(r.donor_display || "Anonymous")}</td><td>${esc(r.purpose || "—")}</td><td>${esc((r.items_list || []).join("; "))}</td><td>${esc(r.notes || "")}</td></tr>`
      )
      .join("");
    const win = window.open("", "_blank", "width=950,height=650");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>In-Kind Giving Report</title><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:${brand.bark};padding:32px;}
      h1{font-size:20px;margin:0 0 4px;} p{color:${brand.moss};font-size:12px;margin:0 0 20px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th{text-align:left;border-bottom:2px solid ${brand.ember};padding:8px 6px;text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:${brand.ember};}
      td{border-bottom:1px solid ${brand.sandSoft};padding:8px 6px;vertical-align:top;}
      .total{margin-top:16px;font-weight:700;}
    </style></head><body>
      <h1>In-Kind Giving Report</h1>
      <p>${fromDate} to ${toDate} · ${all.length} gift${all.length === 1 ? "" : "s"} · ${allItems} item${allItems === 1 ? "" : "s"}</p>
      <table><thead><tr><th>#</th><th>Date</th><th>Donor</th><th>Account</th><th>Items</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="total">Total: ${all.length} gift${all.length === 1 ? "" : "s"} · ${allItems} item${allItems === 1 ? "" : "s"}</p>
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // The thermal receipt is drawn server-side and downloaded as a blob, the
  // same way the money-giving receipts are — works in the PWA on phones.
  async function handleDownloadReceipt(r: InKindRecord) {
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_URL}/api/members/in-kind/${r.id}/receipt/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Receipt unavailable.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `InKind_Receipt_${r.received_on}_${r.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showAlert("Receipt Unavailable", "We could not generate the receipt for this gift.", "error");
    }
  }

  return (
    <main className="min-h-screen bg-sand text-bark">
      <div className="flex">

        <div className="flex-1 min-w-0 px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl space-y-6">
            {/* The strip names the page; the h1 is for screen readers. */}
            <h1 className="sr-only">In-Kind Giving</h1>
            <p className="sr-only">Donate goods, produce, or materials instead of money.</p>

            {/* ── My In-Kind Givings: the page is the record, like My Givings on
                the money-giving page. The form is a modal away. ── */}
            {signedIn && (
              <section className="overflow-hidden rounded-2xl border border-sand-line bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-line px-5 py-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="text-base font-bold text-bark">My In-Kind Givings</h2>
                    {/* Same eye as the money page: crossed while hidden, open
                        while shown, and the state persists across visits. */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !givingsVisible;
                        setGivingsVisible(next);
                        try {
                          localStorage.setItem(GIVINGS_VISIBLE_KEY, next ? "1" : "0");
                        } catch {}
                      }}
                      aria-pressed={givingsVisible}
                      aria-label={givingsVisible ? "Hide my in-kind givings" : "Show my in-kind givings"}
                      title={givingsVisible ? "Hide my in-kind givings" : "Show my in-kind givings"}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sand-line bg-sand text-moss transition hover:border-ember hover:text-ember"
                    >
                      {givingsVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Refresh in the header, like the money page — Give Now
                      moves to the center of the hidden state. */}
                  <button
                    type="button"
                    onClick={() => fetchRecords(page)}
                    title="Refresh my in-kind givings"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sand-line bg-sand px-3.5 py-2 text-xs font-semibold text-moss transition hover:border-ember hover:text-ember"
                  >
                    <RotateCw className={`h-3.5 w-3.5 ${loadingRecords ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                {!givingsVisible ? (
                  <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-5 py-10">
                    <p className="text-xs text-moss">Your in-kind giving record is hidden. Tap the eye beside “My In-Kind Givings” to show it.</p>
                    <button
                      type="button"
                      onClick={() => setShowGiveModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-deep"
                    >
                      Give Now
                    </button>
                  </div>
                ) : (
                <>
                {/* Same two-row shape as the money-giving page: the date span
                    on one row, the compact purpose filter beside the search
                    on the next — every control on one line per row, mobile
                    included. */}
                <div className="flex flex-col gap-2 border-b border-sand-line px-5 py-3 md:flex-row md:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      max={toDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      title="From date"
                      className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs focus:border-ember focus:outline-none"
                    />
                    <ArrowRight size={12} className="shrink-0 text-moss" aria-hidden="true" />
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate}
                      onChange={(e) => setToDate(e.target.value)}
                      title="To date"
                      className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs focus:border-ember focus:outline-none"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <select
                      value={purposeFilter}
                      onChange={(e) => setPurposeFilter(e.target.value)}
                      aria-label="Filter by purpose"
                      className="h-9 w-[42%] max-w-[180px] shrink-0 rounded-xl border border-sand-line bg-sand px-2 py-2 text-xs font-semibold text-bark focus:border-ember focus:outline-none"
                    >
                      <option value="all">All purposes</option>
                      {reportPurposes.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={reportSearch}
                      onChange={(e) => setReportSearch(e.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none"
                    />
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-y-auto overscroll-contain custom-table-scrollbar px-5 py-3">
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-sand-line">
                        <tr className="text-[11px] font-bold uppercase tracking-wider text-ember">
                          <th className="pb-3 font-bold w-8">#</th>
                          <th className="pb-3 font-bold">Date</th>
                          <th className="pb-3 font-bold">Donor</th>
                          <th className="pb-3 font-bold">Account</th>
                          <th className="pb-3 font-bold">Items</th>
                          <th className="pb-3 font-bold">Notes</th>
                          <th className="pb-3 text-right font-bold">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sand-soft">
                        {loadingRecords ? (
                          <tr><td colSpan={7} className="py-8 text-center text-xs text-moss">Loading records…</td></tr>
                        ) : records.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center">
                              <p className="text-xs font-semibold text-bark">No in-kind gifts in this period</p>
                              <p className="mt-1 text-[11px] text-moss">Adjust the dates above or tap Give Now.</p>
                            </td>
                          </tr>
                        ) : (
                          records.map((r, idx) => (
                            <tr key={r.id} className="hover:bg-sand">
                              <td className="py-3 text-moss w-8">{idx + 1}</td>
                              <td className="py-3 text-moss">{fmtReportDate(r)}</td>
                              <td className="py-3 font-semibold text-bark">{r.donor_display || "Anonymous"}</td>
                              <td className="py-3 text-moss">{r.purpose || "—"}</td>
                              <td className="py-3 text-moss">{(r.items_list || []).join(" • ")}</td>
                              <td className="py-3 text-moss">{r.notes || "—"}</td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadReceipt(r)}
                                  className="rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-[11px] font-semibold text-bark transition hover:border-ember hover:bg-sand"
                                  title="Download receipt"
                                >
                                  <Receipt size={10} className="inline" aria-hidden="true" /> Receipt
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards scroll inside the same container as the desktop table */}
                  <div className="grid gap-3 md:hidden">
                    {loadingRecords ? (
                      <div className="py-8 text-center text-xs text-moss">Loading records…</div>
                    ) : records.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-xs font-semibold text-bark">No in-kind gifts in this period</p>
                        <p className="mt-1 text-[11px] text-moss">Adjust the dates above or tap Give Now.</p>
                      </div>
                    ) : (
                      records.map((r) => (
                        <div key={r.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-bark">{r.donor_display || "Anonymous"}</h3>
                            <span className="shrink-0 text-[10px] text-moss">{fmtReportDate(r)}</span>
                          </div>
                          <p className="text-xs text-moss">{(r.items_list || []).join(" • ")}</p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ember">{r.purpose}</p>
                          {r.notes && <p className="text-[11px] text-moss italic">{r.notes}</p>}
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleDownloadReceipt(r)}
                              className="rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-[11px] font-semibold text-bark transition hover:border-ember hover:bg-sand"
                            >
                              <Receipt size={10} className="inline" aria-hidden="true" /> Receipt
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-line px-5 py-3">
                  <p className="text-[11px] text-moss">
                    {fromDate} <ArrowRight size={10} className="inline" aria-hidden="true" /> {toDate}
                    {!loadingRecords && serverCount > 0 && ` · ${serverTotalItems} item${serverTotalItems === 1 ? "" : "s"}`}
                  </p>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <div className="flex w-full items-center justify-center gap-1.5 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => goToPage(page - 1)}
                        disabled={page <= 1 || loadingRecords}
                        className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark hover:bg-sand disabled:opacity-40"
                      >
                        ‹ Prev
                      </button>
                      <span className="text-[11px] text-moss">Page {page} of {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => goToPage(page + 1)}
                        disabled={page >= totalPages || loadingRecords}
                        className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark hover:bg-sand disabled:opacity-40"
                      >
                        Next ›
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handlePrintReport}
                      disabled={serverCount === 0}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-sand-mute bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand disabled:opacity-50 sm:flex-none"
                    >
                      <Printer size={12} className="inline" aria-hidden="true" /> Print Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGiveModal(true)}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep sm:flex-none"
                    >
                      Give Now
                    </button>
                  </div>
                </div>
                </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* The giving form, the same modal the announcements open — one form,
          so a gift is filed identically wherever it is given. */}
      <InKindGiftModal
        open={showGiveModal}
        onClose={() => setShowGiveModal(false)}
        onRecorded={() => { setPage(1); fetchRecords(1); }}
      />
    </main>
  );
}

export default function GiveInKindPage() {
  return <GiveInKindPageContent />;
}
