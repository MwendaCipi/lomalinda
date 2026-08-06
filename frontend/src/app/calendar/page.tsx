"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import SabbathProgramModal, { SabbathProgramData } from "../components/sabbath-program-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type ChurchSettings = { address: string; latitude: string | null; longitude: string | null; midweek_vespers_link: string; midweek_vespers_time: string; friday_vespers_time: string; sabbath_time: string };
type CalendarEvent = { date: string; name: string; department?: string; program_text?: string; program_file?: string | null; program_items?: [string, string][]; kind?: "online" | "onsite" | "sabbath" | "special"; time?: string; meeting_link?: string; location_link?: string };

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function getDates(year: number, day: number) { const dates: Date[] = []; const date = new Date(year, 0, 1); while (date.getFullYear() === year) { if (date.getDay() === day) dates.push(new Date(date)); date.setDate(date.getDate() + 1); } return dates; }
function mapsLink(settings: ChurchSettings | null) { return settings?.latitude && settings.longitude ? `https://www.google.com/maps/search/?api=1&query=${settings.latitude},${settings.longitude}` : ""; }
function timeOnly(value?: string) { if (!value) return "-"; const match = value.match(/\d{1,2}:\d{2}\s*[AP]M(?:\s*[-–—]\s*\d{1,2}:\d{2}\s*[AP]M)?/i); return match?.[0] ?? value; }
function newYearsThanksgiving(year: number): CalendarEvent { return { date: `${year}-01-01`, name: "New Year's Thanksgiving", department: "Whole church", kind: "special", program_items: [["9:00 AM", "Opening prayer"], ["9:15 AM", "Music"], ["9:45 AM", "Bible sharing"], ["10:30 AM", "Testimonies"], ["11:15 AM", "Prayers"], ["12:00 PM", "Offerings"], ["12:30 PM", "Departure"]] }; }

function CalendarPageContent() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() => { const requestedYear = Number(searchParams.get("year")); return requestedYear >= currentYear - 2 && requestedYear <= currentYear + 2 ? requestedYear : currentYear; });
  const [selectedMonth, setSelectedMonth] = useState(searchParams.get("month") ?? String(today.getMonth()));
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [activeProgram, setActiveProgram] = useState<SabbathProgramData | null>(null);
  const [openActions, setOpenActions] = useState<string | null>(null);

  useEffect(() => {
    function closeActions(event: MouseEvent) {
      const target = event.target as Element;
      if (!target.closest("[data-calendar-action-menu]")) setOpenActions(null);
    }
    document.addEventListener("mousedown", closeActions);
    return () => document.removeEventListener("mousedown", closeActions);
  }, []);

  useEffect(() => { Promise.all([fetch(`${API_URL}/api/members/sabbath-events/`).then((response) => response.ok ? response.json() : []), fetch(`${API_URL}/api/members/church-settings/`).then((response) => response.ok ? response.json() : null)]).then(([calendarEvents, churchSettings]) => { setEvents(calendarEvents); setSettings(churchSettings); }).catch(() => setEvents([])).finally(() => setLoaded(true)); }, []);

  const rows = useMemo(() => {
    const eventMap = new Map(events.filter((event) => event.date.startsWith(`${selectedYear}-`)).map((event) => [event.date, { ...event, time: timeOnly(event.time) }]));
    const mapUrl = mapsLink(settings);
    const entries: { date: string; event: CalendarEvent }[] = [];
    getDates(selectedYear, 3).forEach((date) => entries.push({ date: dateKey(date), event: { date: dateKey(date), name: "Midweek Vespers", department: "Prayer ministry", kind: "online", time: timeOnly(settings?.midweek_vespers_time || "Wednesday - 8:00 PM - 9:00 PM"), meeting_link: settings?.midweek_vespers_link } }));
    getDates(selectedYear, 5).forEach((date) => entries.push({ date: dateKey(date), event: { date: dateKey(date), name: "Friday Vespers", department: "Worship ministry", kind: "onsite", time: timeOnly(settings?.friday_vespers_time || "Friday - 5:30 PM - 6:30 PM"), location_link: mapUrl } }));
    getDates(selectedYear, 6).forEach((date) => { const key = dateKey(date); const customEvent = eventMap.get(key); entries.push({ date: key, event: customEvent ? { ...customEvent, kind: "sabbath", time: timeOnly(customEvent.time || settings?.sabbath_time || "Saturday - 8:00 AM - 4:00 PM"), location_link: mapUrl } : { date: key, name: "Sabbath Worship", kind: "sabbath", time: timeOnly(settings?.sabbath_time || "Saturday - 8:00 AM - 4:00 PM"), location_link: mapUrl } }); });
    const newYear = newYearsThanksgiving(selectedYear); entries.push({ date: newYear.date, event: newYear });
    eventMap.forEach((event, date) => { if (!entries.some((entry) => entry.date === date)) entries.push({ date, event }); });
    return entries.sort((a, b) => a.date.localeCompare(b.date)).filter(({ date, event }) => { const monthMatches = selectedMonth === "all" || Number(date.slice(5, 7)) - 1 === Number(selectedMonth); const dateText = new Date(`${date}T12:00:00`).toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); return monthMatches && `${date} ${dateText} ${event.name} ${event.department ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()); });
  }, [events, search, selectedMonth, selectedYear, settings]);

  function openProgram(row: { date: string; event: CalendarEvent }) { const file = row.event.program_file ? (row.event.program_file.startsWith("http") ? row.event.program_file : `${API_URL}${row.event.program_file}`) : null; setActiveProgram({ name: row.event.name, department: row.event.department, date: new Date(`${row.date}T12:00:00`).toLocaleDateString("en-KE", { weekday: "long", month: "long", day: "numeric", year: "numeric" }), programText: row.event.program_text, programFile: file, programItems: row.event.program_items, isDesignated: row.event.kind === "special" || row.event.name !== "Sabbath Worship" }); }
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <main className="min-h-screen bg-[#f7f4ee] px-6 pb-10 pt-4 text-[#26352f] sm:pb-16 sm:pt-6">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/share"
          className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#b36b3c] transition hover:text-[#96552e]"
        >
          <span>&larr;</span>
          <span>Back to Fellowship</span>
        </Link>

        <div className="grid gap-4 pt-2 pb-1 md:grid-cols-[150px_170px_1fr]">
          <label className="text-sm font-semibold">
            Year
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="mt-2 block w-full rounded-lg border border-[#cfc9bd] bg-white px-3 py-2 font-normal"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Month
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="mt-2 block w-full rounded-lg border border-[#cfc9bd] bg-white px-3 py-2 font-normal"
            >
              <option value="all">All months</option>
              {monthNames.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <label className="min-w-0 flex-1 text-sm font-semibold">
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Event, department, or date"
                className="mt-2 block w-full rounded-lg border border-[#cfc9bd] bg-white px-3 py-2 font-normal outline-none focus:border-[#b36b3c]"
              />
            </label>
            <button
              type="button"
              onClick={() => window.print()}
              className="shrink-0 rounded-lg bg-[#b36b3c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#96552e]"
            >
              Print Calendar
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-[#dfdbd1] bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="border-b border-[#dfdbd1] bg-[#eef2ed] text-xs uppercase tracking-[0.12em] text-[#617068]">
              <tr>
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 font-semibold">Event</th>
                <th className="px-5 py-4 font-semibold">Time</th>
                <th className="px-5 py-4 font-semibold">Department</th>
                <th className="px-5 py-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e9e5dd]">
              {rows.map((row) => {
                const actionKey = `${row.date}-${row.event.name}`;
                return (
                  <tr key={actionKey} className="hover:bg-[#fcfbf9]">
                    <td className="whitespace-nowrap px-5 py-4 text-[#617068]">
                      {new Date(`${row.date}T12:00:00`).toLocaleDateString("en-KE", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4 font-semibold">{row.event.name}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-[#617068]">{row.event.time || "-"}</td>
                    <td className="px-5 py-4 text-[#617068]">{row.event.department || "-"}</td>
                    <td data-calendar-action-menu className="relative px-5 py-4">
                      <button
                        type="button"
                        aria-expanded={openActions === actionKey}
                        onClick={() => setOpenActions(openActions === actionKey ? null : actionKey)}
                        className="rounded-lg border border-[#c9c5bb] px-3 py-2 text-sm font-semibold text-[#26352f] hover:border-[#b36b3c]"
                      >
                        Actions <span aria-hidden="true">v</span>
                      </button>
                      {openActions === actionKey && (
                        <div className="absolute right-5 top-14 z-20 w-48 rounded-xl border border-[#dfdbd1] bg-white p-2 shadow-lg">
                          {row.event.kind === "online" && row.event.meeting_link && (
                            <a
                              href={row.event.meeting_link}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f7f4ee]"
                            >
                              Join meeting
                            </a>
                          )}
                          {row.event.location_link && (
                            <a
                              href={row.event.location_link}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f7f4ee]"
                            >
                              Open map
                            </a>
                          )}
                          <Link
                            href={`/give?purpose=${encodeURIComponent(row.event.name)}`}
                            onClick={() => setOpenActions(null)}
                            className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f7f4ee]"
                          >
                            Give support
                          </Link>
                          <a
                            href={`mailto:hello@lomalindachurch.org?subject=${encodeURIComponent(`Contact leader: ${row.event.name}`)}`}
                            onClick={() => setOpenActions(null)}
                            className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f7f4ee]"
                          >
                            Contact department
                          </a>
                          <a
                            href={`mailto:hello@lomalindachurch.org?subject=${encodeURIComponent(`Suggestion: ${row.event.name}`)}`}
                            onClick={() => setOpenActions(null)}
                            className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f7f4ee]"
                          >
                            Give suggestion
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActions(null);
                              openProgram(row);
                            }}
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f7f4ee]"
                          >
                            View program
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loaded && rows.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-[#617068]">
              No calendar entries match your filters.
            </p>
          )}
        </div>
        {!loaded && <p className="mt-8 text-sm text-[#617068]">Loading the church calendar...</p>}
        <p className="mt-4 text-xs text-[#617068]">
          Showing {rows.length} {rows.length === 1 ? "entry" : "entries"}.
        </p>
      </div>
      <SabbathProgramModal program={activeProgram} onClose={() => setActiveProgram(null)} />
    </main>
  );
}

export default function CalendarPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f7f4ee] px-6 py-16 text-center text-[#617068]">Loading calendar...</main>}><CalendarPageContent /></Suspense>;
}


