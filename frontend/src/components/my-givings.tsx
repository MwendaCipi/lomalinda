"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Printer, Receipt } from "lucide-react";
import { FILTER_SELECT_CLASS, FilterPopover, FilterSet } from "./filter-popover";
import { brand } from "@/lib/brand";
import { localDate, firstDayOfMonth, dayFirst, dayFirstTime } from "@/lib/dates";
import { showAlert, showGivingThanks } from "@/lib/alerts";

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

   One eye state per browser, covering the whole merged record (sign-out
   clears the key in lib/auth.ts). */
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

/** One money row from /members/contributions/ — the label givers read and the
    short account name M-Pesa shows. A gift given FOR someone carries the
    honoree's name and the relationship, so a spouse's tithe reads as such on
    both records it lands on. */
type MyGiving = {
  id: number;
  amount: string | number;
  currency?: string;
  purpose: string;
  honoree_name?: string;
  relationship?: string;
  payment_method: string;
  status: string;
  mpesa_receipt_number?: string;
  paid_at?: string | null;
  created_at: string;
};

/** One in-kind row from /members/in-kind/ — goods, not money. */
type InKindRecord = {
  id: number;
  donor_display: string;
  items_list: string[];
  purpose: string;
  notes: string;
  received_on: string;
  created_at: string;
};

/** One entry on the merged timeline: both kinds, newest day first. */
type TimelineEntry =
  | { key: string; kind: "money"; day: string; at: string; gift: MyGiving }
  | { key: string; kind: "in-kind"; day: string; at: string; gift: InKindRecord };

type MoneyEntry = Extract<TimelineEntry, { kind: "money" }>;
type InKindEntry = Extract<TimelineEntry, { kind: "in-kind" }>;

/** In-kind gifts are few — goods are handed over, not pushed to a phone — so
    the record is loaded whole (in pages of 200, five pages deep at most) and
    filtered on the client next to the money rows. */
const INKIND_PAGE_SIZE = 200;
const INKIND_MAX_PAGES = 5;

async function fetchInKindRows(fromDate: string, toDate: string): Promise<InKindRecord[]> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const rows: InKindRecord[] = [];
  for (let page = 1; page <= INKIND_MAX_PAGES; page++) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(INKIND_PAGE_SIZE));
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`${API_URL}/api/members/in-kind/?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) break;
    const data = await res.json().catch(() => null);
    const results: InKindRecord[] = Array.isArray(data?.results) ? data.results : [];
    rows.push(...results);
    if (results.length < INKIND_PAGE_SIZE || rows.length >= (data?.count ?? rows.length)) break;
  }
  return rows;
}

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

/** The clock time an entry carries, if any — the day itself is the group
    heading above it, so the row only shows what sets it apart within the day. */
const timeOf = (at: string) => {
  if (!at || at.length <= 10) return "";
  const formatted = dayFirstTime(at);
  return formatted.includes(" ") ? formatted.slice(formatted.indexOf(" ") + 1) : "";
};

const KIND_OPTIONS: { key: "all" | "money" | "in-kind"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "money", label: "Money" },
  { key: "in-kind", label: "In Kind" },
];

const STATUS_OPTIONS: { key: "successful" | "failed" | "all"; label: string }[] = [
  { key: "successful", label: "Successful" },
  { key: "failed", label: "Failed" },
  { key: "all", label: "All" },
];

/**
 * My Givings — the member's giving, as one timeline.
 *
 * Money gifts (contributions) and in-kind gifts (goods handed over) merged,
 * grouped by day, newest first. This lives on its own route (`/member/givings`,
 * linked from the account menu).
 */
export function MyGivings() {
  const [money, setMoney] = useState<MyGiving[]>([]);
  const [inKind, setInKind] = useState<InKindRecord[]>([]);
  // Both lists start loading exactly when there is an account to load them
  // for, so the first paint already shows the spinner without an effect
  // having to start it (this route is behind the sign-in gate).
  const [loadingMoney, setLoadingMoney] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem("access_token")
  );
  const [loadingInKind, setLoadingInKind] = useState(true);
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(() => localDate());
  // What kind of giving is on show: everything by default.
  const [kindFilter, setKindFilter] = useState<"all" | "money" | "in-kind">("all");
  // Status applies to money only — starts on Successful as default.
  const [statusFilter, setStatusFilter] = useState<"successful" | "failed" | "all">("successful");
  const [givingSearch, setGivingSearch] = useState("");

  // The spinner is turned on by the initial load and off here:
  // nothing in this body runs synchronously, so calling it from an effect is
  // safe — a silent load (polling) never blanks the list on a hiccup either.
  /**
   * The gifts already on the record when the page opened are history. A gift
   * that completes while the pending window runs is the one the member has
   * just paid for, and it earns the thank-you the desks give — `null` means
   * "nothing read yet", so the first load only marks history and never thanks
   * a member for a gift given last month.
   */
  const thankedIds = useRef<Set<number> | null>(null);
  const loadMoney = (opts?: { silent?: boolean }) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    fetch(`${API_URL}/api/members/contributions/?include_failed=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const rows: MyGiving[] = Array.isArray(data) ? data : [];
        const known = thankedIds.current;
        if (known === null) {
          thankedIds.current = new Set(rows.map((row) => row.id));
        } else {
          const landed = rows.filter((row) => (row.status || "").toLowerCase() === "completed" && !known.has(row.id));
          if (landed.length > 0) {
            landed.forEach((row) => known.add(row.id));
            const gift = landed[0];
            const amount = `KES ${Number(gift.amount || 0).toLocaleString()}`;
            showGivingThanks({
              detail: `${gift.purpose ? `${gift.purpose} · ` : ""}${amount} has been recorded. The church is grateful for your generosity.`,
            });
          }
        }
        setMoney(rows);
      })
      .catch(() => {
        if (!opts?.silent) setMoney([]);
      })
      .finally(() => setLoadingMoney(false));
  };

  useEffect(() => {
    loadMoney();

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
      loadMoney({ silent: true });
    }, 10000);
    return () => clearInterval(tick);
  }, []);

  // The in-kind half loads against the chosen window — on mount and when the
  // dates move. The work sits inside a short timeout, so stepping the date
  // inputs does not fire a fetch per tick.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoadingInKind(true);
      fetchInKindRows(fromDate, toDate)
        .then((rows) => {
          if (!cancelled) setInKind(rows);
        })
        .catch(() => {
          if (!cancelled) setInKind([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingInKind(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fromDate, toDate]);

  // ── Merge, filter, order ────────────────────────────────────────────────
  const q = givingSearch.trim().toLowerCase();

  const entries: TimelineEntry[] = [];
  for (const g of money) {
    if (kindFilter === "in-kind") continue;
    const day = (g.paid_at || g.created_at || "").slice(0, 10);
    if (fromDate && day && day < fromDate) continue;
    if (toDate && day && day > toDate) continue;
    const status = (g.status || "").toLowerCase();
    if (statusFilter === "successful" && status !== "completed") continue;
    if (statusFilter === "failed" && status !== "failed" && status !== "cancelled") continue;
    if (q && !`${g.purpose} ${g.honoree_name || ""} ${g.payment_method} ${g.mpesa_receipt_number || ""}`.toLowerCase().includes(q)) continue;
    entries.push({ key: `m-${g.id}`, kind: "money", day, at: g.paid_at || g.created_at || "", gift: g });
  }
  for (const r of inKind) {
    if (kindFilter === "money") continue;
    const day = (r.received_on || r.created_at || "").slice(0, 10);
    if (fromDate && day && day < fromDate) continue;
    if (toDate && day && day > toDate) continue;
    if (q && !`${r.purpose} ${(r.items_list || []).join(" ")} ${r.notes || ""} ${r.donor_display || ""}`.toLowerCase().includes(q))
      continue;
    entries.push({
      key: `i-${r.id}`,
      kind: "in-kind",
      day,
      at: r.received_on && r.created_at ? `${r.received_on}T${r.created_at.slice(11)}` : r.received_on || r.created_at || "",
      gift: r,
    });
  }
  // Newest day first; within a day, the later timestamp first.
  entries.sort((a, b) => (a.day === b.day ? b.at.localeCompare(a.at) : b.day.localeCompare(a.day)));

  const moneyEntries = entries.filter((e): e is MoneyEntry => e.kind === "money");
  const inKindEntries = entries.filter((e): e is InKindEntry => e.kind === "in-kind");
  // Totals count money actually given; failed attempts stay visible but never inflate the sum.
  const givingTotal = moneyEntries.reduce(
    (sum, e) => ((e.gift.status || "").toLowerCase() === "completed" ? sum + Number(e.gift.amount || 0) : sum),
    0
  );
  const inKindItems = inKindEntries.reduce((sum, e) => sum + (e.gift.items_list?.length || 0), 0);

  const groups: { day: string; rows: TimelineEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.day === e.day) last.rows.push(e);
    else groups.push({ day: e.day, rows: [e] });
  }

  const loading = loadingMoney || loadingInKind;

  /** Download the server-rendered thermal receipt for one giving — money or
   *  in-kind — as a blob, so the phone's download sheet opens on mobile. */
  const handleDownloadReceipt = async (kind: "money" | "in-kind", id: number, filename: string) => {
    const token = localStorage.getItem("access_token");
    const path = kind === "money" ? `contributions/${id}/receipt/` : `in-kind/${id}/receipt/`;
    try {
      const res = await fetch(`${API_URL}/api/members/${path}`, {
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
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      showAlert("Receipt Error", error instanceof Error ? error.message : "Could not generate the receipt.", "error");
    }
  };


  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const handlePrintMyReport = () => {
    const rows = entries
      .map((e, i) => {
        if (e.kind === "money") {
          const g = e.gift;
          return `<tr><td>${i + 1}</td><td>${esc(dayFirstTime(g.paid_at || g.created_at))}</td><td>Money</td><td>${esc(g.purpose || "—")}</td><td>${esc(methodLabel(g.payment_method))} · ${esc(g.mpesa_receipt_number || "—")}</td><td>—</td><td style="text-align:right">KES ${Number(g.amount || 0).toLocaleString()}</td><td>${statusLabel(g.status)}</td></tr>`;
        }
        const r = e.gift;
        return `<tr><td>${i + 1}</td><td>${esc(dayFirst(r.received_on || r.created_at))}</td><td>In-Kind</td><td>${esc(r.purpose || "—")}</td><td>${esc((r.items_list || []).join("; "))}</td><td>${esc(r.notes || "—")}</td><td style="text-align:right">—</td><td>—</td></tr>`;
      })
      .join("");
    const win = window.open("", "_blank", "width=1000,height=650");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>My Giving Report</title><style>\n      body{font-family:ui-sans-serif,system-ui,sans-serif;color:${brand.bark};padding:32px;}\n      h1{font-size:20px;margin:0 0 4px;} p{color:${brand.moss};font-size:12px;margin:0 0 20px;}\n      table{width:100%;border-collapse:collapse;font-size:12px;}\n      th{text-align:left;border-bottom:2px solid ${brand.ember};padding:8px 6px;text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:${brand.ember};}\n      td{border-bottom:1px solid ${brand.sandSoft};padding:8px 6px;vertical-align:top;}\n      .total{margin-top:16px;text-align:right;font-weight:700;}\n    </style></head><body>\n      <div style="display:flex;align-items:center;gap:10px;margin:0 0 14px;"><img src="/adventist-symbol-print.svg" alt="" style="height:40px;" /><div style="line-height:1.15;font-weight:700;font-size:14px;color:#5E3929;">SDA Church<br/>Loma Linda, Meru</div></div>\n      <h1>My Giving Report</h1>\n      <p>${dayFirst(fromDate)} to ${dayFirst(toDate)} · ${moneyEntries.length} money gift${moneyEntries.length === 1 ? "" : "s"} · KES ${givingTotal.toLocaleString()} · ${inKindEntries.length} in-kind gift${inKindEntries.length === 1 ? "" : "s"} · ${inKindItems} item${inKindItems === 1 ? "" : "s"}</p>\n      <table><thead><tr><th>#</th><th>Date</th><th>Type</th><th>Account</th><th>Detail</th><th>Notes</th><th style="text-align:right">Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>\n      <p class="total">Money total: KES ${givingTotal.toLocaleString()}</p>\n    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  /** One entry, both kinds — a card on the day's rail. */
  const renderEntry = (e: TimelineEntry) => {
    if (e.kind === "money") {
      const g = e.gift;
      const completed = (g.status || "").toLowerCase() === "completed";
      const receiptButton = completed && (
        <button
          type="button"
          onClick={() => handleDownloadReceipt("money", g.id, `Giving_Receipt_${g.mpesa_receipt_number || g.id}.pdf`)}
          title="Download receipt"
          className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
        >
          <Receipt size={10} aria-hidden="true" /> Receipt
        </button>
      );
      return (
        <div className="rounded-2xl border border-sand-line bg-white p-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-bark">{g.purpose || "—"}</h3>
                {statusBadge(g.status)}
              </div>
              <p className="mt-1 text-xs text-moss">
                {timeOf(e.at) && <span>{timeOf(e.at)} · </span>}
                {methodLabel(g.payment_method)}
                {g.mpesa_receipt_number && (
                  <>
                    {" · "}
                    <span className="font-mono">{g.mpesa_receipt_number}</span>
                  </>
                )}
              </p>
              {g.honoree_name && (
                <p className="mt-0.5 text-[11px] font-semibold text-ember">
                  For {g.honoree_name}
                  {g.relationship ? ` · your ${g.relationship}` : ""}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <p className="whitespace-nowrap text-sm font-bold text-ember">KES {Number(g.amount || 0).toLocaleString()}</p>
              {receiptButton}
            </div>
          </div>
        </div>
      );
    }
    const r = e.gift;
    return (
      <div className="rounded-2xl border border-sand-line bg-white p-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-bark">{r.purpose || "—"}</h3>
              <span className="rounded-full border border-ember px-2 py-0.5 text-[10px] font-bold text-ember">In-Kind</span>
            </div>
            <p className="mt-1 text-xs text-moss">
              {timeOf(e.at) && <span>{timeOf(e.at)} · </span>}
              {r.donor_display || "Anonymous"}
            </p>
            <p className="mt-1.5 break-words text-xs text-bark">{(r.items_list || []).join(" • ")}</p>
            {r.notes && <p className="mt-1 break-words text-[11px] italic text-moss">{r.notes}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <p className="whitespace-nowrap text-xs font-semibold text-bark">
              {(r.items_list || []).length} item{(r.items_list || []).length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => handleDownloadReceipt("in-kind", r.id, `InKind_Receipt_${r.received_on}_${r.id}.pdf`)}
              title="Download receipt"
              className="inline-flex items-center gap-1 rounded-lg border border-sand-line bg-sand px-2.5 py-1.5 text-[11px] font-semibold text-moss transition hover:border-ember hover:text-ember"
            >
              <Receipt size={10} aria-hidden="true" /> Receipt
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="My Givings"
      // A pinned page's card fills the panel (the shell passes the height
      // down through MemberWorkspace), so the timeline scrolls inside it and
      // the actions row stays fixed at the foot — flush above the phone's
      // tab bar, which the shell's bottom padding matches exactly.
      className="flex min-h-0 flex-1 flex-col rounded-3xl bg-white shadow-sm ring-1 ring-sand-line"
    >
      {/* The filters share each row in equal parts — the date range across
          the phone's first row, the two popovers across the second — and the
          search gets a row of its own below them rather than squeezing in. */}
      <div className="border-b border-sand-line px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex w-full items-center gap-1.5 sm:w-auto sm:flex-1">
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              title="From date"
              className="h-9 min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 text-xs text-bark focus:border-ember focus:outline-none"
            />
            <ArrowRight size={12} className="shrink-0 text-moss" aria-hidden="true" />
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              title="To date"
              className="h-9 min-w-0 flex-1 rounded-xl border border-sand-line bg-sand px-2.5 text-xs text-bark focus:border-ember focus:outline-none"
            />
          </div>

          <div className="min-w-0 flex-1">
            <FilterPopover
              title="Filter by type"
              summary={kindFilter === "all" ? "All types" : KIND_OPTIONS.find((o) => o.key === kindFilter)?.label ?? "All types"}
              active={kindFilter !== "all"}
            >
              <FilterSet label="Type">
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
                  className={FILTER_SELECT_CLASS}
                  aria-label="Filter by type"
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </FilterSet>
            </FilterPopover>
          </div>

          <div className="min-w-0 flex-1">
            <FilterPopover
              title="Filter by status"
              summary={statusFilter === "all" ? "All statuses" : STATUS_OPTIONS.find((o) => o.key === statusFilter)?.label ?? "All statuses"}
              active={statusFilter !== "all"}
            >
              <FilterSet label="Status">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className={FILTER_SELECT_CLASS}
                  aria-label="Filter by status"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </FilterSet>
            </FilterPopover>
          </div>
        </div>

        <input
          type="text"
          placeholder="Search purpose, items, method or receipt…"
          value={givingSearch}
          onChange={(e) => setGivingSearch(e.target.value)}
          className="mt-2.5 h-9 w-full rounded-xl border border-sand-line bg-sand px-3 text-xs text-bark focus:border-ember focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading && entries.length === 0 ? (
          <div className="py-10 text-center text-xs text-moss">Loading your givings…</div>
        ) : entries.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-xs font-semibold text-bark">No givings in this period</p>
            <p className="mt-1 text-[11px] text-moss">Adjust the filters above, or tap Give Now to add one.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.day || "undated"}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ember">
                  {group.day ? dayFirst(group.day) : "—"}
                </p>
                <ul className="relative ml-1.5 space-y-2.5 border-l-2 border-sand-line pl-5">
                  {group.rows.map((e) => (
                    <li key={e.key} className="relative">
                      <span aria-hidden="true" className="absolute -left-[26px] top-5 h-2.5 w-2.5 rounded-full bg-ember ring-4 ring-white" />
                      {renderEntry(e)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer actions — always visible at the bottom */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sand-line px-5 py-3">
        <p className="text-[11px] font-semibold text-bark">
          {loading && entries.length === 0
            ? "Loading your givings…"
            : [
                kindFilter !== "in-kind" && `${moneyEntries.length} money gift${moneyEntries.length === 1 ? "" : "s"} · KES ${givingTotal.toLocaleString()}`,
                kindFilter !== "money" && `${inKindEntries.length} in-kind gift${inKindEntries.length === 1 ? "" : "s"} · ${inKindItems} item${inKindItems === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={handlePrintMyReport}
            disabled={entries.length === 0}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-sand-mute bg-white px-4 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:bg-sand disabled:opacity-50 sm:flex-none"
          >
            <Printer size={12} className="inline" aria-hidden="true" /> Print My Report
          </button>
          <Link
            href={kindFilter === "in-kind" ? "/support/in-kind" : "/member/giving"}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-ember px-4 py-2 text-xs font-semibold text-white transition hover:bg-ember-deep sm:flex-none"
          >
            {kindFilter === "in-kind" ? "Give In-Kind" : "Give Now"}
          </Link>
        </div>
      </div>
    </section>
  );
}
