"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { SupportSidebar } from "@/components/sidebars/support-sidebar";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type InKindRecord = {
  id: number;
  donor_display: string;
  items_list: string[];
  purpose: string;
  notes: string;
  received_on: string;
  created_at: string;
};

// First Sabbath = first Saturday of the current month.
function firstSabbathOfCurrentMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const IN_KIND_PURPOSES = [
  "In-Kind Offering",
  "Welfare & Charity",
  "Building Project Materials",
  "Children Ministry Supplies",
  "Other",
];

function GiveInKindPageContent() {
  const [items, setItems] = useState("");
  const [purpose, setPurpose] = useState("In-Kind Offering");
  const [donorName, setDonorName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [records, setRecords] = useState<InKindRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [message, setMessage] = useState("");

  // ── In-Kind Report filters ──────────────────────────────────
  const PAGE_SIZE = 50;
  const [signedIn, setSignedIn] = useState(false);
  const [fromDate, setFromDate] = useState(firstSabbathOfCurrentMonth);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);
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
      fetch(`${API_URL}/api/members/me/`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : null))
        .then((me) => {
          if (me) {
            const full = `${me.first_name} ${me.last_name}`.trim();
            setDonorName(full || me.username || "");
          }
        })
        .catch(() => {});
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

  const itemCount = items.split("\n").filter((l) => l.trim()).length;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/in-kind/`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items,
          purpose,
          donor_name: donorName,
          notes,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage("Thank you! Your in-kind giving has been recorded.");
        setItems("");
        setNotes("");
        setPage(1);
        fetchRecords(1);
      } else {
        const detail = data.detail || Object.values(data).flat().join(" ") || "Failed to record in-kind giving.";
        setMessage(detail);
        showAlert("Not Submitted", detail, "error");
      }
    } catch {
      setMessage("Network error. Please try again.");
      showAlert("Network Error", "Could not reach the server. Please try again.", "error");
    } finally {
      setSubmitting(false);
    }
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

  const fmtReportDate = (r: InKindRecord) => {
    const raw = r.received_on || r.created_at;
    return raw ? new Date(raw).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—";
  };

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
      body{font-family:ui-sans-serif,system-ui,sans-serif;color:#26352f;padding:32px;}
      h1{font-size:20px;margin:0 0 4px;} p{color:#617068;font-size:12px;margin:0 0 20px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th{text-align:left;border-bottom:2px solid #b36b3c;padding:8px 6px;text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:#b36b3c;}
      td{border-bottom:1px solid #eeeae2;padding:8px 6px;vertical-align:top;}
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

  const handleExportCsv = async () => {
    const all = await fetchAllFiltered();
    if (all.length === 0) {
      showAlert("Nothing to Export", "No in-kind gifts match the current filters.", "info");
      return;
    }
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["#", "Date", "Donor", "Account", "Items", "Notes"].join(","),
      ...all.map((r, i) =>
        [String(i + 1), fmtReportDate(r), r.donor_display || "Anonymous", r.purpose || "", (r.items_list || []).join("; "), r.notes || ""].map(esc).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `in-kind-report-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-[#26352f]">
      <div className="flex">
        <SupportSidebar />

        <div className="flex-1 min-w-0 px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-3xl space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#b36b3c]">Giving</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">In-Kind Giving</h1>
              <p className="mt-2 text-sm text-[#617068]">
                Donate goods, produce, or materials instead of money. Each gift is recorded for the church
                stewardship team. These gifts are tracked separately from monetary reports.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-[#dfdbd1] bg-white p-5 shadow-sm sm:p-6">
              <div>
                <label className="block text-xs font-semibold text-[#26352f]">
                  Items donated <span className="text-[#617068]">({itemCount} item{itemCount === 1 ? "" : "s"})</span> *
                </label>
                <textarea
                  required
                  rows={5}
                  value={items}
                  onChange={(e) => setItems(e.target.value)}
                  placeholder={"One item per row, e.g.\n2 bags of maize flour\n1 carton of cooking oil\n50 exercise books"}
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-3 text-sm focus:border-[#b36b3c] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[#617068]">Write each item on its own line.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Account</label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  >
                    {IN_KIND_PURPOSES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#26352f]">Your name</label>
                  <input
                    type="text"
                    value={donorName}
                    onChange={(e) => setDonorName(e.target.value)}
                    placeholder="Leave blank to give anonymously"
                    className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#26352f]">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything the stewardship team should know"
                  className="mt-1.5 w-full rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2.5 text-xs focus:border-[#b36b3c] focus:outline-none"
                />
              </div>

              {message && (
                <p className={`rounded-xl p-3 text-xs font-semibold ${message.includes("Thank you") ? "bg-[#eef2ed] text-[#3d5148]" : "bg-red-50 text-red-700"}`}>
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || itemCount === 0}
                className="w-full rounded-xl bg-[#b36b3c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#96552c] disabled:opacity-60"
              >
                {submitting ? "Recording…" : "Record In-Kind Gift"}
              </button>
            </form>

            {/* ── In-Kind Report (signed-in users) ── */}
            {signedIn && (
              <section className="overflow-hidden rounded-2xl border border-[#dfdbd1] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfdbd1] px-5 py-4">
                  <div>
                    <h2 className="text-base font-bold text-[#26352f]">In-Kind Report</h2>
                    <p className="mt-0.5 text-[11px] text-[#617068]">
                      {loadingRecords
                        ? "Loading records…"
                        : `${serverCount} gift${serverCount === 1 ? "" : "s"} · ${serverTotalItems} item${serverTotalItems === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      max={toDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      title="From date"
                      className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
                    />
                    <span className="text-xs text-[#617068]">→</span>
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate}
                      onChange={(e) => setToDate(e.target.value)}
                      title="To date"
                      className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
                    />
                    <select
                      value={purposeFilter}
                      onChange={(e) => setPurposeFilter(e.target.value)}
                      className="rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-3 py-2 text-xs font-semibold text-[#26352f] focus:border-[#b36b3c] focus:outline-none"
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
                      className="min-w-[120px] flex-1 rounded-xl border border-[#dfdbd1] bg-[#f7f4ee] px-4 py-2 text-xs focus:border-[#b36b3c] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-y-auto overscroll-contain custom-table-scrollbar px-5 py-3">
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#dfdbd1]">
                        <tr className="text-[11px] font-bold uppercase tracking-wider text-[#b36b3c]">
                          <th className="pb-3 font-bold w-8">#</th>
                          <th className="pb-3 font-bold">Date</th>
                          <th className="pb-3 font-bold">Donor</th>
                          <th className="pb-3 font-bold">Account</th>
                          <th className="pb-3 font-bold">Items</th>
                          <th className="pb-3 font-bold">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eeeae2]">
                        {loadingRecords ? (
                          <tr><td colSpan={6} className="py-8 text-center text-xs text-[#617068]">Loading records…</td></tr>
                        ) : records.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center">
                              <p className="text-xs font-semibold text-[#26352f]">No in-kind gifts in this period</p>
                              <p className="mt-1 text-[11px] text-[#617068]">Adjust the dates above or record a gift using the form.</p>
                            </td>
                          </tr>
                        ) : (
                          records.map((r, idx) => (
                            <tr key={r.id} className="hover:bg-[#f7f4ee]">
                              <td className="py-3 text-[#617068] w-8">{idx + 1}</td>
                              <td className="py-3 text-[#617068]">{fmtReportDate(r)}</td>
                              <td className="py-3 font-semibold text-[#26352f]">{r.donor_display || "Anonymous"}</td>
                              <td className="py-3 text-[#617068]">{r.purpose || "—"}</td>
                              <td className="py-3 text-[#617068]">{(r.items_list || []).join(" • ")}</td>
                              <td className="py-3 text-[#617068]">{r.notes || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards scroll inside the same container as the desktop table */}
                  <div className="grid gap-3">
                    {loadingRecords ? (
                      <div className="py-8 text-center text-xs text-[#617068]">Loading records…</div>
                    ) : records.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#617068]">No in-kind gifts in this period.</div>
                    ) : (
                      records.map((r) => (
                        <div key={r.id} className="rounded-2xl border border-[#dfdbd1] bg-white p-4 shadow-sm space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-sm text-[#26352f]">{r.donor_display || "Anonymous"}</h3>
                            <span className="shrink-0 text-[10px] text-[#617068]">{fmtReportDate(r)}</span>
                          </div>
                          <p className="text-xs text-[#617068]">{(r.items_list || []).join(" • ")}</p>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#b36b3c]">{r.purpose}</p>
                          {r.notes && <p className="text-[11px] text-[#617068] italic">{r.notes}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfdbd1] px-5 py-3">
                  <p className="text-[11px] text-[#617068]">
                    {fromDate} → {toDate}
                    {!loadingRecords && serverCount > 0 && ` · ${serverTotalItems} item${serverTotalItems === 1 ? "" : "s"}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => goToPage(page - 1)}
                        disabled={page <= 1 || loadingRecords}
                        className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee] disabled:opacity-40"
                      >
                        ‹ Prev
                      </button>
                      <span className="text-[11px] text-[#617068]">Page {page} of {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => goToPage(page + 1)}
                        disabled={page >= totalPages || loadingRecords}
                        className="rounded-lg border border-[#c9c5bb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#26352f] hover:bg-[#f7f4ee] disabled:opacity-40"
                      >
                        Next ›
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      disabled={serverCount === 0}
                      className="rounded-xl border border-[#c9c5bb] bg-white px-4 py-2 text-xs font-semibold text-[#26352f] transition hover:border-[#b36b3c] hover:bg-[#f7f4ee] disabled:opacity-50"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintReport}
                      disabled={serverCount === 0}
                      className="rounded-xl bg-[#b36b3c] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#96552c] disabled:opacity-50"
                    >
                      🖨️ Print Report
                    </button>
                  </div>
                </div>
              </section>
            )}

            <p className="text-center text-xs text-[#617068]">
              Prefer to give money? <Link href="/give/" className="font-semibold text-[#b36b3c] hover:underline">Give tithes &amp; offerings</Link>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function GiveInKindPage() {
  return <GiveInKindPageContent />;
}
