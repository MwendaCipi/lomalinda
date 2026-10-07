"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SabbathProgramModal, { SabbathProgramData } from "../../components/sabbath-program-modal";
import { getMinistryGivingPurpose } from "@/config/ministries";
import { PublicSectionNav } from "@/components/public-section-nav";
import { newsAndEventsLinks } from "@/config/site-sections";
import { usePageHeader } from "@/components/app-frame";
import { dayFirst, localDate, weekdayOf } from "@/lib/dates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** "Saturday, 3 October 2026" — the spoken form for programs and headings. */
const weekdayLabel = (iso: string) =>
  `${weekdayOf(iso)}, ${dayFirst(iso)}`;
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
//: The week as the grid reads it, Sunday first. Short on a phone, spelled out
//: once the columns have room.
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayNamesFull = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
//: The week's own column — the Sabbath. The grid shades it so the church's
//: week reads at a glance, the way a printed wall calendar rings it.
const SABBATH_COLUMN = 6;

/** How the page is read: the list of events, or the month laid out as a grid. */
type CalendarView = "table" | "month";

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
};

function mapsLink(settings: ChurchSettings | null) { return settings?.latitude && settings.longitude ? `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}` : ""; }
/** "14:30" spoken back as "2:30 PM", the way the desks write the time. */
function clockTime(value?: string) {
  const match = (value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
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
  mapUrl: string;
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
        href={`mailto:hello@sdalomalinda.or.ke?subject=${encodeURIComponent(`Contact leader: ${row.title}`)}`}
        onClick={onClose}
        className={`block rounded-lg px-3 py-2 ${item} hover:bg-sand`}
      >
        Contact department
      </a>
      {variant === "row" && (
        <>
          <a
            href={`mailto:hello@sdalomalinda.or.ke?subject=${encodeURIComponent(`Suggestion: ${row.title}`)}`}
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

/**
 * The month as a wall calendar: one column per weekday, the Sabbath shaded,
 * and each day holding the events the ministries filed on it. Every event is
 * a chip opening the same menu the table's rows carry, so switching views
 * changes how the month is read, never what can be done with it.
 */
function MonthGrid({
  year, month, events, mapUrl, openActions, onToggleActions, onCloseActions, onProgram,
}: {
  year: number;
  /** The month's index, 0-11 — a grid cannot lay out "all months". */
  month: number;
  events: CalendarEvent[];
  mapUrl: string;
  openActions: string | null;
  onToggleActions: (key: string) => void;
  onCloseActions: () => void;
  onProgram: (row: CalendarEvent) => void;
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  //: The first day's weekday decides how many leading days the first week borrows.
  const leadingDays = new Date(year, month, 1).getDay();
  const weeks = Math.ceil((leadingDays + daysInMonth) / 7);
  const todayKey = localDate();
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = (event.date ?? "").slice(0, 10);
    if (!key) continue;
    byDate.set(key, [...(byDate.get(key) ?? []), event]);
  }
  const isoDay = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div className="overflow-x-auto custom-table-scrollbar rounded-xl border border-sand-line bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand-line px-5 py-3">
        <h2 className="text-sm font-bold text-bark">
          {monthNames[month]} {year}
        </h2>
        <p className="text-xs text-moss">
          {events.length} {events.length === 1 ? "event" : "events"} this month
        </p>
      </div>
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead className="border-b border-sand-line bg-mist-select text-xs uppercase tracking-[0.12em] text-moss">
          <tr>
            {weekdayNames.map((short, weekday) => (
              <th
                key={short}
                scope="col"
                className={`px-3 py-2 font-semibold ${weekday === SABBATH_COLUMN ? "bg-mist-soft" : ""}`}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{weekdayNamesFull[weekday]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sand-wash">
          {Array.from({ length: weeks }, (_, week) => (
            <tr key={week} className="align-top">
              {weekdayNames.map((short, weekday) => {
                // Days before the 1st and after the month's end borrow their
                // number from the neighbouring month and hold nothing: the
                // grid keeps its weeks square without inventing events.
                const day = week * 7 + weekday - leadingDays + 1;
                const withinMonth = day >= 1 && day <= daysInMonth;
                const key = isoDay(day);
                const dayEvents = withinMonth ? byDate.get(key) ?? [] : [];
                const isToday = withinMonth && key === todayKey;
                // A menu near the foot of the grid opens upwards, so the last
                // weeks' events are not pushed out of the viewport.
                const opensUpwards = week >= weeks - 2;
                return (
                  <td
                    key={short}
                    className={`h-24 w-[14.28%] border-l border-sand-wash px-2 py-2 align-top first:border-l-0 ${
                      weekday === SABBATH_COLUMN ? "bg-sand-linen" : ""
                    } ${isToday ? "bg-mist-tint" : ""}`}
                  >
                    <div
                      className={`mb-1 text-xs font-semibold ${
                        isToday ? "text-ember" : withinMonth ? "text-moss-dark" : "text-moss-faint"
                      }`}
                    >
                      {new Date(year, month, day).getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((row) => {
                        const actionKey = `${row.date}-${row.id}`;
                        return (
                          <div key={actionKey} data-calendar-action-menu className="relative">
                            <button
                              type="button"
                              aria-expanded={openActions === actionKey}
                              onClick={() => onToggleActions(actionKey)}
                              title={`${row.title}${row.department_name ? ` — ${row.department_name}` : ""}`}
                              className="w-full rounded-md border-l-2 border-ember bg-sand-plate px-1.5 py-1 text-left transition hover:bg-sand-wash"
                            >
                              <span className="block truncate text-[10px] font-semibold text-bark">{row.title}</span>
                              {row.time && (
                                <span className="block truncate text-[10px] text-moss">{clockTime(row.time)}</span>
                              )}
                            </button>
                            {openActions === actionKey && (
                              <div
                                className={`absolute left-0 z-30 w-48 rounded-xl border border-sand-line bg-white p-2 shadow-lg ${
                                  opensUpwards ? "bottom-full mb-1" : "top-full mt-1"
                                }`}
                              >
                                <EventActionsMenu
                                  row={row}
                                  mapUrl={mapUrl}
                                  variant="row"
                                  onClose={onCloseActions}
                                  onProgram={onProgram}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The calendar's own controls — the year, the month, the search and the print
 * — in one cluster. Signed in they ride the shell's header beside the page's
 * name (the way every other desk places its search); signed out they sit
 * beside the page's own heading, where a visitor still reaches them.
 */
function CalendarFilters({
  search, onSearch, year, onYear, month, onMonth, years, view, onView, className,
}: {
  search: string;
  onSearch: (value: string) => void;
  year: number;
  onYear: (value: number) => void;
  month: string;
  onMonth: (value: string) => void;
  years: number[];
  view: CalendarView;
  onView: (view: CalendarView) => void;
  className?: string;
}) {
  return (
    <div className={`flex w-full flex-wrap items-center gap-2 sm:w-auto ${className ?? ""}`}>
      <input
        type="search"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Search event, ministry, or date…"
        aria-label="Search the church calendar"
        className="w-full min-w-0 rounded-xl border border-sand-mute bg-white px-3 py-1.5 text-xs outline-none focus:border-ember sm:w-56"
      />
      <select
        value={year}
        onChange={(event) => onYear(Number(event.target.value))}
        aria-label="Church calendar year"
        className="rounded-xl border border-sand-mute bg-white px-2.5 py-1.5 text-xs font-semibold text-bark outline-none focus:border-ember"
      >
        {years.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(event) => onMonth(event.target.value)}
        aria-label="Church calendar month"
        className="rounded-xl border border-sand-mute bg-white px-2.5 py-1.5 text-xs font-semibold text-bark outline-none focus:border-ember"
      >
        {/* The grid lays out one month, so the whole-year reading is the
            list's alone: the choice is offered only while the list is on. */}
        {view === "table" && <option value="all">All months</option>}
        {monthNames.map((name, index) => (
          <option key={name} value={index}>
            {name}
          </option>
        ))}
      </select>
      <div
        role="group"
        aria-label="How to read the calendar"
        className="flex items-center rounded-xl border border-sand-mute bg-white p-0.5"
      >
        {([["table", "List"], ["month", "Month"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => onView(value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              view === value ? "bg-ember text-white" : "text-moss-dark hover:text-bark"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl bg-ember px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-ember-dark"
      >
        Print
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
  const currentYear = today.getFullYear();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() => { const requestedYear = Number(searchParams.get("year")); return requestedYear >= currentYear - 2 && requestedYear <= currentYear + 2 ? requestedYear : currentYear; });
  const [selectedMonth, setSelectedMonth] = useState(searchParams.get("month") ?? String(today.getMonth()));
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  // The list is what the page opens on; the month grid is the other way to
  // read the same events, and both stay reachable from the same controls.
  const [view, setView] = useState<CalendarView>(searchParams.get("view") === "month" ? "month" : "table");
  const [activeProgram, setActiveProgram] = useState<SabbathProgramData | null>(null);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const { setHeaderRightAction } = usePageHeader();

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

  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  /**
   * The grid lays out a single month, so asking for it while the page is
   * showing every month lands on this one rather than on an unreadable year.
   */
  function chooseView(next: CalendarView) {
    if (next === "month" && selectedMonth === "all") setSelectedMonth(String(today.getMonth()));
    setView(next);
  }

  // Signed in, the controls ride the shell's header beside the page's name —
  // one row for the heading and its controls at both widths, exactly as the
  // treasury and the department desks place theirs.
  useEffect(() => {
    if (!signedIn) {
      setHeaderRightAction(null);
      return;
    }
    setHeaderRightAction(
      <CalendarFilters
        search={search}
        onSearch={setSearch}
        year={selectedYear}
        onYear={setSelectedYear}
        month={selectedMonth}
        onMonth={setSelectedMonth}
        years={years}
        view={view}
        onView={chooseView}
      />
    );
    return () => setHeaderRightAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, setHeaderRightAction, search, selectedMonth, selectedYear, view]);

  const mapUrl = mapsLink(settings);
  // The grid's own month: it lays out a single one, so a page that arrived
  // asking for every month still gives it something to draw.
  const gridMonth = selectedMonth === "all" ? today.getMonth() : Number(selectedMonth);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events
      .filter((event) => event.date?.startsWith(`${selectedYear}-`))
      .filter((event) => selectedMonth === "all" || Number(event.date.slice(5, 7)) - 1 === Number(selectedMonth))
      .filter((event) => {
        if (!needle) return true;
        const hay = `${event.date} ${weekdayLabel(event.date)} ${event.title} ${event.department_name} ${event.lead ?? ""} ${event.unit ?? ""} ${event.location ?? ""}`;
        return hay.toLowerCase().includes(needle);
      })
      .sort((a, b) => `${a.date} ${a.time ?? ""} ${a.title}`.localeCompare(`${b.date} ${b.time ?? ""} ${b.title}`));
  }, [events, search, selectedMonth, selectedYear]);

  function openProgram(row: CalendarEvent) { const file = row.program_file ? (row.program_file.startsWith("http") ? row.program_file : `${API_URL}${row.program_file}`) : null; setActiveProgram({ name: row.title, department: row.department_name, date: weekdayLabel(row.date), programText: undefined, programFile: file, programItems: undefined, isDesignated: true }); }

  return (
    <main className={signedIn ? "h-full min-h-0 bg-sand text-bark" : "min-h-screen bg-sand text-bark"}>
      <section className={signedIn ? "sr-only" : "px-6 pt-14 lg:px-8"}>
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ember">Church life</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Church Calendar</h1>
              <p className="mt-4 text-base leading-8 text-moss">
                Sabbaths, vespers, programmes and special events across the church year.
              </p>
            </div>
            <CalendarFilters
              search={search}
              onSearch={setSearch}
              year={selectedYear}
              onYear={setSelectedYear}
              month={selectedMonth}
              onMonth={setSelectedMonth}
              years={years}
              view={view}
              onView={chooseView}
              className="lg:justify-end"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-10 lg:px-8 lg:py-12">
        {/* PC Desktop Table View (visible on md and up) */}
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
              {rows.map((row) => {
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
          {rows.map((row) => {
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

        {/* The month, laid out as a calendar: the same events the list shows,
            read by the day they fall on. */}
        {view === "month" && (
          <MonthGrid
            year={selectedYear}
            month={gridMonth}
            events={rows}
            mapUrl={mapUrl}
            openActions={openActions}
            onToggleActions={(key) => setOpenActions(openActions === key ? null : key)}
            onCloseActions={() => setOpenActions(null)}
            onProgram={openProgram}
          />
        )}

        {loaded && rows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-moss">
            No calendar entries match your filters.
          </p>
        )}
        {!loaded && <p className="mt-8 text-sm text-moss">Loading the church calendar...</p>}
        <p className="mt-4 text-xs text-moss">
          Showing {rows.length} {rows.length === 1 ? "entry" : "entries"}, added by the ministries and departments.
        </p>
      </div>

      {/* The old News & Events sidebar, now part of the page body. */}
      <PublicSectionNav
        eyebrow="News & events"
        title="More news and events"
        description="Announcements, the church year, and the order of service for this Sabbath."
        links={newsAndEventsLinks}
        activeKey="calendar"
        className="border-t border-sand-line bg-white/60"
      />

      <SabbathProgramModal program={activeProgram} onClose={() => setActiveProgram(null)} />
    </main>
  );
}

export default function CalendarPage() {
  return <Suspense fallback={<main className="min-h-screen bg-sand px-6 py-16 text-center text-moss">Loading calendar...</main>}><CalendarPageContent /></Suspense>;
}
