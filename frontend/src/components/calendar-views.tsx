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
          ))}
        </tbody>
      </table>
    </div>
  );
}
