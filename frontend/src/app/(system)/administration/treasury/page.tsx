"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, ChevronDown, ChevronRight, Plus, RefreshCw, RotateCw, Phone, MessageSquare, Send, CheckCircle2, Printer, Download, Loader2, Trash2, X } from "lucide-react";
import { AddReceiptModal } from "@/components/add-receipt-modal";
import { waMeNumber } from "@/components/contact-modal";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { openConversation } from "@/lib/chat";
import { ChurchLockup } from "@/components/church-lockup";
import { TreasuryNav } from "@/components/treasury-nav";
import { ComboboxPopover } from "@/components/combobox-popover";
import { DateField } from "@/components/date-field";
import { usePageHeader } from "@/components/app-frame";
import { showAlert } from "@/lib/alerts";
import { brand } from "@/lib/brand";
import { localDate, firstDayOfMonth, dayFirst, dayFirstTime, timeOnly } from "@/lib/dates";
import { densityCellPad } from "@/lib/table-density";
import Swal from "sweetalert2";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const financeRoles = ["treasurer", "admin"];
const money = (amount: string | number) => Number(amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const defaultPurposes = [
  "Tithe",
  "Combined Offering",
  "13th Sabbath",
  "Msamaria Mwema",
  "Camp Expenses",
  "Camp Goal",
  "Development",
  "Children",
  "Possibility",
  "Youth",
  "Men",
  "Women",
  "Choir",
  "Chaplaincy",
];

type PurposeRow = {
  purpose: string;
  mpesa: string;
  bank_transfer: string;
  cheque: string;
  cash: string;
  total: string;
};

type ColumnTotals = {
  mpesa: string;
  bank_transfer: string;
  cheque: string;
  cash: string;
  total: string;
};

type TreasuryRecord = {
  digital_amount_confirmed: string; cash_amount_counted: string; notes: string; reconciled_by_name: string; reconciled_at: string;
};
type Summary = {
  date: string; from_date?: string; to_date?: string; digital_recorded: string; cash_recorded: string; total_recorded: string;
  digital_contribution_count: number; cash_contribution_count: number;
  purpose_breakdown?: PurposeRow[];
  totals?: ColumnTotals;
  treasury: TreasuryRecord | null;
};
type CashReceipt = { id: number; received_on: string; amount: string; purpose: string; donor_name: string; giver_phone?: string; giver_email?: string; receipt_number?: string; notes?: string; received_by_name: string; created_at: string };

type IndividualGiving = {
  id: string;
  raw_id: number;
  /** The member account behind the gift, when it is one's — the Chat action
      opens a direct thread with them. */
  member_id?: number | null;
  source: "digital" | "cash";
  giving_type: string;
  purpose: string;
  amount: string;
  donor_name: string;
  giver_phone?: string;
  giver_email?: string;
  payment_method: string;
  receipt_number: string;
  received_at: string;
  receipt_sent_at?: string | null;
  status: string;
  item_description?: string;
  /** A payment still held for the treasurer's assignment: it stands in
      Individual Givings under the account name the giver typed, and again
      on the Unassigned desk until the treasurer files it. */
  needs_review?: boolean;
};

/** Money that actually arrived — completed digital gifts and recorded cash. */
const isReceivedGiving = (g: IndividualGiving) => g.status === "Completed" || g.status === "Recorded";

/**
 * A finished report, held for the desk to look at before it decides to save
 * it — sometimes one wants to read the document first. The PDF is drawn as
 * itself, in the browser's own viewer.
 */
type ReportPreview = {
  title: string;
  filename: string;
  range: string;
  url: string;
};

export default function TreasuryPage() {
  // The ledger reads the month so far: the 1st, not the first Sabbath — a
  // from-date of the 3rd had the treasurer asking why receipts had vanished.
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(localDate);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cashReceipts, setCashReceipts] = useState<CashReceipt[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "denied">("loading");
  const [message, setMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  const router = useRouter();

  useEffect(() => {
    if (modeParam === "summary") {
      setViewMode("summary");
    } else if (modeParam === "all_givings") {
      setViewMode("all_givings");
    } else if (modeParam === "failed") {
      setViewMode("failed_givings");
    }
  }, [modeParam]);

  const { setHeaderRightAction, setCustomToggles, setCustomHeader, setHeadingFirst } = usePageHeader();
  // A phone reads the desk the way the ministry map reads: the view's name
  // first, the search and the date window under it, then the strip. Without
  // this the shell hides the heading on a phone (the strip names the place)
  // — leaving the ledger the one treasury desk whose view had no name on
  // screen, with the controls floating under the toggles.
  useEffect(() => {
    setHeadingFirst(true);
    return () => setHeadingFirst(false);
  }, [setHeadingFirst]);
  const [searchQuery, setSearchQuery] = useState("");
  // A phone holds both dates behind one button in the header, so the desk
  // keeps one row of controls where it used to spend two. The fields
  // themselves live in the popover; this is only whether it is standing.
  const [showDates, setShowDates] = useState(false);
  const datesRef = useRef<HTMLDivElement>(null);
  const datesPanelRef = useRef<HTMLDivElement>(null);
  // Scanning a window other than this month so far. The phone folds the dates
  // away, so the button itself has to say that a narrower window is standing —
  // otherwise the only way to know is to open the popover and look.
  const customWindow = fromDate !== firstDayOfMonth() || toDate !== localDate();
  // Pulling the paybill's transactions from Safaricom: manual "send money to
  // paybill" gifts land in the ledger without anyone typing them. Idempotent
  // on the server, so a double-press records nothing twice.
  const [pulling, setPulling] = useState(false);
  // A report is generated on demand, so the desk is told the document is being
  // prepared rather than left staring at an unchanged screen; the finished
  // document opens in the preview below — viewed first, downloaded from there.
  const [preparing, setPreparing] = useState<null | "pdf">(null);
  const [preview, setPreview] = useState<ReportPreview | null>(null);

  // Purpose Expansion & View Mode State
  const [expandedPurpose, setExpandedPurpose] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"summary" | "all_givings" | "failed_givings">("all_givings");
  const [allGivingsList, setAllGivingsList] = useState<IndividualGiving[]>([]);
  const [loadingAllGivings, setLoadingAllGivings] = useState(false);
  // Each purpose block is a fund: a completed gift sits under the account the
  // giver typed, so a held row — needs_review but still completed — sits right
  // where the fund shows it. The Unassigned desk keeps its own copy of every
  // held row until the treasurer files it.
  const [heldGivings, setHeldGivings] = useState<IndividualGiving[]>([]);
  const [loadingHeld, setLoadingHeld] = useState(false);
  // The Failed tab's own rows: written only by loadFailedGivings, apart
  // from the date-window list the Individual tab uses — the two loads share
  // the desk's dates but never overwrite each other's rows.
  const [failedGivingsList, setFailedGivingsList] = useState<IndividualGiving[]>([]);
  const [loadingFailedGivings, setLoadingFailedGivings] = useState(false);
  const [purposeGivings, setPurposeGivings] = useState<Record<string, IndividualGiving[]>>({});
  const [loadingPurpose, setLoadingPurpose] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  // The desk-wide compact-rows preference, shared with the other tables.
  const rowPad = densityCellPad();
  // A failed attempt can be taken off the ledger; the row it came from
  // shows this while its removal is in flight.
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [actionDropUp, setActionDropUp] = useState(false);
  // The Failed badge on the treasury strip: counted from the window the
  // Failed tab lists, so the two never disagree — and recounted the moment
  // an attempt is taken off, so the deduction shows at once.
  const [failedCount, setFailedCount] = useState<number | null>(null);

  const headers = useCallback(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` }), []);

  // The badge takes the desk's window — the same dates the Failed tab lists
  // beneath it. The defaults carry the current window, and the callback's
  // identity carries it too, so a date change recounts the badge on its own.
  const refreshFailedCount = useCallback(async (fDate = fromDate, tDate = toDate) => {
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/failed/?from_date=${fDate}&to_date=${tDate}`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.count === "number") setFailedCount(data.count);
      }
    } catch {
      // The badge keeps its last count rather than lying about the queue.
    }
  }, [headers, fromDate, toDate]);

  useEffect(() => {
    // The count rides a microtask — the same shape the desks use — so the
    // effect's own body never writes state synchronously.
    void Promise.resolve().then(() => refreshFailedCount());
  }, [refreshFailedCount]);

  // `givings` writes the date-window list the Individual tab shows;
  // `failed` writes the Failed tab's own windowed list. The two targets stay
  // apart, so one tab's load can never overwrite the rows the other shows.
  const fetchLedgerList = useCallback(async (fDate: string, tDate: string, which: "givings" | "failed" = "givings") => {
    const setLoading = which === "failed" ? setLoadingFailedGivings : setLoadingAllGivings;
    const setList = which === "failed" ? setFailedGivingsList : setAllGivingsList;
    setLoading(true);
    try {
      // Both lists are the ledger's own read of the desk's window — completed
      // gifts beside the attempts that never arrived (`include_failed=1`) — so
      // the Failed tab shows the selected window and never another month's
      // attempts. The strip's badge is the counter at `/treasury/failed/`,
      // which answers with a number and no rows; reading that answer as a
      // list is what took this page down, so the rows are asked for here and
      // nowhere else.
      const res = await fetch(
        `${API_URL}/api/members/treasury/purpose-contributions/?from_date=${fDate}&to_date=${tDate}&include_failed=1`,
        { headers: headers() }
      );
      if (res.ok) {
        const data = await res.json();
        // A payload that is not the array this endpoint promises leaves the
        // list as it was rather than taking the desk down at .filter.
        if (Array.isArray(data)) setList(data);
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const loadAllGivings = useCallback(
    (fDate = fromDate, tDate = toDate) => fetchLedgerList(fDate, tDate),
    [fromDate, toDate, fetchLedgerList],
  );

  // The Failed tab reads the desk's own date window — the same window the
  // Individual tab and the badge read — so filtering to September lists
  // September's attempts and never October's. The callback's identity
  // carries the dates, so a moved window re-reads the tab on its own.
  const loadFailedGivings = useCallback(
    (fDate = fromDate, tDate = toDate) => fetchLedgerList(fDate, tDate, "failed"),
    [fromDate, toDate, fetchLedgerList],
  );

  useEffect(() => {
    // The windowed read rides the microtask — the shape every desk's loads
    // use — so the effect's own synchronous body sets nothing.
    void Promise.resolve().then(() => loadFailedGivings());
  }, [loadFailedGivings]);

  // The desk reaches the giver the way a message actually gets read: a
  // thread in this app when they hold an account, WhatsApp, or a call.
  const handleChatGiver = async (giving: IndividualGiving) => {
    if (!giving.member_id) return;
    try {
      await openConversation({ kind: "dm", member_id: giving.member_id });
      window.location.href = `/chat?dm=${giving.member_id}`;
    } catch (error) {
      showAlert("Could not open chat", error instanceof Error ? error.message : "Try again.", "error");
    }
  };

  // A failed attempt is credited to nothing and receipted never, so — unlike
  // a completed gift — it can be taken off the ledger. One press, after the
  // desk confirms, and the whole payment goes: a split attempt's lines come
  // off together on the server.
  const handleRemoveFailed = async (giving: IndividualGiving) => {
    const confirm = await Swal.fire({
      title: "Remove this failed attempt?",
      text: `${giving.donor_name}: KES ${money(giving.amount)} for ${giving.purpose} never arrived. Removing takes it off the ledger for good.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove it",
      confirmButtonColor: brand.bark,
      cancelButtonText: "Keep it",
    });
    if (!confirm.isConfirmed) return;
    setRemovingId(giving.id);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/failed/${giving.raw_id}/`, {
        method: "DELETE",
        headers: headers(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not remove this attempt.");
      showAlert("Removed", data.detail || "The failed attempt is off the ledger.", "success", {
        toast: true,
        timer: 4000,
        showConfirmButton: false,
      });
      // The desk's view stays where the removal happened; close the window
      // list so the fresh read the endpoint returns is what shows next.
      setAllGivingsList([]);
      setLoadingAllGivings(false);
      void Promise.resolve().then(() => {
        loadFailedGivings();
        refreshFailedCount();
      });
    } catch (error) {
      showAlert("Could not remove", error instanceof Error ? error.message : "Try again.", "error");
    } finally {
      setRemovingId(null);
    }
  };

  // The phone's date popover closes the way any popover does: a press outside
  // it, Escape, the button again, or the band widening past the phone
  // breakpoint, where the two fields stand in the open and the button is gone.
  useEffect(() => {
    if (!showDates) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (datesRef.current?.contains(target)) return;
      if (datesPanelRef.current?.contains(target)) return;
      setShowDates(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDates(false);
    };
    const wide = window.matchMedia("(min-width: 640px)");
    const onWide = () => {
      if (wide.matches) setShowDates(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [showDates]);

  // Position the search bar and the date filters to the RIGHT of the page
  // header title & description.
  //
  // A phone gets one row of controls: the search, and a button holding both
  // dates in a popover. Two stacked rows of chrome spent height the ledger's
  // own rows need, and the window is set far less often than it is read — so it
  // folds away behind the button, which wears a mark while a window other than
  // this month stands. The wider screens keep the fields in the open, beside
  // the search where there is room for them.
  useEffect(() => {
    setHeaderRightAction(
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
          <input
            type="text"
            placeholder="Search giver, receipt, mode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
          />
        </div>

        {/* The phone's dates: both fields behind one button. */}
        <div ref={datesRef} className="shrink-0 sm:hidden">
          <button
            type="button"
            onClick={() => setShowDates((open) => !open)}
            aria-expanded={showDates}
            aria-label="Date range"
            title="Date range"
            className={`relative grid h-8 w-8 place-items-center rounded-xl border transition ${
              showDates || customWindow
                ? "border-ember bg-ember/10 text-ember"
                : "border-sand-mute bg-white text-moss hover:text-bark"
            }`}
          >
            <CalendarDays size={15} aria-hidden="true" />
            {customWindow && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-ember ring-2 ring-white" />
            )}
          </button>
          <ComboboxPopover
            anchorRef={datesRef}
            panelRef={datesPanelRef}
            open={showDates}
            minW={264}
            align="right"
            panelClassName="rounded-2xl border border-sand-line bg-white p-3 shadow-2xl"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-bark">Date range</span>
                <button
                  type="button"
                  onClick={() => setShowDates(false)}
                  aria-label="Close date range"
                  className="rounded p-0.5 text-moss transition hover:text-bark"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <label className="flex items-center justify-between gap-2 text-xs font-medium text-moss">
                <span>From</span>
                <DateField value={fromDate} onChange={changeFromDate} label="Ledger from date" />
              </label>
              <label className="flex items-center justify-between gap-2 text-xs font-medium text-moss">
                <span>To</span>
                <DateField value={toDate} onChange={changeToDate} label="Ledger to date" />
              </label>
              <button
                type="button"
                onClick={() => setShowDates(false)}
                className="w-full rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-dark"
              >
                Done
              </button>
            </div>
          </ComboboxPopover>
        </div>

        {/* The wider screens: the same two fields, in the open. */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <label className="text-xs font-medium text-moss flex items-center gap-1">
            <span>From</span>
            <DateField value={fromDate} onChange={changeFromDate} label="Ledger from date" />
          </label>
          <label className="text-xs font-medium text-moss flex items-center gap-1">
            <span>To</span>
            <DateField value={toDate} onChange={changeToDate} label="Ledger to date" />
          </label>
        </div>
      </div>
    );
  }, [setHeaderRightAction, searchQuery, fromDate, toDate, showDates, customWindow]);

  // The treasury's views, as one line. The ledger owns Individual Givings and
  // Summary in place; the other three walk to the accounts desk, which is
  // where those views live. The shell's header band draws it — one strip for
  // the whole treasury, never a second row under this page's own header.
  useEffect(() => {
    setCustomToggles(
      <TreasuryNav
        active={viewMode === "summary" ? "summary" : viewMode === "failed_givings" ? "failed" : "givings"}
        failedCount={failedCount ?? undefined}
        onSelect={(view) => {
          if (view === "givings") {
            setExpandedPurpose(null);
            setViewMode("all_givings");
            loadAllGivings();
          } else if (view === "failed") {
            setExpandedPurpose(null);
            setViewMode("failed_givings");
            // The Failed tab reads the desk's window — the same set the
            // badge beside it counts.
            loadFailedGivings();
          } else if (view === "summary") {
            // The summary chip is the way back out of a purpose's own view:
            // pressing it lands on the whole summary again, never the
            // drill-down the reader had stepped into.
            setExpandedPurpose(null);
            setViewMode("summary");
          } else if (view === "unassigned") {
            router.replace("/administration?tab=accounts&view=unassigned");
          } else if (view === "accounts") {
            router.replace("/administration?tab=accounts&view=accounts");
          } else if (view === "drives") {
            router.replace("/administration/fund-drives");
          } else if (view === "expenses") {
            router.replace("/administration?tab=accounts&view=expenditure");
          } else {
            router.replace("/administration?tab=accounts&view=withdrawals");
          }
        }}
      />
    );
  }, [setCustomToggles, viewMode, loadAllGivings, loadFailedGivings, failedCount, router]);

  // This desk answers two of the treasury's six views under one route, and
  // the rail row that led here is named "Contributions Ledger" — which is the
  // ledger's own name, not the view's. Naming the active view keeps the
  // heading honest, so pressing Individual Givings does not leave the page
  // titled after the ledger it sits in.
  useEffect(() => {
    setCustomHeader(
      viewMode === "summary"
        ? { label: "Summary Contributions", description: "Each purpose's giving, totalled by how it came in." }
        : viewMode === "failed_givings"
          ? { label: "Failed Givings", description: "Attempts that never completed." }
          : { label: "Individual Givings", description: "Every contribution line by line, with its giver, mode and receipt." }
    );
    return () => setCustomHeader(null);
  }, [setCustomHeader, viewMode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeActionMenuId !== null) {
        const target = e.target as HTMLElement;
        if (!target.closest(".actions-menu-container")) {
          setActiveActionMenuId(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeActionMenuId]);

  // Escape closes the document preview, the way the desk's other overlays
  // close — the report was only being looked at.
  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.URL.revokeObjectURL(preview.url);
        setPreview(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview]);

  // After the shared Add Receipt modal saves, refresh the ledgers and show
  // the honest delivery feedback line (same banner as before the extraction).
  async function handleReceiptSaved(deliveryMessage: string, receipt: { received_on: string }) {
    let nextFrom = fromDate;
    let nextTo = toDate;
    if (receipt.received_on) {
      if (receipt.received_on < nextFrom) nextFrom = receipt.received_on;
      if (receipt.received_on > nextTo) nextTo = receipt.received_on;
    }
    if (nextFrom !== fromDate) setFromDate(nextFrom);
    if (nextTo !== toDate) setToDate(nextTo);
    await load(nextFrom, nextTo);
    await loadAllGivings(nextFrom, nextTo);
    if (expandedPurpose) {
      try {
        const pRes = await fetch(
          `${API_URL}/api/members/treasury/purpose-contributions/?purpose=${encodeURIComponent(expandedPurpose)}&from_date=${nextFrom}&to_date=${nextTo}`,
          { headers: headers() }
        );
        if (pRes.ok) {
          const pData = await pRes.json();
          setPurposeGivings((prev) => ({ ...prev, [expandedPurpose]: pData }));
          setHeldGivings((prev) =>
            prev.filter((g) => !pData.some((h: IndividualGiving) => h.id === g.id))
          );
          for (const held of pData) {
            if (held.needs_review) setHeldGivings((prev) => [...prev, held]);
          }
        }
      } catch {}
    }
    // Set after load(): load() clears the banner first, so setting before the
    // reloads batched both updates and the delivery feedback never rendered.
    setMessage(deliveryMessage);
  }

  async function load(fDate = fromDate, tDate = toDate) {
    setMessage("");
    const profile = await fetch(`${API_URL}/api/members/me/`, { headers: headers() }).then((res) => res.ok ? res.json() : null);
    const profileRoles: string[] = Array.isArray(profile?.roles) && profile.roles.length > 0 ? profile.roles : [profile?.role].filter(Boolean);
    if (!profile || !profileRoles.some((r) => financeRoles.includes(r))) { setStatus("denied"); return; }
    const [summaryRes, cashRes] = await Promise.all([
      fetch(`${API_URL}/api/members/treasury/ledger/?from_date=${fDate}&to_date=${tDate}`, { headers: headers() }),
      fetch(`${API_URL}/api/members/treasury/cash-contributions/?from_date=${fDate}&to_date=${tDate}`, { headers: headers() }),
    ]);
    if (!summaryRes.ok || !cashRes.ok) { setMessage("Could not load treasury data. Please try again."); setStatus("ready"); return; }
    const loadedSummary = await summaryRes.json() as Summary;
    setSummary(loadedSummary);
    const cash = await cashRes.json();
    // The recorded-cash table reads a list; a payload that is not one leaves it
    // empty rather than taking the page down at its first .filter.
    setCashReceipts(Array.isArray(cash) ? cash : []);
    setPurposeGivings({});
    await loadAllGivings(fDate, tDate);
    setStatus("ready");
  }

  useEffect(() => { load(); }, []);  async function changeFromDate(nextFrom: string) { setFromDate(nextFrom); setStatus("loading"); await load(nextFrom, toDate); }
  async function changeToDate(nextTo: string) { setToDate(nextTo); setStatus("loading"); await load(fromDate, nextTo); }

  // Opening the Failed tab, or switching the page open there, swaps the
  // Individual tab's rows out for the Failed tab's own read of the desk's
  // window: nothing else on the page may overwrite what the tab shows. The
  // resets ride the same microtask as the read — the shape every desk's
  // loads use — so the effect's own synchronous body sets nothing.
  useEffect(() => {
    if (viewMode !== "failed_givings") return;
    void Promise.resolve().then(() => {
      setAllGivingsList([]);
      setLoadingAllGivings(false);
      loadFailedGivings();
    });
  }, [viewMode, loadFailedGivings]);

  // The window every report on this page is cut to — and the one the preview
  // is named with, so a document opened for the 8th to the 9th says so.
  const rangeLabel = fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`;

  // Pull the paybill's transactions from Safaricom, so a manual "send money to
  // paybill" gift lands in the ledger without anyone typing it. The server is
  // idempotent by receipt number, so a double-press records nothing twice —
  // and the Pull API keeps only 48 hours of transactions, which is the whole
  // window it will read, so that is what is asked for.
  async function pullMpesaTransactions() {
    setPulling(true);
    try {
      const res = await fetch(`${API_URL}/api/members/payments/mpesa/pull/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ days: 2 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A dialog, not the banner: the pull's answer is the whole point of
        // the press, and Safaricom's own sentences (an unregistered shortcode,
        // a bad credential) name the fix — the treasurer should not have to
        // spot a line of text under a long ledger.
        await showAlert(
          "M-Pesa pull failed",
          data.detail || "Could not reach M-Pesa. Please try again.",
          "error"
        );
        return;
      }
      // load() clears the banner first, so the ledger is reloaded before the
      // finding is written — otherwise the pull's own answer is wiped by the
      // reload it triggers. A dialog outlives that reload.
      await load(fromDate, toDate);
      if (data.detail) {
        await showAlert("M-Pesa pull", data.detail, "warning");
      } else if (data.recorded > 0) {
        await showAlert(
          "M-Pesa pull complete",
          `Pulled ${data.pulled} M-Pesa payment(s) from the last 48 hours; ${data.recorded} new gift(s) recorded.`,
          "success"
        );
      } else {
        await showAlert(
          "M-Pesa pull complete",
          `Pulled ${data.pulled} M-Pesa payment(s) from the last 48 hours; nothing new to record.`,
          "info"
        );
      }
    } catch {
      await showAlert("M-Pesa pull failed", "Could not reach M-Pesa. Please try again.", "error");
    } finally {
      setPulling(false);
    }
  }

  const toggleExpandPurpose = async (purposeName: string) => {
    if (expandedPurpose === purposeName) {
      setExpandedPurpose(null);
      return;
    }
    setExpandedPurpose(purposeName);
    if (!purposeGivings[purposeName]) {
      setLoadingPurpose(purposeName);
      try {
        const res = await fetch(
          `${API_URL}/api/members/treasury/purpose-contributions/?purpose=${encodeURIComponent(purposeName)}&from_date=${fromDate}&to_date=${toDate}`,
          { headers: headers() }
        );
        if (res.ok) {
          const data = await res.json();
          setPurposeGivings((prev) => ({ ...prev, [purposeName]: data }));
        }
      } catch {
        // Ignore fetch errors
      } finally {
        setLoadingPurpose(null);
      }
    }
  };

  const handleDownloadBackendPdf = async (includeIndividual: boolean = false, purposeName?: string | null) => {
    if (preparing) return;
    setPreparing("pdf");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      // The report is cut to the dates on screen — always both ends of the
      // selected range, never the month the range happens to sit in.
      const params = new URLSearchParams();
      if (fromDate) params.append("start_date", fromDate);
      if (toDate) params.append("end_date", toDate);
      if (includeIndividual) params.append("include_individual", "true");
      if (purposeName) params.append("purpose", purposeName);

      const pdfUrl = `${API_URL}/api/members/reports/ledger/pdf/?${params.toString()}`;
      const res = await fetch(pdfUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        window.print();
        return;
      }
      const blob = await res.blob();
      const tag = purposeName ? `_${purposeName.replace(/[^\w-]+/g, "_")}` : "";
      setPreview({
        title: purposeName ? `Treasury — ${purposeName}` : "Financial Treasury report",
        filename: `Financial_Treasury${tag}_${fromDate || "all"}_to_${toDate || "all"}.pdf`,
        range: rangeLabel,
        url: window.URL.createObjectURL(blob),
      });
    } catch {
      window.print();
    } finally {
      setPreparing(null);
    }
  };

  const handleResendReceipt = async (giving: IndividualGiving) => {
    // One dialog for every resend: pick the channel — email, SMS, or both,
    // both on by default — with the giver's contacts shown and editable.
    // The desk hears "my email has changed" at the counter, and a pulled
    // paybill gift can carry no contacts at all (Safaricom obfuscates the
    // number); either way what is typed here goes on the row, so the
    // correction holds for this resend and every later one.
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const result = await showAlert("Resend receipt", "", "question", {
      html: `
        <div style="text-align:left;font-size:14px">
          <p style="margin:0 0 12px">Send the receipt for <b>${escape(giving.donor_name)}</b> (KES ${money(giving.amount)}) to:</p>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
            <input type="checkbox" id="resend-channel-email" checked style="width:16px;height:16px" /> Email
          </label>
          <input id="resend-email-value" class="swal2-input" style="margin-top:0" placeholder="name@example.com" value="${escape(giving.giver_email || "")}" />
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="resend-channel-sms" checked style="width:16px;height:16px" /> SMS
          </label>
          <input id="resend-phone-value" class="swal2-input" style="margin-top:0" placeholder="07XXXXXXXX" value="${escape(giving.giver_phone || "")}" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Send receipt",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const useEmail = !!(document.getElementById("resend-channel-email") as HTMLInputElement | null)?.checked;
        const useSms = !!(document.getElementById("resend-channel-sms") as HTMLInputElement | null)?.checked;
        if (!useEmail && !useSms) {
          Swal.showValidationMessage("Select email, SMS, or both.");
          return false;
        }
        const typedEmail = ((document.getElementById("resend-email-value") as HTMLInputElement | null)?.value || "").trim();
        const typedPhone = ((document.getElementById("resend-phone-value") as HTMLInputElement | null)?.value || "").trim();
        if (useEmail) {
          if (!typedEmail) {
            Swal.showValidationMessage("Enter the email address to send the receipt to.");
            return false;
          }
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(typedEmail)) {
            Swal.showValidationMessage("Enter a valid email address.");
            return false;
          }
        }
        if (useSms) {
          const digits = typedPhone.replace(/\D/g, "");
          if (!typedPhone || digits.length < 9 || digits.length > 15) {
            Swal.showValidationMessage("Enter a valid phone number (9 to 15 digits).");
            return false;
          }
        }
        return {
          channels: [...(useEmail ? ["email"] : []), ...(useSms ? ["sms"] : [])],
          email: typedEmail,
          phone: typedPhone,
        };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    const { channels, email: suppliedEmail, phone: suppliedPhone } = result.value as {
      channels: string[]; email: string; phone: string;
    };

    setResendingId(giving.id);
    try {
      const res = await fetch(`${API_URL}/api/members/treasury/resend-receipt/`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          source: giving.source,
          id: giving.raw_id,
          channels,
          ...(suppliedEmail ? { email: suppliedEmail } : {}),
          ...(suppliedPhone ? { phone: suppliedPhone } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert("Could not resend receipt", data.detail || "The receipt could not be resent.", "error");
        return;
      }
      // Corrected contacts are kept on the row even when a channel refused
      // to send, so the list shows what the ledger now holds either way.
      const contactPatch = {
        ...(suppliedEmail ? { giver_email: suppliedEmail } : {}),
        ...(suppliedPhone ? { giver_phone: suppliedPhone } : {}),
      };
      if (data.sent) {
        showAlert("Receipt sent", data.detail || "Receipt resent successfully.", "success");
        setMessage("");
        const patch = { receipt_sent_at: data.receipt_sent_at || new Date().toISOString(), ...contactPatch };
        setPurposeGivings((prev) => {
          const currentList = prev[giving.purpose] || [];
          const updated = currentList.map((g) => (g.id === giving.id ? { ...g, ...patch } : g));
          return { ...prev, [giving.purpose]: updated };
        });
        setAllGivingsList((prev) => prev.map((g) => (g.id === giving.id ? { ...g, ...patch } : g)));
        setFailedGivingsList((prev) => prev.map((g) => (g.id === giving.id ? { ...g, ...patch } : g)));
      } else {
        showAlert("Receipt not sent", data.detail || "Nothing was sent.", "warning");
        if (Object.keys(contactPatch).length > 0) {
          setPurposeGivings((prev) => {
            const currentList = prev[giving.purpose] || [];
            const updated = currentList.map((g) => (g.id === giving.id ? { ...g, ...contactPatch } : g));
            return { ...prev, [giving.purpose]: updated };
          });
          setAllGivingsList((prev) => prev.map((g) => (g.id === giving.id ? { ...g, ...contactPatch } : g)));
          setFailedGivingsList((prev) => prev.map((g) => (g.id === giving.id ? { ...g, ...contactPatch } : g)));
        }
      }
    } catch {
      showAlert("Could not resend receipt", "Network error. Please try again.", "error");
    } finally {
      setResendingId(null);
    }
  };


  if (status === "loading") return <main className="min-h-screen bg-sand p-10 text-center text-moss">Loading treasury workspace…</main>;
  if (status === "denied") return <main className="min-h-screen bg-sand p-10"><div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold text-bark">Finance access required</h1><p className="mt-3 text-moss">This workspace is available to treasurers, finance managers, church leaders, and administrators.</p><Link href="/administration" className="mt-6 inline-block font-semibold text-ember">Back to administration</Link></div></main>;

  const rawRows = summary?.purpose_breakdown || [];
  const displayedRows: PurposeRow[] = rawRows.filter((r) => Number(r.total || 0) > 0);
  // What the summary table shows: the same rows, narrowed by the search box
  // the givings views answer to. The totals row and the workbook grid keep
  // reading displayedRows — a search finds an account, it never rewrites the
  // month's figures.
  const summarySearch = searchQuery.trim().toLowerCase();
  const visibleRows: PurposeRow[] = summarySearch
    ? displayedRows.filter((r) => r.purpose.toLowerCase().includes(summarySearch))
    : displayedRows;

  const totals = {
    mpesa: summary?.totals?.mpesa ? Number(summary.totals.mpesa) : displayedRows.reduce((acc, r) => acc + Number(r.mpesa || 0), 0),
    bank_transfer: summary?.totals?.bank_transfer ? Number(summary.totals.bank_transfer) : displayedRows.reduce((acc, r) => acc + Number(r.bank_transfer || 0), 0),
    cheque: summary?.totals?.cheque ? Number(summary.totals.cheque) : displayedRows.reduce((acc, r) => acc + Number(r.cheque || 0), 0),
    cash: summary?.totals?.cash ? Number(summary.totals.cash) : displayedRows.reduce((acc, r) => acc + Number(r.cash || 0), 0),
    total: summary?.totals?.total ? Number(summary.totals.total) : displayedRows.reduce((acc, r) => acc + Number(r.total || 0), 0),
  };

  const selectedGivings = expandedPurpose ? purposeGivings[expandedPurpose] || [] : [];
  const selectedPurposeTotal = selectedGivings.reduce((acc, g) => acc + Number(g.amount || 0), 0);

  /** Closing the preview lets the object URL go: the desk has either saved
   *  the document by then or decided against it. */
  const closePreview = () => {
    if (preview) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  /** The document, saved — the same bytes that were just on screen. */
  const downloadPreview = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url;
    a.download = preview.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <main className="min-h-screen md:h-screen bg-sand text-bark md:overflow-hidden">
      {/* The church's letterhead, on the printed page only — the fallback
          print (when the server PDF cannot be reached) still leaves the desk
          with the church's own sheet rather than a bare screenshot. */}
      <ChurchLockup className="hidden print:flex print:mb-2 print:px-4 print:pt-4" />
      <div className="flex h-full md:h-full md:overflow-hidden">
        
        {/* SINGLE CARD TOUCHING MARGINS (ZERO MARGIN/PADDING) */}
        <div className="flex-1 min-w-0 p-0 h-full flex flex-col overflow-hidden md:pb-0">
          <div className="w-full h-full flex flex-col rounded-none bg-white px-3 pt-1 pb-3 sm:px-4 sm:pt-1.5 md:pb-4 border-l border-sand-line overflow-hidden">
            
            {message && (
              <p className="shrink-0 mt-2 rounded-xl bg-sand px-4 py-2 text-xs text-moss border border-sand-line">
                {message}
              </p>
            )}

            {/* MAIN CONTENT TABLE CONTAINER (Flex-1, Non-scrollable outer page, scrollable table rows, fixed totals) */}
            <div className="flex-1 min-h-0 flex flex-col mt-1.5 overflow-hidden rounded-xl border border-sand-line bg-white">
              
              {/* VIEW 1: SUMMARY BREAKDOWN TABLE VIEW */}
              {/* VIEW 1: SUMMARY BREAKDOWN TABLE VIEW */}
              {viewMode === "summary" ? (
                expandedPurpose ? (
                  /* DEDICATED INDEPENDENT PURPOSE VIEW */
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
                    {/* Top Header of Dedicated Purpose View */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-sand-line bg-sand-linen shrink-0">
                      <div className="flex items-center gap-3">
                        <div>
                          <h2 className="text-base font-bold text-bark flex items-center gap-2">
                            <span>{expandedPurpose}</span>
                            <span className="rounded-full bg-bark px-2.5 py-0.5 text-xs font-semibold text-white">
                              {loadingPurpose === expandedPurpose
                                ? "Loading..."
                                : `${(purposeGivings[expandedPurpose] || []).filter((g) => {
                                    if (!searchQuery.trim()) return true;
                                    const q = searchQuery.toLowerCase();
                                    return (
                                      g.donor_name.toLowerCase().includes(q) ||
                                      (g.receipt_number && g.receipt_number.toLowerCase().includes(q)) ||
                                      (g.payment_method && g.payment_method.toLowerCase().includes(q))
                                    );
                                  }).length} entries`}
                            </span>
                          </h2>
                          <p className="text-xs text-moss">
                            Individual givings for {expandedPurpose} ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`})
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Main Content Area for Purpose Givings */}
                    {(() => {
                      const rawList = purposeGivings[expandedPurpose] || [];
                      const isLoading = loadingPurpose === expandedPurpose;
                      const filteredList = rawList.filter((g) => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
                        return (
                          g.donor_name.toLowerCase().includes(q) ||
                          (g.receipt_number && g.receipt_number.toLowerCase().includes(q)) ||
                          (g.payment_method && g.payment_method.toLowerCase().includes(q))
                        );
                      });

                      const purposeTotal = filteredList.reduce(
                        (acc, g) => acc + Number(g.amount || 0),
                        0
                      );

                      // Payments whose reference named no account sit in the
                      // held list, off both ledgers until the treasurer names
                      // the account. Both views below read the same set, so
                      // it is read once here rather than per view.
                      const heldList = heldGivings.filter((g) => g.purpose === expandedPurpose);

                      return (
                        <>
                          {/* Mobile View */}
                          <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-table-scrollbar">
                            {heldList.length > 0 ? (
                                <div className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-3">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-bark">Held for assignment</span>
                                  </div>
                                  {heldList.map((g) => (
                                    <div key={g.id} className="rounded-xl bg-sand-linen p-3.5 border border-sand-line text-xs space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-bark text-sm">{g.donor_name}</span>
                                        <span className="text-sage font-bold text-sm">{money(g.amount)}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] text-moss">
                                        <span>{dayFirstTime(g.received_at)} · {g.payment_method}</span>
                                        <span>Receipt: {g.receipt_number || "—"}</span>
                                      </div>
                                      <div className="flex items-center justify-between pt-2 border-t border-sand-soft">
                                        <span className="text-xs text-moss">
                                          {g.purpose} · needs review
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleResendReceipt(g)}
                                        disabled={resendingId === g.id}
                                        className="rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ember-dark disabled:opacity-60"
                                      >
                                        {resendingId === g.id ? "Sending..." : "Resend"}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <>
                                {isLoading ? (
                                  <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                                    Loading givings for {expandedPurpose}...
                                  </div>
                                ) : filteredList.length === 0 ? (
                                  <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                                    No individual givings found for {expandedPurpose} in this period.
                                  </div>
                                ) : (
                                  filteredList.map((g) => (
                                    <div key={g.id} className="rounded-xl bg-sand-linen p-3.5 border border-sand-line text-xs space-y-2">
                                      <div className="flex items-center justify-between font-semibold">
                                        <span className="text-bark text-sm">{g.donor_name}</span>
                                        <span className="text-sage font-bold text-sm">
                                          {money(g.amount)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] text-moss">
                                        <span>{dayFirstTime(g.received_at)} · {g.payment_method}</span>
                                        <span>Receipt: {g.receipt_number || "—"}</span>
                                      </div>
                                      <div className="flex items-center justify-between pt-2 border-t border-sand-soft">
                                        <div>
                                          {g.receipt_sent_at ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-strong">
                                              <CheckCircle2 className="h-3.5 w-3.5" />
                                              Sent
                                            </span>
                                          ) : (
                                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                              Failed
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {g.member_id && (
                                            <button
                                              type="button"
                                              onClick={() => handleChatGiver(g)}
                                              aria-label="Chat"
                                              title="Chat in this app"
                                              className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                            >
                                              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                          )}
                                          {g.giver_phone && (
                                            <a
                                              href={`https://wa.me/${waMeNumber(g.giver_phone)}`}
                                              aria-label="WhatsApp"
                                              title="WhatsApp"
                                              className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                            >
                                              <WhatsAppIcon className="h-4 w-4 text-sage" />
                                            </a>
                                          )}
                                          {g.giver_phone && (
                                            <a
                                              href={`tel:${g.giver_phone}`}
                                              aria-label="Call"
                                              title="Call"
                                              className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                            >
                                              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                                            </a>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleResendReceipt(g)}
                                            disabled={resendingId === g.id}
                                            className="rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ember-dark disabled:opacity-60"
                                          >
                                            {resendingId === g.id ? "Sending..." : "Resend"}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </>
                            )}
                          </div>

                          {/* Desktop View */}
                          <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-table-scrollbar">
                            <table className="w-full text-left text-sm">
                              <thead className="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm">
                                <tr>
                                  <th className="px-4 py-3 text-left w-12">#</th>
                                  <th className="px-4 py-3 w-32 whitespace-nowrap">Date & Time</th>
                                  <th className="px-4 py-3">Giver</th>
                                  <th className="px-4 py-3 w-20">Mode</th>
                                  <th className="px-4 py-3 w-24">Receipt #</th>
                                  <th className="px-4 py-3 text-right w-24">Amount</th>
                                  <th className="px-4 py-3 w-20">Receipt</th>
                                  <th className="px-4 py-3 text-center w-20">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sand-soft">
                                {isLoading ? (
                                  <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-moss">
                                      Loading givings for {expandedPurpose}...
                                    </td>
                                  </tr>
                                ) : filteredList.length === 0 && heldList.length === 0 ? (
                                  <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-moss">
                                      No individual givings found for {expandedPurpose} in this period.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredList.map((g, gIdx) => (
                                    <tr key={g.id} className="hover:bg-sand-linen">
                                      <td className={`px-4 ${rowPad} text-xs font-semibold font-mono text-moss`}>{gIdx + 1}</td>
                                      <td className={`px-4 ${rowPad} text-xs text-moss whitespace-nowrap`}>
                                        <div className="font-semibold text-bark">{dayFirst(g.received_at)}</div>
                                        {timeOnly(g.received_at) ? (
                                          <div className="text-[11px] font-mono text-moss">{timeOnly(g.received_at)}</div>
                                        ) : null}
                                      </td>
                                      <td className={`px-4 ${rowPad} font-semibold text-bark`}>{g.donor_name}</td>
                                      <td className={`px-4 ${rowPad}`}>
                                        <span className="rounded-full bg-mist-select px-2.5 py-0.5 text-xs font-semibold text-sage">
                                          {g.payment_method}
                                        </span>
                                      </td>
                                      <td className={`px-4 ${rowPad} font-mono text-xs text-moss`}>{g.receipt_number || "—"}</td>
                                      <td className={`px-4 ${rowPad} text-right font-semibold text-bark`}>
                                        {money(g.amount)}
                                      </td>
                                      <td className={`px-4 ${rowPad}`}>
                                        {g.receipt_sent_at ? (
                                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sage-strong">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Sent
                                          </span>
                                        ) : (
                                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                            Failed
                                          </span>
                                        )}
                                      </td>
                                      <td className={`px-4 ${rowPad} text-center`}>
                                        <div className="flex items-center justify-center gap-2">
                                          {g.member_id && (
                                            <button
                                              type="button"
                                              onClick={() => handleChatGiver(g)}
                                              aria-label="Chat"
                                              title="Chat in this app"
                                              className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                            >
                                              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                          )}
                                          {g.giver_phone && (
                                            <a
                                              href={`https://wa.me/${waMeNumber(g.giver_phone)}`}
                                              aria-label="WhatsApp"
                                              title="WhatsApp"
                                              className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                            >
                                              <WhatsAppIcon className="h-4 w-4 text-sage" />
                                            </a>
                                          )}
                                          {g.giver_phone && (
                                            <a
                                              href={`tel:${g.giver_phone}`}
                                              aria-label="Call"
                                              title="Call"
                                              className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                            >
                                              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                                            </a>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => handleResendReceipt(g)}
                                            disabled={resendingId === g.id}
                                            className="rounded-lg bg-ember px-2.5 py-1 text-xs font-semibold text-white hover:bg-ember-dark disabled:opacity-60"
                                          >
                                            {resendingId === g.id ? "Sending..." : "Resend"}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Sticky Footer for Dedicated Purpose View */}
                          <div className="shrink-0 sticky bottom-0 md:static z-30 border-t-2 border-sand-mute bg-sand font-bold text-bark shadow-lg md:shadow-none">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5">
                              <div className="flex items-center gap-3 text-xs sm:text-sm">
                                <span className="text-[11px] sm:text-xs text-moss font-semibold">
                                  Showing <strong className="text-bark">{filteredList.length}</strong> of <strong className="text-bark">{rawList.length}</strong> entries
                                </span>
                                <span className="font-bold text-bark text-xs sm:text-sm">
                                  {expandedPurpose} Total: <span className="text-ember">{money(purposeTotal)}</span>
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-1.5 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
                                <button
                                  type="button"
                                  onClick={pullMpesaTransactions}
                                  disabled={pulling}
                                  className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-sand-mute bg-white px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-bark hover:bg-sand transition shadow-sm disabled:opacity-60"
                                  title="Record any manual paybill gifts Safaricom has received that are not yet in the ledger (last 48 hours, all the Pull API keeps)."
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-ember shrink-0 ${pulling ? "animate-spin" : ""}`} aria-hidden="true" />
                                  <span className="truncate">{pulling ? "Pulling…" : "Pull M-Pesa"}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsModalOpen(true)}
                                  className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl bg-ember px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark"
                                >
                                  <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                                  <span className="truncate">Add Receipt</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBackendPdf(true, expandedPurpose)}
                                  disabled={preparing !== null}
                                  className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-sand-mute bg-white px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-bark hover:bg-sand transition shadow-sm disabled:opacity-60"
                                >
                                  {preparing === "pdf" ? (
                                    <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-ember shrink-0" aria-hidden="true" />
                                  ) : (
                                    <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-ember shrink-0" aria-hidden="true" />
                                  )}
                                  <span className="truncate">{preparing === "pdf" ? "Preparing…" : "PDF Report"}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* CLEAN UN-NESTED SUMMARY BREAKDOWN TABLE VIEW */
                  <>
                    {/* Mobile Cards View (visible on md:hidden) */}
                    <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-table-scrollbar">
                      {heldGivings.length > 0 ? (
                        <div className="rounded-2xl border border-sand-line bg-sand-linen p-4 space-y-3 mb-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-bark">Held for assignment ({heldGivings.length})</span>
                          </div>
                          {heldGivings.map((g) => (
                            <div key={g.id} className="rounded-xl bg-white p-3 border border-sand-line text-xs space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-bark text-sm">{g.donor_name}</span>                                        <span className="text-sage font-bold text-sm">
                                          {money(g.amount)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] text-moss">
                                        <span>{dayFirstTime(g.received_at)} · {g.payment_method}</span>
                                        <span>Receipt: {g.receipt_number || "—"}</span>
                                      </div>
                                      <div className="flex items-center justify-between pt-2 border-t border-sand-soft">
                                        <span className="text-xs text-moss">
                                          {g.purpose} · needs review
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => toggleExpandPurpose(g.purpose)}
                                          className="rounded-lg bg-bark px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-bark-900"
                                        >
                                          View
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                visibleRows.length === 0 ? (
                                  <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                                    {summarySearch && displayedRows.length > 0 ? (
                                      <>No accounts match “{searchQuery.trim()}”.</>
                                    ) : (
                                      <>No contributions recorded for the selected date range ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}).</>
                                    )}
                                </div>
                              ) : (
                                visibleRows.map((row, idx) => (
                                  <div
                                    key={row.purpose}
                                    onClick={() => toggleExpandPurpose(row.purpose)}
                                    className="group cursor-pointer rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-3 transition hover:border-ember"
                                  >
                                    <div className="flex items-center justify-between gap-2 border-b border-sand-soft pb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-semibold text-moss">#{idx + 1}</span>
                                        <h3 className="font-bold text-sm text-bark group-hover:text-ember transition">{row.purpose}</h3>
                                      </div>
                                      <span className="font-bold text-sm text-ember bg-sand-linen px-2.5 py-1 rounded-lg border border-sand-line">
                                        {money(row.total)}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs text-moss">
                                      <div>M-Pesa: <strong className="text-bark">{Number(row.mpesa) > 0 ? money(row.mpesa) : "—"}</strong></div>
                                      <div>Bank-to-Bank: <strong className="text-bark">{Number(row.bank_transfer) > 0 ? money(row.bank_transfer) : "—"}</strong></div>
                                      <div>Cheque: <strong className="text-bark">{Number(row.cheque) > 0 ? money(row.cheque) : "—"}</strong></div>
                                      <div>Cash: <strong className="text-sage-strong">{Number(row.cash) > 0 ? money(row.cash) : "—"}</strong></div>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] font-semibold text-ember pt-1">
                                      <span className="inline-flex items-center gap-1">View individual givings <ArrowRight size={11} aria-hidden="true" /></span>
                                      <ChevronRight className="h-4 w-4 text-ember group-hover:translate-x-0.5 transition" />
                                    </div>
                                  </div>
                                ))
                              )
                            )}
                            </div>

                    {/* Desktop Table View (visible on md and up). The column
                        grid is fixed and declared once, because the totals row
                        below is a second table and auto layout would size its
                        columns to its own (different) contents. */}
                    <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-table-scrollbar">
                      <table className="w-full table-fixed text-left text-sm">
                        <colgroup>
                          <col className="w-12" />
                          <col className="w-56" />
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                        </colgroup>
                        <thead className="sticky top-0 z-10 bg-sand text-xs font-semibold uppercase tracking-wider text-moss shadow-sm">
                          <tr>
                            <th className="px-4 py-3 text-left w-12">#</th>
                            <th className="px-4 py-3 w-56 shrink-0">Account</th>
                            <th className="px-4 py-3 text-right">M-Pesa</th>
                            <th className="px-4 py-3 text-right">Bank-to-Bank</th>
                            <th className="px-4 py-3 text-right">Cheque</th>
                            <th className="px-4 py-3 text-right">Cash</th>
                            <th className="px-4 py-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-sand-soft">
                          {visibleRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-moss">
                                {summarySearch && displayedRows.length > 0 ? (
                                  <>No accounts match “{searchQuery.trim()}”.</>
                                ) : (
                                  <>No contributions recorded for the selected date range ({fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}).</>
                                )}
                              </td>
                            </tr>
                          ) : (
                            visibleRows.map((row, idx) => (
                              <tr
                                key={row.purpose}
                                onClick={() => toggleExpandPurpose(row.purpose)}
                                className="group cursor-pointer hover:bg-sand-linen transition"
                              >
                                <td className={`px-4 ${rowPad} text-xs font-semibold text-moss font-mono`}>
                                  {idx + 1}
                                </td>
                                <td className={`px-4 ${rowPad} font-medium text-bark w-56 shrink-0 truncate`}>
                                  <div className="flex items-center justify-between gap-2 pr-2">
                                    <span className="font-semibold text-bark group-hover:text-ember transition">{row.purpose}</span>
                                    <ChevronRight className="h-4 w-4 text-moss group-hover:text-ember group-hover:translate-x-0.5 transition shrink-0" />
                                  </div>
                                </td>
                                <td className={`px-4 ${rowPad} text-right text-moss`}>{Number(row.mpesa) > 0 ? money(row.mpesa) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right text-moss`}>{Number(row.bank_transfer) > 0 ? money(row.bank_transfer) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right text-moss`}>{Number(row.cheque) > 0 ? money(row.cheque) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right font-semibold text-sage-strong`}>{Number(row.cash) > 0 ? money(row.cash) : "—"}</td>
                                <td className={`px-4 ${rowPad} text-right font-bold text-bark`}>{money(row.total)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* The column totals belong to the table, so a phone — where
                        the rows are cards — drops the whole strip, border and
                        shadow with it, and the actions below carry the foot
                        alone. The strip is pinned above the tab bar only where
                        it is drawn at all, so its sticky and its shadow are the
                        table's, not the phone's. */}
                    <div className="hidden md:block shrink-0 z-30 border-t-2 border-sand-mute bg-sand font-bold text-bark overflow-x-auto custom-table-scrollbar">
                      <table className="w-full table-fixed text-left text-sm">
                        <colgroup>
                          <col className="w-12" />
                          <col className="w-56" />
                          <col />
                          <col />
                          <col />
                          <col />
                          <col />
                        </colgroup>
                        <tfoot>
                          <tr>
                            <td className="px-4 py-2.5 text-xs text-moss font-mono w-12">#</td>
                            <td className="px-4 py-2.5 text-base w-56 shrink-0">Total</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.mpesa)}</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.bank_transfer)}</td>
                            <td className="px-4 py-2.5 text-right">{money(totals.cheque)}</td>
                            <td className="px-4 py-2.5 text-right text-sage-strong">{money(totals.cash)}</td>
                            <td className="px-4 py-2.5 text-right text-base text-ember">{money(totals.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Breakdown View Sticky Footer */}
                    <div className="shrink-0 sticky bottom-0 md:static z-30 border-t-2 border-sand-mute bg-sand px-3 py-2 sm:px-4 sm:py-2.5 font-semibold text-xs text-bark flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shadow-lg md:shadow-none">
                      {/* A row count is the table's own vocabulary: with cards
                          on a phone it says nothing the list does not already
                          say, and it costs a line of the ledger's height. */}
                      <span className="hidden text-moss text-[11px] md:inline md:text-xs">
                        Total Rows Available: <strong className="text-bark">{visibleRows.length}</strong>
                      </span>
                      <div className="grid grid-cols-3 gap-1.5 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
                        {/* The pull sits at the foot of the table with the
                            desk's other buttons rather than in the header:
                            it records into the window the footer totals. */}
                        <button
                          type="button"
                          onClick={pullMpesaTransactions}
                          disabled={pulling}
                          className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-sand-mute bg-white px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-bark hover:bg-sand transition shadow-sm disabled:opacity-60"
                          title="Record any manual paybill gifts Safaricom has received that are not yet in the ledger (last 48 hours, all the Pull API keeps)."
                        >
                          <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-ember shrink-0 ${pulling ? "animate-spin" : ""}`} aria-hidden="true" />
                          <span className="truncate">{pulling ? "Pulling…" : "Pull M-Pesa"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsModalOpen(true)}
                          className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl bg-ember px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark"
                        >
                          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                          <span className="truncate">Add Receipt</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadBackendPdf(false)}
                          disabled={preparing !== null}
                          className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-sand-mute bg-white px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-bark hover:bg-sand transition shadow-sm disabled:opacity-60"
                        >
                          {preparing === "pdf" ? (
                            <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-ember shrink-0" aria-hidden="true" />
                          ) : (
                            <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-ember shrink-0" aria-hidden="true" />
                          )}
                          <span className="truncate">{preparing === "pdf" ? "Preparing…" : "PDF Report"}</span>
                        </button>
                      </div>
                    </div>
                  </>
                )
              ) : (
                
                /* VIEW 2: INDIVIDUAL MEMBER GIVINGS TABLE VIEW */
                <>
                  {(() => {
                    const searchQueryLower = searchQuery.trim().toLowerCase();
                    // The strip above picks the view: individual givings, or
                    // the attempts that never arrived — the latter from its
                    // own read of the desk's window.
                    const showFailed = viewMode === "failed_givings";
                    const listToDisplay = (showFailed ? failedGivingsList : allGivingsList).filter((g) => {
                      if (showFailed ? isReceivedGiving(g) : !isReceivedGiving(g)) return false;
                      if (!searchQueryLower) return true;
                      return (
                        g.donor_name.toLowerCase().includes(searchQueryLower) ||
                        (g.receipt_number && g.receipt_number.toLowerCase().includes(searchQueryLower)) ||
                        (g.payment_method && g.payment_method.toLowerCase().includes(searchQueryLower)) ||
                        (g.purpose && g.purpose.toLowerCase().includes(searchQueryLower))
                      );
                    });
                    const isLoading = showFailed ? loadingFailedGivings : loadingAllGivings;
                    const displayTotal = listToDisplay.reduce((acc, g) => acc + Number(g.amount || 0), 0);

                    return (
                      <>
                        {/* Mobile Cards View (visible on md:hidden) */}
                        <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-table-scrollbar">
                          {isLoading ? (
                            <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                              Loading member givings...
                            </div>
                          ) : listToDisplay.length === 0 ? (
                            <div className="py-12 text-center text-sm text-moss bg-white rounded-xl p-4 border border-sand-line">
                              {showFailed ? "No failed transactions in the selected date range." : "No individual givings recorded for the selected date range."}
                            </div>
                          ) : (
                            listToDisplay.map((giving, idx) => (
                              <div key={giving.id} className="rounded-2xl border border-sand-line bg-white p-4 shadow-sm space-y-3">
                                <div className="flex items-center justify-between gap-2 border-b border-sand-soft pb-2">
                                  <div>
                                    <div className="font-bold text-sm text-bark">{giving.donor_name}</div>
                                    <div className="text-[11px] text-moss">
                                      {dayFirst(giving.received_at)}
                                      {timeOnly(giving.received_at) ? ` · ${timeOnly(giving.received_at)}` : ""}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-sm text-sage">
                                      {money(giving.amount || 0)}
                                    </div>
                                    <span className="inline-block rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-semibold text-sage">
                                      {giving.payment_method}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="rounded-lg bg-sand-linen border border-sand-line px-2 py-0.5 text-xs font-semibold text-ember">
                                    {giving.purpose}
                                  </span>
                                  <span className="font-mono text-[11px] text-moss">Receipt: {giving.receipt_number || "N/A"}</span>
                                </div>

                                {giving.item_description && (
                                  <p className="text-xs text-moss italic bg-sand-linen p-2 rounded-lg border border-sand-line">
                                    Description: {giving.item_description}
                                  </p>
                                )}

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-sand-soft">
                                  {isReceivedGiving(giving) ? (
                                    <span className={`text-[11px] font-semibold ${giving.receipt_sent_at ? "text-sage" : "text-ember"}`}>
                                      {giving.receipt_sent_at ? "Sent" : "Failed"}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-moss">No receipt (payment failed)</span>
                                  )}
                                  <div className="flex items-center gap-2">
                                    {giving.member_id && (
                                      <button
                                        type="button"
                                        onClick={() => handleChatGiver(giving)}
                                        aria-label="Chat"
                                        title="Chat in this app"
                                        className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                      >
                                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                      </button>
                                    )}
                                    {giving.giver_phone && (
                                      <a
                                        href={`https://wa.me/${waMeNumber(giving.giver_phone)}`}
                                        aria-label="WhatsApp"
                                        title="WhatsApp"
                                        className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                      >
                                        <WhatsAppIcon className="h-4 w-4 text-sage" />
                                      </a>
                                    )}
                                    {giving.giver_phone && (
                                      <a
                                        href={`tel:${giving.giver_phone}`}
                                        aria-label="Call"
                                        title="Call"
                                        className="rounded-lg border border-sand-mute bg-white p-1.5 text-bark hover:bg-sand"
                                      >
                                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                                      </a>
                                    )}
                                    {!isReceivedGiving(giving) && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFailed(giving)}
                                        disabled={removingId === giving.id}
                                        className="rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-[11px] font-semibold text-ember hover:bg-sand disabled:opacity-60"
                                      >
                                        {removingId === giving.id ? "Removing…" : "Remove"}
                                      </button>
                                    )}
                                    {isReceivedGiving(giving) && (
                                      <button
                                        type="button"
                                        onClick={() => handleResendReceipt(giving)}
                                        disabled={resendingId === giving.id}
                                        className="rounded-lg bg-ember px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-ember-dark"
                                      >
                                        {resendingId === giving.id ? "Sending..." : "Resend Receipt"}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* PC Desktop Table View (visible on md and up) */}
                        <div className="hidden md:block flex-1 min-h-0 overflow-auto custom-table-scrollbar">
                          {isLoading ? (
                            <div className="py-16 text-center text-sm text-moss">
                              Loading member givings...
                            </div>
                          ) : listToDisplay.length === 0 ? (
                            <div className="py-16 text-center text-sm text-moss">
                              {showFailed ? "No failed transactions in the selected date range." : "No individual givings recorded for the selected date range."}
                            </div>
                          ) : (
                            <table className="w-full text-left text-xs">
                              <thead className="sticky top-0 z-10 bg-sand font-semibold text-moss uppercase tracking-wider shadow-sm">
                                <tr>
                                  <th className="px-3 py-2.5 w-10">#</th>
                                  <th className="px-3 py-2.5 w-32 whitespace-nowrap">Date & Time</th>
                                  <th className="px-3 py-2.5 w-44 shrink-0">Giver</th>
                                  <th className="px-3 py-2.5 w-44 shrink-0">Account</th>
                                  <th className="px-3 py-2.5 w-20">Mode</th>
                                  <th className="px-3 py-2.5 w-24">Receipt #</th>
                                  <th className="px-3 py-2.5 text-right w-28">Amount</th>
                                  <th className="px-3 py-2.5 w-20">Receipt</th>
                                  <th className="px-3 py-2.5 text-center w-20">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sand-soft bg-white">
                                {listToDisplay.map((giving, idx) => (
                                  <tr key={giving.id} className="hover:bg-sand-plate">
                                    <td className="px-3 py-3 text-xs text-moss font-mono font-semibold">{idx + 1}</td>
                                    <td className="px-3 py-3 text-moss whitespace-nowrap">
                                      <div className="font-semibold text-bark">{dayFirst(giving.received_at)}</div>
                                      {timeOnly(giving.received_at) ? (
                                        <div className="text-[11px] font-mono text-moss">{timeOnly(giving.received_at)}</div>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-3 w-44 shrink-0 font-semibold text-bark truncate max-w-[170px]" title={giving.donor_name}>
                                      {giving.donor_name}
                                    </td>
                                    <td className="px-3 py-3 w-44 shrink-0 font-semibold text-bark">
                                      <span className="inline-block rounded-lg bg-sand-linen border border-sand-line px-2 py-0.5 text-xs text-ember truncate max-w-[170px]" title={giving.purpose}>
                                        {giving.purpose}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3">
                                      <span className="inline-block rounded-full bg-mist-select px-2.5 py-0.5 text-[11px] font-semibold text-sage">
                                        {giving.payment_method}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-moss font-mono text-[11px] truncate max-w-[100px]" title={giving.receipt_number}>
                                      {giving.receipt_number || "—"}
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold text-bark">
                                      {money(giving.amount)}
                                    </td>
                                    <td className="px-3 py-3">
                                      {!isReceivedGiving(giving) ? (
                                        <span className="text-[11px] text-moss">—</span>
                                      ) : giving.receipt_sent_at ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sage-strong">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Sent
                                        </span>
                                      ) : (
                                        <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                          Failed
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <div className="relative inline-block text-left actions-menu-container">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (activeActionMenuId === giving.id) {
                                              setActiveActionMenuId(null);
                                            } else {
                                              // Open upward near the viewport bottom so the
                                              // popup is not hidden behind the footer buttons.
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setActionDropUp(window.innerHeight - rect.bottom < 160);
                                              setActiveActionMenuId(giving.id);
                                            }
                                          }}
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-sand-mute bg-white px-2.5 py-1 text-xs font-semibold text-bark hover:bg-sand transition shadow-sm"
                                        >
                                          <span>Actions</span>
                                          <ChevronDown className="h-3.5 w-3.5 text-moss" />
                                        </button>

                                        {activeActionMenuId === giving.id && (
                                          <div
                                            className={`absolute right-0 z-30 w-44 rounded-xl border border-sand-line bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in duration-150 ${actionDropUp ? "bottom-full mb-1" : "mt-1"}`}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {isReceivedGiving(giving) && (
                                              <button
                                                type="button"
                                                disabled={resendingId === giving.id}
                                                onClick={() => {
                                                  setActiveActionMenuId(null);
                                                  handleResendReceipt(giving);
                                                }}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-bark hover:bg-sand transition disabled:opacity-50"
                                              >
                                                {resendingId === giving.id ? (
                                                  <RotateCw className="h-3.5 w-3.5 animate-spin text-ember" />
                                                ) : (
                                                  <Send className="h-3.5 w-3.5 text-ember" />
                                                )}
                                                <span>Resend Receipt</span>
                                              </button>
                                            )}

                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveActionMenuId(null);
                                                handleChatGiver(giving);
                                              }}
                                              disabled={!giving.member_id}
                                              title={giving.member_id ? "Open a thread in this app" : "This giver holds no member account. Use WhatsApp or Call."}
                                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-sage hover:bg-mist-select transition disabled:opacity-45"
                                            >
                                              <MessageSquare className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
                                              <span>Chat</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveActionMenuId(null);
                                                if (giving.giver_phone) window.location.href = `https://wa.me/${waMeNumber(giving.giver_phone)}`;
                                              }}
                                              disabled={!giving.giver_phone}
                                              title={giving.giver_phone ? "WhatsApp this giver" : "No phone number recorded for this giver"}
                                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-sage hover:bg-mist-select transition disabled:opacity-45"
                                            >
                                              <WhatsAppIcon className="h-4 w-4 text-sage" />
                                              <span>WhatsApp</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveActionMenuId(null);
                                                if (giving.giver_phone) window.location.href = `tel:${giving.giver_phone}`;
                                              }}
                                              disabled={!giving.giver_phone}
                                              title={giving.giver_phone ? "Call this giver" : "No phone number recorded for this giver"}
                                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-sage hover:bg-mist-select transition disabled:opacity-45"
                                            >
                                              <Phone className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
                                              <span>Call</span>
                                            </button>

                                            {!isReceivedGiving(giving) && (
                                              <button
                                                type="button"
                                                disabled={removingId === giving.id}
                                                onClick={() => {
                                                  setActiveActionMenuId(null);
                                                  handleRemoveFailed(giving);
                                                }}
                                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-ember hover:bg-sand transition disabled:opacity-50"
                                              >
                                                {removingId === giving.id ? (
                                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ember" />
                                                ) : (
                                                  <Trash2 className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
                                                )}
                                                <span>Remove</span>
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Fixed Child Table Footer — sits flush on the tab bar. */}
                        <div className="shrink-0 sticky bottom-0 md:static z-30 border-t-2 border-sand-mute bg-sand px-3 py-2 sm:px-4 sm:py-2.5 font-semibold text-xs text-bark flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shadow-lg md:shadow-none">
                          <span className="text-moss text-[11px] sm:text-xs">
                            {showFailed ? (
                              <>
                                Failed attempts: <strong className="text-bark">{listToDisplay.length}</strong> • <span className="font-bold text-ember">KES {money(displayTotal)} never arrived</span>
                              </>
                            ) : (
                              <>
                                Total Rows Available: <strong className="text-bark">{listToDisplay.length}</strong> • <span className="font-bold text-ember">KES {money(displayTotal)}</span>
                              </>
                            )}
                          </span>

                          <div className="grid grid-cols-3 gap-1.5 w-full sm:flex sm:w-auto sm:items-center sm:gap-2">
                            {/* The pull sits at the foot of the table with the
                                desk's other buttons rather than in the header:
                                it records into the window the footer totals. */}
                            <button
                              type="button"
                              onClick={pullMpesaTransactions}
                              disabled={pulling}
                              className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-sand-mute bg-white px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-bark hover:bg-sand transition shadow-sm disabled:opacity-60"
                              title="Record any manual paybill gifts Safaricom has received that are not yet in the ledger (last 48 hours, all the Pull API keeps)."
                            >
                              <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-ember shrink-0 ${pulling ? "animate-spin" : ""}`} aria-hidden="true" />
                              <span className="truncate">{pulling ? "Pulling…" : "Pull M-Pesa"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsModalOpen(true)}
                              className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl bg-ember px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-white shadow-sm transition hover:bg-ember-dark"
                            >
                              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                              <span className="truncate">Add Receipt</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadBackendPdf(true)}
                              disabled={preparing !== null}
                              className="h-8.5 sm:h-9 min-w-0 inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-sand-mute bg-white px-1.5 sm:px-3.5 text-[11px] sm:text-xs font-semibold text-bark hover:bg-sand transition shadow-sm disabled:opacity-60"
                            >
                              {preparing === "pdf" ? (
                                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-ember shrink-0" aria-hidden="true" />
                              ) : (
                                <Printer className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-ember shrink-0" aria-hidden="true" />
                              )}
                              <span className="truncate">{preparing === "pdf" ? "Preparing…" : "PDF Report"}</span>
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Add Receipt Modal — the same modal the contributions ledger uses,
          shared with the fund drives console. */}
      <AddReceiptModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={handleReceiptSaved}
      />

      {/* Preparing the document: generation runs on the server and can take a
          moment, so the desk is told what is being made and for which dates
          rather than left wondering whether the click registered. */}
      {preparing && !preview && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 print:hidden">
          <div className="flex items-center gap-2.5 rounded-2xl bg-bark px-4 py-3 text-xs font-semibold text-white shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>
              Preparing the PDF report for {rangeLabel}…
            </span>
          </div>
        </div>
      )}

      {/* The finished document, read before it is saved — a lightbox over the
          ledger, so the report never leaves the page it was asked from. */}
      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-bark/60 p-3 sm:p-6 print:hidden"
          onMouseDown={(event) => event.target === event.currentTarget && closePreview()}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={preview.title}
            className="flex h-full max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-sand-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-bark">{preview.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-moss">
                  {preview.range} • PDF • {preview.filename}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadPreview}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-dark"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  aria-label="Close preview"
                  className="rounded-xl p-2 text-moss transition hover:bg-sand hover:text-bark"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto bg-sand-soft p-3 sm:p-4">
              <iframe
                src={preview.url}
                title={preview.title}
                className="h-full min-h-[60vh] w-full rounded-xl border border-sand-line bg-white"
              />
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sand-line px-4 py-3 sm:px-5">
              <p className="text-[11px] text-moss">
                Cut to {preview.range}. What you see is the file you save.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-xl border border-sand-mute bg-white px-3 py-2 text-xs font-semibold text-bark transition hover:bg-sand"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={downloadPreview}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-ember px-3 py-2 text-xs font-semibold text-white transition hover:bg-ember-dark"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
