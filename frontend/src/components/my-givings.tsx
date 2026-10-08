"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, Printer, Receipt, RotateCw, SlidersHorizontal } from "lucide-react";
import { brand } from "@/lib/brand";
import { localDate, firstDayOfMonth, dayFirstTime } from "@/lib/dates";
import { showAlert } from "@/lib/alerts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Remembers the eye toggle across visits: revealing the record is a
    deliberate act, so the choice to show it sticks until hidden again. */
const GIVINGS_VISIBLE_KEY = "my_givings_visible";

/**
 * The moment a gift was initiated, stamped by the giving page. This page reads
 * it on arrival and polls quietly until it lapses: the M-Pesa prompt has to be
 * answered with a PIN before the contribution exists, so without this the
 * member would open their record and see the gift they just made missing.
 */
export const PENDING_GIVINGS_KEY = "my_givings_pending_until";

/* ── The eye's little store ────────────────────────────────────────────────

   Visibility lives in localStorage, so it is read through the browser's own
   subscription primitive rather than a `setState` in an effect: the server
   snapshot is always "hidden" (the server knows nothing of this browser),
   which also keeps hydration honest — the record never flashes open on load.

   Exported because both giving records keep the same switch: one eye state
   per browser, covering money and in-kind together (sign-out clears the key). */
const visibleListeners = new Set<() => void>();

export function subscribeGivingsVisibility(listener: () => void): () => void {
  visibleListeners.add(listener);
  return () => visibleListeners.delete(listener);
}

export function readGivingsVisibility(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(GIVINGS_VISIBLE_KEY) === "1";
  } catch {
    return false;
  }
}

export const serverGivingsVisibility = () => false;

export function writeGivingsVisibility(next: boolean): void {
  try {
    localStorage.setItem(GIVINGS_VISIBLE_KEY, next ? "1" : "0");
  } catch {}
  visibleListeners.forEach((listener) => listener());
}

/** One row from /giving-accounts/: the label givers read and the short account name M-Pesa shows. */
type MyGiving = {
  id: number;
  amount: string | number;
  currency?: string;
  purpose: string;
  payment_method: string;
  status: string;
  mpesa_receipt_number?: string;
  paid_at?: string | null;
  created_at: string;
};

const methodLabel = (m: string) =>
  m === "mpesa" ? "M-Pesa" : m === "bank_transfer" ? "Bank-to-Bank" : m;

const statusLabel = (s: string) => {
  const v = (s || "").toLowerCase();
  return v === "completed" ? "Completed" : v === "failed" ? "Failed" : v === "cancelled" ? "Cancelled" : "Pending";
};

const statusBadge = (s: string) => {
  const v = (s || "").toLowerCase();
  const styles =
    v === "completed"
      ? "bg-mist-select text-sage-strong"
      : v === "failed" || v === "cancelled"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${styles}`}>{statusLabel(v)}</span>;
};

/**
 * The member's giving record — the table of what they gave, with its filters,
 * its receipts and its privacy eye.
 *
 * This used to be the body of the giving page, where it displaced the very act
 * of giving. It lives on its own route now (`/member/givings`, linked from the
 * account menu), so the record can be opened, refreshed and deep-linked on its
 * own while the giving page stays about giving.
 */
export function MyGivings() {
  const [myGivings, setMyGivings] = useState<MyGiving[]>([]);
  // Starts "loading" exactly when there is an account to load it for, so the
  // first paint already shows the spinner without an effect having to start
  // it (a token read at mount — this route is behind the sign-in gate).
  const [loadingGivings, setLoadingGivings] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem("access_token")
  );
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(() => localDate());
  const [givingSearch, setGivingSearch] = useState("");
  // Status filter replaces the old purpose dropdown: Successful by default,
  // with Failed and All for reviewing attempts that never completed. Purpose
  // filtering is covered by the search box, which matches purpose text.
  const [givingStatusFilter, setGivingStatusFilter] = useState<"successful" | "failed" | "all">("successful");
  const [showStatusFilterMenu, setShowStatusFilterMenu] = useState(false);
  // Privacy first: a member's giving record starts hidden, shown only while
  // the eye is open — screensharing a phone at church shouldn't expose it.
  const givingsVisible = useSyncExternalStore(subscribeGivingsVisibility, readGivingsVisibility, serverGivingsVisibility);

  const loadMyGivings = (opts?: { silent?: boolean }) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    // The spinner is turned on by whoever asks for a visible load (the first
    // paint's initial state, or the Refresh button's own click) and off here:
    // a silent polling load never shows it and never blanks the list on a
    // hiccup — only deliberate refreshes do.
    fetch(`${API_URL}/api/members/contributions/?include_failed=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMyGivings(Array.isArray(data) ? data : []))
      .catch(() => {
        if (!opts?.silent) setMyGivings([]);
      })
      .finally(() => setLoadingGivings(false));
  };

  useEffect(() => {
    loadMyGivings();

    // A gift initiated on the giving page stamps a watch window; poll quietly
    // until it lapses so the completed gift appears on its own — no manual
    // refresh, and no polling for a member who has just been reading.
    const stamped = Number(localStorage.getItem(PENDING_GIVINGS_KEY) || 0);
    if (!stamped) return;
    if (stamped <= Date.now()) {
      localStorage.removeItem(PENDING_GIVINGS_KEY);
      return;
    }
    const tick = setInterval(() => {
      if (Date.now() > stamped) {
        clearInterval(tick);
        localStorage.removeItem(PENDING_GIVINGS_KEY);
        return;
      }
      loadMyGivings({ silent: true });
    }, 10000);
    return () => clearInterval(tick);
  }, []);

  const givingDateOf = (g: MyGiving) => (g.paid_at || g.created_at || "").slice(0, 10);

  const filteredGivings = myGivings.filter((g) => {
    const d = givingDateOf(g);
    if (fromDate && d && d < fromDate) return false;
    if (toDate && d && d > toDate) return false;
    const status = (g.status || "").toLowerCase();
    if (givingStatusFilter === "successful" && status !== "completed") return false;
    if (givingStatusFilter === "failed" && status !== "failed" && status !== "cancelled") return false;
    const q = givingSearch.toLowerCase();
    if (q && !`${g.purpose} ${g.payment_method} ${g.mpesa_receipt_number || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  // Totals count money actually given; failed attempts stay visible but never inflate the sum.
  const givingTotal = filteredGivings.reduce((sum, g) => ((g.status || "").toLowerCase() === "completed" ? sum + Number(g.amount || 0) : sum), 0);

  /** Download the server-rendered thermal receipt for one giving. The PDF
   *  arrives as a blob so the browser's download sheet opens on mobile too. */
  const handleDownloadReceipt = async (g: MyGiving) => {
    const token = localStorage.getItem("access_token");
    try {
      const res = await fetch(`${API_URL}/api/members/contributions/${g.id}/receipt/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Could not generate the receipt.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Giving_Receipt_${(g.mpesa_receipt_number || g.id)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showAlert("Receipt Error", error instanceof Error ? error.message : "Could not generate the receipt.", "error");
    }
  };

  const fmtGivingDate = (g: MyGiving) => dayFirstTime(g.paid_at || g.created_at);

  const handlePrintMyReport = () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows = filteredGivings
      .map(
        (g, i) =>
          `<tr><td>${i + 1}</td><td>${esc(fmtGivingDate(g))}</td><td>${esc(g.purpose || "—")}</td><td>${esc(methodLabel(g.payment_method))}</td><td>${esc(g.mpesa_receipt_number || "—")}</td><td style="text-align:right">KES ${Number(g.amount || 0).toLocaleString()}</td><td>${statusLabel(g.status)}</td></tr>`
      )
      .join("");
    const win = window.open("", "_blank", "width=900,height=650");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>My Giving Report</title><style>\n      body{font-family:ui-sans-serif,system-ui,sans-serif;color:${brand.bark};padding:32px;}\n      h1{font-size:20px;margin:0 0 4px;} p{color:${brand.moss};font-size:12px;margin:0 0 20px;}\n      table{width:100%;border-collapse:collapse;font-size:12px;}\n      th{text-align:left;border-bottom:2px solid ${brand.ember};padding:8px 6px;text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:${brand.ember};}\n      td{border-bottom:1px solid ${brand.sandSoft};padding:8px 6px;}\n      .total{margin-top:16px;text-align:right;font-weight:700;}\n    </style></head><body>\n      <h1>My Giving Report</h1>\n      <p>${dayFirstTime(fromDate)} to ${dayFirstTime(toDate)}</p>\n      <table><thead><tr><th>#</th><th>Date</th><th>Account</th><th>Method</th><th>Receipt</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>\n      <p class="total">Total: KES ${givingTotal.toLocaleString()}</p>\n    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <section
      aria-label="My Givings"
      className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-sand-line"
    >
      {/* The shell already names the page above this card, so the header here
          carries only what acts on the record: the eye and a quiet refresh. */}
      <div className="flex items-center justify-end gap-2 border-b border-sand-line px-5 py-4">
        <button
          type="button"
          onClick={() => writeGivingsVisibility(!givingsVisible)}
          aria-pressed={givingsVisible}
          aria-label={givingsVisible ? "Hide my givings" : "Show my givings"}
          title={givingsVisible ? "Hide my givings" : "Show my givings"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sand-line bg-sand text-moss transition hover:border-ember hover:text-ember"
        >
          {givingsVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => {
            // Guard first: with no token the load would return immediately
            // and leave the spinner it just turned on spinning forever.
            if (!localStorage.getItem("access_token")) return;
            setLoadingGivings(true);
            loadMyGivings();
          }}
          title="Refresh my givings"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sand-line bg-sand px-3.5 py-2 text-xs font-semibold text-moss transition hover:border-ember hover:text-ember"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loadingGivings ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className={`flex flex-col gap-2 border-b border-sand-line px-5 py-4 md:flex-row md:items-center ${givingsVisible ? "" : "hidden"}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} title="From date" className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs focus:border-ember focus:outline-none" />
          <ArrowRight size={12} className="shrink-0 text-moss" aria-hidden="true" />
          <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)} title="To date" className="min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 py-2 text-xs focus:border-ember focus:outline-none" />
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center">
          {/* Mobile: the three statuses live behind one compact Filters button; the segmented control stays for desktop. */}
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setShowStatusFilterMenu((open) => !open)}
              aria-expanded={showStatusFilterMenu}
              aria-label="Filter by status"
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold transition ${
                givingStatusFilter === "successful"
                  ? "border-sand-line bg-sand text-moss"
                  : "border-bark bg-bark text-white shadow-sm"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {givingStatusFilter === "successful" ? "Filter" : givingStatusFilter === "failed" ? "Failed" : "All"}
            </button>
            {showStatusFilterMenu && (
              <div className="absolute z-20 mt-2 w-36 overflow-hidden rounded-xl border border-sand-line bg-white shadow-lg">
                {(["successful", "failed", "all"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setGivingStatusFilter(key);
                      setShowStatusFilterMenu(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-[11px] font-semibold transition ${
                      givingStatusFilter === key ? "bg-mist-select text-bark" : "text-moss hover:bg-sand hover:text-bark"
                    }`}
                  >
                    <span className="capitalize">{key}</span>
                    {givingStatusFilter === key && <Check className="h-3.5 w-3.5 text-ember" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Desktop: one independent button per status. */}
          <div className="hidden h-9 shrink-0 items-center gap-1.5 md:flex" role="group" aria-label="Filter by status">
            {(["successful", "failed", "all"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGivingStatusFilter(key)}
                aria-pressed={givingStatusFilter === key}
                className={`h-8 rounded-xl px-2.5 text-[11px] font-semibold capitalize transition ${
                  givingStatusFilter === key
                    ? "bg-bark text-white shadow-sm"
                    : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search account, method or receipt…" value={givingSearch} onChange={(e) => setGivingSearch(e.target.value)} className="min-w-0 rounded-xl border border-sand-line bg-sand px-3 py-2 text-xs focus:border-ember focus:outline-none md:flex-1" />
        </div>
      </div>

      {!givingsVisible ? (
        <div className="flex flex-col items-center justify-center gap-4 px-5 py-10 text-center">
          <p className="text-xs text-moss">Your giving record is hidden. Tap the eye above to show it.</p>
          <Link
            href="/give"
            className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember-deep"
          >
            Give Now
          </Link>
        </div>
      ) : (
        <div className="flex flex-col px-5 py-3">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-sand-line">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-ember">
                  <th className="pb-3 pr-4 font-bold w-8">#</th>
                  <th className="pb-3 pr-4 font-bold">Date</th>
                  <th className="pb-3 pr-4 font-bold">Account</th>
                  <th className="pb-3 pr-4 font-bold">Method</th>
                  <th className="pb-3 pr-4 font-bold">Receipt</th>
                  <th className="pb-3 pr-4 text-right font-bold">Amount</th>
                  <th className="pb-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-soft">
                {loadingGivings ? (
                  <tr><td colSpan={7} className="py-8 text-center text-xs text-moss">Loading your givings...</td></tr>
                ) : filteredGivings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <p className="text-xs font-semibold text-bark">No givings in this period</p>
                      <p className="mt-1 text-[11px] text-moss">Adjust the dates above or tap Give Now.</p>
                    </td>
                  </tr>
                ) : (
                  filteredGivings.map((g, idx) => (
                    <tr key={g.id} className="hover:bg-sand">
                      <td className="py-3 pr-4 text-moss w-8">{idx + 1}</td>
                      <td className="py-3 pr-4 text-moss">{fmtGivingDate(g)}</td>
                      <td className="py-3 pr-4 font-semibold text-bark">{g.purpose || "—"}</td>
                      <td className="py-3 pr-4 text-moss">{methodLabel(g.payment_method)}</td>
                      <td className="py-3 pr-4 font-mono text-moss">{g.mpesa_receipt_number || "—"}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-bark">KES {Number(g.amount || 0).toLocaleString()}</td>
                      <td className="py-3 pr-2 text-right">
                        {(g.status || "").toLowerCase() === "completed" && (
                          <button
                            type="button"
                            onClick={() => handleDownloadReceipt(g)}
                            title="Download receipt"
                            className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                          >
                            <Receipt size={10} className="inline" aria-hidden="true" /> Receipt
                          </button>
                        )}
                      </td>
                      <td className="py-3">{statusBadge(g.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 pb-2 md:hidden">
            {loadingGivings ? (
              <div className="py-8 text-center text-xs text-moss">Loading your givings...</div>
            ) : filteredGivings.length === 0 ? (
              <div className="py-8 text-center text-xs text-moss">No givings in this period.</div>
            ) : (
              filteredGivings.map((g) => (
                <div key={g.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-sm text-bark">{g.purpose || "—"}</h3>
                    {statusBadge(g.status)}
                  </div>
                  <p className="text-xs text-moss">{fmtGivingDate(g)} · {methodLabel(g.payment_method)}</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ember">KES {Number(g.amount || 0).toLocaleString()}</p>
                    {(g.status || "").toLowerCase() === "completed" && (
                      <button
                        type="button"
                        onClick={() => handleDownloadReceipt(g)}
                        title="Download receipt"
                        className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
                      >
                        <Receipt size={10} className="inline" aria-hidden="true" /> Receipt
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Footer actions — hidden with the record: the count and
          total would leak the giving it conceals. */}
      {givingsVisible && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sand-line px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-[11px] text-moss">{dayFirstTime(fromDate)} <ArrowRight size={10} className="inline" aria-hidden="true" /> {dayFirstTime(toDate)}</p>
            <p className="text-[11px] font-semibold text-bark">
              {loadingGivings ? "Loading your givings..." : `${filteredGivings.length} giving${filteredGivings.length === 1 ? "" : "s"} · KES ${givingTotal.toLocaleString()}`}
            </p>
          </div>
          {/* On a phone the two actions split the row evenly. */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={handlePrintMyReport}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-sand-mute bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand sm:flex-none"
            >
              <Printer size={12} className="inline" aria-hidden="true" /> Print My Report
            </button>
            <Link
              href="/give"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep sm:flex-none"
            >
              Give Now
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
