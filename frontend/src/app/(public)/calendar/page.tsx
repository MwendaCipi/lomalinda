"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { usePageHeader } from "@/components/app-frame";
import {
  CalendarViewToggle,
  MonthGrid,
  clockTime,
  monthNames,
  type CalendarView,
} from "@/components/calendar-views";
import SabbathProgramModal, { SabbathProgramData } from "../../components/sabbath-program-modal";
import { parseProgramItems, type ProgramItem } from "@/components/program-document";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { dayFirst, weekdayOf } from "@/lib/dates";
import { churchMapHref } from "@/hooks/use-church-settings";

import { ChurchLockup } from "@/components/church-lockup";

/**
 * The page a first-time visitor searches for and never finds: the church
 * calendar, read as the Sabbath's own week.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** "Saturday, 3 October 2026" — the spoken form for programs and headings. */
const weekdayLabel = (iso: string) =>
  `${weekdayOf(iso)}, ${dayFirst(iso)}`;

function quarterBounds(year: number, month: number) {
  const startMonth = Math.floor(month / 3) * 3;
  const endDay = new Date(year, startMonth + 3, 0).getDate();
  return {
    start: `${year}-${String(startMonth + 1).padStart(2, "0")}-01`,
    end: `${year}-${String(startMonth + 3).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
  };
}

type CalendarPeriod = "quarter" | "all";

type ChurchSettings = { address: string; latitude: string | null; longitude: string | null };
// A row the church calendar shows. These are the ministries' and departments'
// own events — the calendar holds nothing of its own — so each row wears the
// area that will run it rather than a generic church-wide heading.
type CalendarEvent = {
  id: number;
  date: string;
  title: string;
  /** The area's code, e.g. "aym" — what the giving purpose is read from. */
  department: string;
  /** The area's own name, as the church records it. */
  department_name: string;
  /**
   * The ministry's giving purpose — the wording of the fund it gives into,
   * which is the account a giver's link preselects. The server reads it from
   * the ministry's linked treasury account, so the purpose a row offers and
   * the fund it opens always agree; a ministry with no fund yet carries its
   * own name.
   */
  giving_purpose?: string;
  time?: string;
  end_date?: string;
  end_time?: string;
  mode?: "physical" | "virtual";
  location?: string;
  meeting_link?: string;
  lead?: string;
  unit?: string;
  program_file?: string | null;
  /** The programme typed at the ministry's desk — its sessions with hours. */
  program_items?: ProgramItem[] | null;
};

/**
 * The map every physical event's actions menu offers: the church's own pin,
 * or a search for its address. Never a search for the church's name — that
 * listing is the plot the church no longer worships at — and null when the
 * record carries neither, in which case the menu simply offers no map.
 */

/**
 * The arrow back to the section the calendar belongs to. It leads the page —
 * above the heading, the way every other public page opens.
 */
function CalendarBack() {
  return (
    <Link
      href="/share"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:underline"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
      <span>Back to fellowship</span>
    </Link>
  );
}

/** The row's time: a range when the event finishes on the day it starts. */
function timeRange(event: CalendarEvent) {
  const start = clockTime(event.time);
  const end = clockTime(event.end_time);
  if (start && end) return `${start} – ${end}`;
  return start || end || "-";
}

/**
 * An event's own menu — the choices follow the event wherever it is listed:
 * the table's row, a phone's card, or a day in the month grid, so no view
 * offers less than another. The caller owns the box it sits in, since each
 * view anchors it differently.
 */
function EventActionsMenu({
  row, mapUrl, variant, onClose, onProgram,
}: {
  row: CalendarEvent;
  mapUrl: string | null;
  /** The table's row keeps the full menu; the tighter the listing, the fewer words. */
  variant: "row" | "card";
  onClose: () => void;
  onProgram: (row: CalendarEvent) => void;
}) {
  const item = variant === "row" ? "text-sm" : "text-xs";
  return (
    <>
      {row.mode === "virtual" && row.meeting_link && (
        <a href={row.meeting_link} target="_blank" rel="noreferrer" className={`block rounded-lg px-3 py-2 ${item} hover:bg-sand`}>
          Join meeting
        </a>
      )}
      {row.mode !== "virtual" && mapUrl && (
        <a href={mapUrl} target="_blank" rel="noreferrer" className={`block rounded-lg px-3 py-2 ${item} hover:bg-sand`}>
          Open map
        </a>
      )}
      <Link
        href={`/give?purpose=${encodeURIComponent(row.giving_purpose || getMinistryGivingPurpose(row.department_name || row.title))}`}
        onClick={onClose}
        className={`block rounded-lg px-3 py-2 ${item} hover:bg-sand`}
      >
        Give support
      </Link>
      <a
        href={`mailto:info@sdalomalinda.or.ke?subject=${encodeURIComponent(`Contact leader: ${row.title}`)}`}
        onClick={onClose}
        className={`block rounded-lg px-3 py-2 ${item} hover:bg-sand`}
      >
        Contact department
      </a>
      {variant === "row" && (
        <>
          <a
            href={`mailto:info@sdalomalinda.or.ke?subject=${encodeURIComponent(`Suggestion: ${row.title}`)}`}
            onClick={onClose}
            className={`block rounded-lg px-3 py-2 ${item} hover:bg-sand`}
          >
            Give suggestion
          </a>
          <button
            type="button"
            onClick={() => {
              onClose();
              onProgram(row);
            }}
            className={`block w-full text-left rounded-lg px-3 py-2 ${item} font-semibold text-ember hover:bg-sand`}
          >
            View Sabbath program
          </button>
        </>
      )}
    </>
  );
}


/** The calendar's own controls — the year, the month, the search and the print — in one cluster. Signed in they ride the shell's header beside the page's name (the way every other desk places its search); signed out they sit beside the page's own heading, where a visitor still reaches them. */
function PeriodButtons({
  period,
  onPeriod,
}: {
  period: CalendarPeriod;
  onPeriod: (value: CalendarPeriod) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Calendar period"
      className="inline-flex h-full w-full shrink-0 items-center gap-1 rounded-xl border border-sand-mute bg-white p-1"
    >
      <button
        type="button"
        aria-pressed={period === "quarter"}
        onClick={() => onPeriod("quarter")}
        className={`flex-1 min-h-9 whitespace-nowrap rounded-lg px-1.5 py-1 text-[10px] font-semibold transition sm:px-2.5 sm:text-xs ${
          period === "quarter"
            ? "bg-ember text-white"
            : "text-moss-dark hover:text-bark"
        }`}
      >
        This quarter
      </button>
      <button
        type="button"
        aria-pressed={period === "all"}
        onClick={() => onPeriod("all")}
        className={`flex-1 min-h-9 whitespace-nowrap rounded-lg px-1.5 py-1 text-[10px] font-semibold transition sm:px-2.5 sm:text-xs ${
          period === "all"
            ? "bg-ember text-white"
            : "text-moss-dark hover:text-bark"
        }`}
      >
        This year &amp; next
      </button>
    </div>
  );
}


function CalendarPageContent() {
  // Signed in, the page lives in the app shell — the strip at the top names
  // the page, so the marketing heading hides and the content leads. The read
  // is deferred by a microtask (the idiom the reports panel uses) so the
  // effect's own body stays synchronous-free.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setSignedIn(Boolean(localStorage.getItem("access_token")));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const searchParams = useSearchParams();
  // The list leads: a phone reads cards, a desk reads the table, and the
  // month grid is the second view anyone can switch to.
  const [view, setView] = useState<CalendarView>(() => searchParams.get("view") === "calendar" ? "calendar" : "table");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [period, setPeriod] = useState<CalendarPeriod>("quarter");
  const [activeProgram, setActiveProgram] = useState<SabbathProgramData | null>(null);
  const [openActions, setOpenActions] = useState<string | null>(null);

  // On a phone the switches give way as soon as the list starts moving —
  // the row they sit in is the page's tallest chrome, and a phone spends
  // its height on the events. Scrolled back to the top, they return.
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const container = contentRef.current;
      const y = signedIn && container ? container.scrollTop : window.scrollY;
      setScrolled(y > 24);
    };
    // Signed in, the page scrolls its own panel; the public page scrolls
    // the document.
    const target: EventTarget = signedIn && contentRef.current ? contentRef.current : window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [signedIn]);

  useEffect(() => {
    function closeActions(event: MouseEvent) {
      const target = event.target as Element;
      if (!target.closest("[data-calendar-action-menu]")) setOpenActions(null);
    }
    document.addEventListener("mousedown", closeActions);
    return () => document.removeEventListener("mousedown", closeActions);
  }, []);

  // The church calendar reads the ministries' and departments' own events —
  // the areas write them from their desks, so the calendar holds no second
  // copy of its own and no placeholders it invented.
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/members/church-calendar/`).then((response) => (response.ok ? response.json() : null)),
      fetch(`${API_URL}/api/members/church-settings/`).then((response) => (response.ok ? response.json() : null)),
    ])
      .then(([calendar, churchSettings]) => {
        setEvents(Array.isArray(calendar?.events) ? calendar.events : []);
        setSettings(churchSettings);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoaded(true));
  }, []);

  const mapUrl = churchMapHref(settings);
  /* The scroll sheet runs this month through the end of next year — the same
   * reach the list's "This year & next" grants. */
  const nextCalendarYear = currentYear + 1;

  const tableRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const nextYear = currentYear + 1;
    return events
      // This year and the one after it: the church files next season's
      // Sabbaths months ahead, and the calendar is where the congregation
      // looks for them — a page pinned to the current year hid everything
      // filed for the new year until January came round.
      .filter((event) => {
        const year = Number((event.date ?? "").slice(0, 4));
        return year === currentYear || year === nextYear;
      })
      .filter((event) => {
        if (period === "all") return true;
        const quarter = quarterBounds(currentYear, currentMonth);
        return event.date >= quarter.start && event.date <= quarter.end;
      })
      .filter((event) => {
        if (!needle) return true;
        const hay = `${event.date} ${weekdayLabel(event.date)} ${event.title} ${event.department_name} ${event.lead ?? ""} ${event.unit ?? ""} ${event.location ?? ""}`;
        return hay.toLowerCase().includes(needle);
      })
      .sort((a, b) => `${a.date} ${a.time ?? ""} ${a.title}`.localeCompare(`${b.date} ${b.time ?? ""} ${b.title}`));
  }, [currentMonth, currentYear, events, search, period]);

  const searchFiltered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events
      .filter((event) => {
        if (!needle) return true;
        const hay = `${event.date} ${weekdayLabel(event.date)} ${event.title} ${event.department_name} ${event.lead ?? ""} ${event.unit ?? ""} ${event.location ?? ""}`;
        return hay.toLowerCase().includes(needle);
      })
      .sort((a, b) => `${a.date} ${a.time ?? ""} ${a.title}`.localeCompare(`${b.date} ${b.time ?? ""} ${b.title}`));
  }, [events, search]);

  /* The calendar grid: this month opens it and the months after follow
   * downward — scrolling carries the reader into the next season, on both
   * phone and desktop. This month through the end of next year is the
   * sheet's length, matching what the list offers in "This year & next". */
  const calendarScrollMonths = useMemo(() => {
    const months: { year: number; month: number; events: CalendarEvent[] }[] = [];
    let year = currentYear;
    let month = currentMonth;
    while (true) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-`;
      months.push({
        year,
        month,
        events: searchFiltered.filter((event) => event.date?.startsWith(key)),
      });
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      if (year > nextCalendarYear) break;
    }
    return months;
  }, [currentMonth, currentYear, searchFiltered]);

  const gridCount = view === "calendar" ? searchFiltered.length : tableRows.length;
  const gridCountLabel =
    view === "calendar"
      ? " this year and next"
      : period === "quarter"
        ? " this quarter"
        : " this year and next";

  // The one cluster of controls — view, period and search — memoised so the
  // header-injection effect below only re-runs when a control actually changes.
  const controls = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* The two switches share one row, split evenly and drawn to the
            same height — one line on a phone, its own line there. */}
        <div className="flex w-full items-stretch gap-1.5 sm:w-auto sm:flex-1 sm:gap-3">
          <div className="min-w-0 flex-1 [&>div]:h-full [&>div]:w-full">
            <CalendarViewToggle view={view} onChange={setView} />
          </div>
          <div className="min-w-0 flex-1 [&>div]:h-full [&>div]:w-full">
            <PeriodButtons period={period} onPeriod={setPeriod} />
          </div>
        </div>
        {/* The search: filters in list mode, names a month to scroll to
            in calendar mode. */}
        <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search event, ministry, or date…"
            aria-label="Search the church calendar"
            className="w-full rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember"
          />
        </div>
      </div>
    ),
    [view, period, search]
  );

  // The controls ride the shell header when signed in on any screen size.
  const { setHeaderRightAction } = usePageHeader();
  useEffect(() => {
    if (signedIn) {
      setHeaderRightAction(<div className="w-full sm:w-auto">{controls}</div>);
    } else {
      setHeaderRightAction(null);
    }
    return () => setHeaderRightAction(null);
  }, [signedIn, controls, setHeaderRightAction]);

  function openProgram(row: CalendarEvent) {
    const file = row.program_file ? (row.program_file.startsWith("http") ? row.program_file : `${API_URL}${row.program_file}`) : null;
    setActiveProgram({
      name: row.title,
      department: row.department_name,
      lead: row.lead,
      date: weekdayLabel(row.date),
      dateISO: row.date,
      programText: undefined,
      programFile: file,
      // The programme the ministry typed, read back into its sessions: it is
      // shown on the same sheet an uploaded file would be handed out on.
      programItems: parseProgramItems(row.program_items),
      isDesignated: true,
    });
  }

  return (
    <main className={signedIn ? "flex h-full min-h-0 flex-col overflow-hidden bg-sand text-bark" : "min-h-screen bg-sand text-bark"}>
      <section className={signedIn ? "sr-only" : "px-6 pt-14 lg:px-8"}>
        <div className="mx-auto max-w-6xl">
          <CalendarBack />
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">Church life</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Church Calendar</h1>
              <p className="mt-4 text-base leading-8 text-moss">
                Every Sabbath School, vespers, programme and special event the church holds through the year, in one week-by-week view.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div ref={contentRef} className={`mx-auto w-full max-w-6xl space-y-4 px-6 ${signedIn ? "flex flex-1 min-h-0 flex-col overflow-y-auto pt-4 lg:px-8 lg:pt-5" : "py-10 lg:px-8 lg:py-12"}`}>
        {/* The church's letterhead, on the printed page only — what makes
            a printout of the calendar the church's own sheet. */}
        <ChurchLockup className="hidden print:flex print:mb-2" />
        {/* Controls show in-content when not signed in, or on mobile when signed in.
            When signed in they have already been hoisted into the shell header. */}
        {!signedIn && controls}

        {/* Table view — wide screens only; a phone reads the cards below. */}
        <div className={`${view === "table" ? "hidden md:block" : "hidden"} overflow-x-auto custom-table-scrollbar rounded-xl border border-sand-line bg-white`}>
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="border-b border-sand-line bg-mist-select text-xs uppercase tracking-[0.12em] text-moss">
              <tr>
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 font-semibold">Event</th>
                <th className="px-5 py-4 font-semibold">Time</th>
                <th className="px-5 py-4 font-semibold">Ministry</th>
                <th className="px-5 py-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-wash">
              {tableRows.map((row) => {
                const actionKey = `${row.date}-${row.id}`;
                return (
                  <tr key={actionKey} className="hover:bg-sand-plate">
                    <td className="whitespace-nowrap px-5 py-4 text-moss">
                      {dayFirst(row.date)}
                    </td>
                    <td className="px-5 py-4 font-semibold">
                      {row.title}
                      {row.lead && <span className="block text-xs font-normal text-moss">Led by {row.lead}</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-moss">{timeRange(row)}</td>
                    <td className="px-5 py-4 text-moss">{row.department_name || "-"}</td>
                    <td data-calendar-action-menu className="relative px-5 py-4">
                      <button
                        type="button"
                        aria-expanded={openActions === actionKey}
                        onClick={() => setOpenActions(openActions === actionKey ? null : actionKey)}
                        className="rounded-lg border border-sand-mute px-3 py-2 text-sm font-semibold text-bark hover:border-ember"
                      >
                        Actions <span aria-hidden="true">v</span>
                      </button>
                      {openActions === actionKey && (
                        <div className="absolute right-5 top-14 z-20 w-48 rounded-xl border border-sand-line bg-white p-2 shadow-lg">
                          <EventActionsMenu
                            row={row}
                            mapUrl={mapUrl}
                            variant="row"
                            onClose={() => setOpenActions(null)}
                            onProgram={openProgram}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Calendar Cards View (visible on mobile only) */}
        <div className={`gap-4 ${view === "table" ? "grid md:hidden" : "hidden"}`}>
          {tableRows.map((row) => {
            const actionKey = `mobile-${row.date}-${row.id}`;
            const dateStr = dayFirst(row.date);
            return (
              <div key={actionKey} className="rounded-2xl bg-white p-5 border border-sand-line shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-ember">{dateStr}</span>
                    <h3 className="font-bold text-base text-bark mt-0.5">{row.title}</h3>
                  </div>
                  {row.department_name && (
                    <span className="rounded-full bg-mist-select px-2.5 py-1 text-[10px] font-bold text-moss-dark shrink-0">
                      {row.department_name}
                    </span>
                  )}
                </div>

                {row.time && (
                  <p className="text-xs text-moss">
                    <span className="font-semibold text-bark">Time:</span> {timeRange(row)}
                  </p>
                )}

                <div data-calendar-action-menu className="relative pt-3 border-t border-sand-line/60 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => openProgram(row)}
                    className="text-xs font-bold text-ember hover:underline"
                  >
                    View Sabbath Program &rarr;
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      aria-expanded={openActions === actionKey}
                      onClick={() => setOpenActions(openActions === actionKey ? null : actionKey)}
                      className="rounded-lg border border-sand-mute px-3 py-1.5 text-xs font-semibold text-bark hover:border-ember"
                    >
                      Actions ▾
                    </button>
                    {openActions === actionKey && (
                      <div className="absolute right-0 bottom-full mb-1.5 z-20 w-48 rounded-xl border border-sand-line bg-white p-2 shadow-lg">
                        <EventActionsMenu
                          row={row}
                          mapUrl={mapUrl}
                          variant="card"
                          onClose={() => setOpenActions(null)}
                          onProgram={openProgram}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* The month grid — a continuous scroll of months from the current
            month through to the end of next year, on both desktop and mobile.
            Scrolling down moves forward in time; no arrows needed. */}
        {view === "calendar" && (
          <div className="space-y-4">
            {calendarScrollMonths.map((slot) => (
              <MonthGrid
                key={`${slot.year}-${slot.month}`}
                year={slot.year}
                month={slot.month}
                events={slot.events}
                openActions={openActions}
                onToggleActions={(key) => setOpenActions(openActions === key ? null : key)}
                onCloseActions={() => setOpenActions(null)}
                renderMenu={(row, onClose) => (
                  <EventActionsMenu
                    row={row}
                    mapUrl={mapUrl}
                    variant="row"
                    onClose={onClose}
                    onProgram={openProgram}
                  />
                )}
              />
            ))}
          </div>
        )}

        {loaded && view === "table" && tableRows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-moss">No calendar entries match your filters.</p>
        )}
        {!loaded && <p className="mt-8 text-sm text-moss">Loading the church calendar...</p>}
        {/* The footer stays put — pinned flush to the foot of the page's
            own scroller (which the shell keeps just above the bottom tab
            bar) so the count and the Print button never scroll away and no
            calendar row shows beneath them, in either view. */}
        <div
          // margin-top:auto drops the footer to the foot of the scroller even
          // when the page is too short to scroll (inline: space-y-4's
          // margin-top outranks mt-auto in the cascade). The scroller is a
          // flex column only when signed in; in block layout auto computes
          // to 0 and changes nothing. On a phone the sheet's footer dips out
          // of view while the page is in motion, returning once it rests.
          style={{ marginTop: "auto" }}
          className={`sticky bottom-0 z-20 -mx-6 flex-wrap items-center justify-between gap-3 border-t border-sand-line bg-sand px-6 pt-3 md:static md:mx-0 md:flex md:px-0 ${scrolled ? "hidden md:flex" : "flex"}`}
        >
          <p className="text-xs text-moss">
            Showing {gridCount} {gridCount === 1 ? "entry" : "entries"}{gridCountLabel}.
          </p>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3.5 py-2 text-xs font-semibold text-bark transition hover:border-ember hover:text-ember print:hidden">
            <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print
          </button>
        </div>
      </div>

      <SabbathProgramModal program={activeProgram} onClose={() => setActiveProgram(null)} />
    </main>
  );
}

export default function CalendarPage() {
  return <Suspense fallback={<main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">Loading calendar...</main>}><CalendarPageContent /></Suspense>;
}
