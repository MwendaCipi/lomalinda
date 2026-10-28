"use client";

import { CalendarDays, List } from "lucide-react";
import type { ReactNode } from "react";
import { localDate } from "@/lib/dates";

/** How a calendar is read: the list of events, or the month laid out as a grid. */
export type CalendarView = "calendar" | "table";

export const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

//: The week as the grid reads it, Sunday first. Short on a phone, spelled out
//: once the columns have room.
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdayNamesFull = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

//: The week's own column — the Sabbath. The grid shades it so the church's
//: week reads at a glance, the way a printed wall calendar rings it.
const SABBATH_COLUMN = 6;

/** The minimum shape a row must have to appear on the wall grid. */
export type GridEvent = {
  id: number;
  date: string;
  end_date?: string;
  title: string;
  time?: string;
  /** The area that runs it, shown in a chip's tooltip when present. */
  department_name?: string;
};

/** "14:30" spoken back as "2:30 PM", the way the desks write the time. */
export function clockTime(value?: string) {
  const match = (value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${hours >= 12 ? "PM" : "AM"}`;
}

/**
 * The List/Table (phone) ↔ Calendar (grid) toggle. It leads the controls and
 * is the read picked by default: a phone reads cards, a desk reads the table,
 * and the month grid is the second view anyone can switch to.
 */
export function CalendarViewToggle({
  view,
  onChange,
}: {
  view: CalendarView;
  onChange: (view: CalendarView) => void;
}) {
  return (
    <div role="group" aria-label="Calendar view" className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-sand-line bg-white p-1">
      {([
        ["table", "List", "Table", List],
        ["calendar", "Calendar", "Calendar", CalendarDays],
      ] as const).map(([value, phoneLabel, deskLabel, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          onClick={() => onChange(value)}
          className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${view === value ? "bg-bark text-white" : "text-moss hover:bg-sand"}`}
        >
          {/* A phone names the view in words; the icon would only cost the width
              the period buttons beside it need to share the row. */}
          <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />{" "}
          <span className="sm:hidden">{phoneLabel}</span>
          <span className="hidden sm:inline">{deskLabel}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The month as a wall calendar: one column per weekday, the Sabbath shaded,
 * and each day holding the events filed on it. Every event is a chip that
 * opens the menu the caller renders, so each calendar offers its own actions
 * (the church's give/contact/programme, a department's remove) without the
 * grid knowing what they are.
 */
export function MonthGrid<T extends GridEvent>({
  year,
  month,
  events,
  openActions,
  onToggleActions,
  onCloseActions,
  renderMenu,
}: {
  year: number;
  month: number;
  events: T[];
  openActions: string | null;
  onToggleActions: (key: string) => void;
  onCloseActions: () => void;
  /** The menu for one event chip, rendered when its key is open. */
  renderMenu: (row: T, onClose: () => void) => ReactNode;
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  //: The first day's weekday decides how many leading days the first week borrows.
  const leadingDays = new Date(year, month, 1).getDay();
  const weeks = Math.ceil((leadingDays + daysInMonth) / 7);
  const todayKey = localDate();
  const byDate = new Map<string, T[]>();

  // Week-long / multi-day events that span whole weeks
  // (e.g. Youth Week of Prayer, Camp Meeting, etc.)
  const getEventDateRange = (e: T): { start: string; end: string } => {
    const start = (e.date ?? "").slice(0, 10);
    const end = (e.end_date ?? "").slice(0, 10) || start;
    return { start, end };
  };

  // Map each event across its dates so days know what happens on them
  for (const event of events) {
    const { start, end } = getEventDateRange(event);
    if (!start) continue;

    // If single day, map to start
    if (start === end || !eEndValid(start, end)) {
      byDate.set(start, [...(byDate.get(start) ?? []), event]);
      continue;
    }

    // If multi-day, populate each day in range
    const cur = new Date(start + "T00:00:00");
    const stop = new Date(end + "T00:00:00");
    while (cur <= stop) {
      const dStr = cur.toISOString().slice(0, 10);
      byDate.set(dStr, [...(byDate.get(dStr) ?? []), event]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  function eEndValid(s: string, e: string) {
    return e >= s;
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
          {Array.from({ length: weeks }, (_, week) => {
            const weekDates = weekdayNames.map((_, weekday) => {
              const day = week * 7 + weekday - leadingDays + 1;
              const withinMonth = day >= 1 && day <= daysInMonth;
              return {
                day,
                weekday,
                withinMonth,
                iso: withinMonth ? isoDay(day) : "",
              };
            });



            const opensUpwards = week >= weeks - 2;

            return (
              <tr key={week} className="align-top">
                {weekdayNames.map((short, weekday) => {
                  const info = weekDates[weekday];
                  const { day, withinMonth, iso } = info;
                  const isToday = withinMonth && iso === todayKey;                    // Find a week-long program whose dates cover this calendar week
                    // (Sunday through Saturday by default; a touching multi-day event that
                    // spans the whole week also qualifies, and the week label uses its real
                    // dates rather than assuming Sun–Sat). A week runs Sun–Sat unless
                    // the dates say otherwise.
                    const fullWeekSlots = weekDates.filter((w) => w.withinMonth);
                    const fullWeekEvent = events.find((ev) => {
                      const { start, end } = getEventDateRange(ev);
                      if (!start || !end || start === end) return false;
                      if (fullWeekSlots.length === 0) return false;
                      if (fullWeekSlots.length < 6) return false;
                      const weekStart = fullWeekSlots[0].iso;
                      const weekEnd = fullWeekSlots[fullWeekSlots.length - 1].iso;
                      // Treat as full week if it covers the week start and goes to at least
                      // the week end (or the Saturday of that week), regardless of minor
                      // off-by-one in stored end dates.
                      if (start <= weekStart && end >= weekEnd) return true;
                      if (start <= weekStart && end >= weekStart && (end >= weekEnd || fullWeekSlots.every((slot) => slot.iso >= start && slot.iso <= end))) {
                        return fullWeekSlots.filter((slot) => slot.iso >= start && slot.iso <= end).length >= 6;
                      }
                      return fullWeekSlots.every((slot) => slot.iso >= start && slot.iso <= end);
                    });

                    // If this week has a full-week program (like Youth Week of Prayer) that runs
                    // across the whole week, join the covered weekdays into one row cell.
                    if (fullWeekEvent && weekday >= 0 && weekday <= 6) {
                    // Only render the spanning cell once per week, on its first covered weekday.
                    if (weekday === 0) {
                      const actionKey = `week-${fullWeekEvent.id}-${week}`;
                      return (
                        <td
                          key="weekdays-joined"
                          colSpan={7}
                          className="h-24 border-l border-sand-wash px-3 py-2 align-top bg-sand-plate/60"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold text-moss mb-1.5">
                            <span className="text-[11px] uppercase tracking-wider text-ember font-bold">Week</span>
                            <span className="text-[10px] text-moss-dark">
                              {weekDates[0].withinMonth ? new Date(year, month, weekDates[0].day).getDate() : ""} –{" "}
                              {weekDates[6].withinMonth ? new Date(year, month, weekDates[6].day).getDate() : ""}{" "}
                              {monthNames[month]}
                            </span>
                          </div>
                          <div data-calendar-action-menu className="relative mt-1">
                            <button
                              type="button"
                              aria-expanded={openActions === actionKey}
                              onClick={() => onToggleActions(actionKey)}
                              title={`${fullWeekEvent.title}${fullWeekEvent.department_name ? `: ${fullWeekEvent.department_name}` : ""}`}
                              className="w-full rounded-lg border-l-4 border-ember bg-white p-2.5 text-left shadow-sm transition hover:bg-sand-wash"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="block font-bold text-xs text-bark sm:text-sm">{fullWeekEvent.title}</span>
                                {fullWeekEvent.department_name && (
                                  <span className="shrink-0 rounded-full bg-mist-select px-2 py-0.5 text-[10px] font-bold text-sage-strong">
                                    {fullWeekEvent.department_name}
                                  </span>
                                )}
                              </div>
                              {fullWeekEvent.time && (
                                <span className="mt-0.5 block text-[11px] text-moss">{clockTime(fullWeekEvent.time)}</span>
                              )}
                            </button>
                            {openActions === actionKey && (
                              <div
                                className={`absolute left-0 z-30 w-52 rounded-xl border border-sand-line bg-white p-2 shadow-lg ${
                                  opensUpwards ? "bottom-full mb-1" : "top-full mt-1"
                                }`}
                              >
                                {renderMenu(fullWeekEvent, onCloseActions)}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    }
                    // For the other days in the week: skip since Sunday's cell spans the whole week.
                    return null;
                  }

                  const dayEvents = withinMonth ? byDate.get(iso) ?? [] : [];

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
                                title={`${row.title}${row.department_name ? `: ${row.department_name}` : ""}`}
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
                                  {renderMenu(row, onCloseActions)}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
