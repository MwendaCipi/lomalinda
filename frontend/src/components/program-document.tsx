"use client";

/**
 * A programme, as the church prints it.
 *
 * A typed programme is sessions in the database — the part of the day each
 * one holds, what it is called, and who facilitates it — shown as a bare
 * table it reads like one. This is the sheet those rows are laid onto: the
 * church's own letterhead, the day spelled out, and the order of service
 * beneath a rule. The hours belong to the activities inside a session, not
 * to the session itself; a session that still carries hours (one typed
 * before the editor stopped asking) prints them beside its name.
 *
 * A session carries the activities *inside* it: Sabbath School from 8:00 to
 * 10:00 holds an opening song, a mission reading and the lesson study, each
 * with its own hours and its own facilitator. Those sit under the session
 * behind a rule, the way a printed programme indents what happens within a
 * part of the day — so what the desk creates looks like the programme a
 * member picks up at the door rather than a table of contents.
 */

import { useState } from "react";

import { ChurchLockup } from "./church-lockup";
import { clockTime } from "@/components/calendar-views";
import { dayFirst, weekdayOf } from "@/lib/dates";

/** One person facilitating a session or an activity within it, and their part. */
export type ProgramParticipant = {
  name: string;
  role: string;
};

/** One activity inside a session — the opening song, the mission reading. */
export type ProgramPart = {
  /** The hour it starts, HH:MM; blank when it has no set hour. */
  start: string;
  end: string;
  title: string;
  participants: ProgramParticipant[];
};

/** One session of the order of service — Sabbath School, holding the activities that run through it. */
export type ProgramItem = ProgramPart & {
  /** The activities held inside the session, in the order they run. */
  parts: ProgramPart[];
};

/**
 * An hour the desk typed, read as ``HH:MM`` — or ``""`` when it names no
 * hour. The field takes the hour the way it is said ("8", "8:30", "8.30",
 * "14:00", "2:30 pm") so the desk types rather than works a clock control;
 * this settles what was typed into the form the programme stores.
 */
export function parseClockInput(value: unknown): string {
  const match = /^(\d{1,2})[:.]?(\d{2})?\s*(am|pm|a|p)?$/.exec(String(value ?? "").trim().toLowerCase());
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];
  if (minute > 59) return "";
  if (meridiem) {
    // The meridiem names the half of the day: 12 am is midnight, 12 pm noon.
    if (hour < 1 || hour > 12) return "";
    if (meridiem.startsWith("p") && hour !== 12) hour += 12;
    if (meridiem.startsWith("a") && hour === 12) hour = 0;
  } else if (hour > 23) {
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * An hour as ``HH:MM``, or ``""`` when it is not one — padded to two digits,
 * the form the programme stores and the sheet reads back.
 */
const toClock = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
};

function parseParticipants(raw: unknown): ProgramParticipant[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((person) => {
    if (!person || typeof person !== "object") return [];
    const name = String((person as ProgramParticipant).name ?? "").trim();
    if (!name) return [];
    return [{ name, role: String((person as ProgramParticipant).role ?? "").trim() }];
  });
}

function parsePart(raw: unknown): ProgramPart | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<ProgramPart> & { parts?: unknown };
  const title = String(entry.title ?? "").trim();
  const participants = parseParticipants(entry.participants);
  if (!title && participants.length === 0) return null;
  return {
    start: toClock(entry.start),
    end: toClock(entry.end),
    title,
    participants,
  };
}

/**
 * What arrives over the wire — the rows as saved, a JSON string a multipart
 * form carried, or nothing — read into sessions the sheet can draw. Half a
 * part still counts: an hour without a title is a gap to be filled in, not a
 * reason to drop the row.
 */
export function parseProgramItems(raw?: ProgramItem[] | string | null): ProgramItem[] {
  let rows: unknown = raw;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const entry = row as Partial<ProgramItem>;
    const session = parsePart(entry);
    if (!session) return [];
    const parts = Array.isArray(entry.parts)
      ? entry.parts.flatMap((part) => {
          const parsed = parsePart(part);
          return parsed ? [parsed] : [];
        })
      : [];
    return [{ ...session, parts }];
  });
}

/** Its sessions written back for the wire, in the shape the server keeps. */
export function serializeProgramItems(items: ProgramItem[]): ProgramItem[] {
  return parseProgramItems(JSON.stringify(items));
}

/** Does this session have anything to print — a name, or an activity within it? */
export function programItemHasContent(item: ProgramItem): boolean {
  return Boolean(item.title.trim()) || item.participants.length > 0 || item.parts.length > 0;
}

/**
 * The hours a session runs, spoken the way a programme says them: the
 * meridiem is written once when both ends fall in it — "8:00 – 10:00 AM" —
 * and an hourless entry is a dash rather than a lie about the time.
 */
export function sessionRange(item: { start: string; end: string }) {
  const start = clockTime(item.start);
  const end = clockTime(item.end);
  if (start && end) {
    return start.slice(-2) === end.slice(-2)
      ? `${start.slice(0, -3)} – ${end}`
      : `${start} – ${end}`;
  }
  return start || end || "—";
}

/**
 * An hour, typed — the control it replaces asked for taps and a wheel, and
 * on a phone that is a small ritual per activity. The desk writes the hour
 * the way it is said ("8", "8:30", "2:30 pm") and moves on: the field
 * settles what was typed when attention leaves it, shown back in the
 * meridiem form the sheet prints. An entry naming no hour is cleared, so
 * the activity simply runs without one.
 */
export function TimeField({
  value,
  onChange,
  label,
  placeholder = "8:00",
  className = "",
}: {
  /** The stored hour, ``HH:MM`` or blank. */
  value: string;
  onChange: (hour: string) => void;
  /** Names the field for a screen reader, e.g. "Start time of activity 2". */
  label: string;
  placeholder?: string;
  className?: string;
}) {
  // What the desk is typing — held only from the first keystroke until the
  // field is left, so a row shifted by a removal shows its own stored hour
  // rather than the draft the row above left behind: between edits the
  // field reads straight from the stored hour, spoken the way the sheet
  // prints it. On blur the draft is settled into that hour (or cleared,
  // when it names none) and released.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? (value ? clockTime(value) : "");
  return (
    <input
      type="text"
      value={text}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        // A field focused but never typed in has no draft to settle — it
        // must not clear a stored hour merely because it lost attention.
        if (draft === null) return;
        const hour = parseClockInput(draft);
        setDraft(null);
        if (hour !== value) onChange(hour);
      }}
      aria-label={label}
      placeholder={placeholder}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      className={className}
    />
  );
}

/** The facilitators, read as "Jane Wanjiru · Teacher" lines. */
function Facilitators({ people, className = "" }: { people: ProgramParticipant[]; className?: string }) {
  if (people.length === 0) return null;
  return (
    <ul className={`space-y-0.5 ${className}`}>
      {people.map((person, index) => (
        <li key={`${person.name}-${index}`} className="text-xs leading-5 text-moss">
          <span className="font-semibold text-moss-dark">{person.name}</span>
          {person.role && <span aria-hidden="true"> · </span>}
          {person.role && <span>{person.role}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ProgramDocument({
  title,
  date,
  department,
  lead,
  items,
  note,
  className = "",
}: {
  title: string;
  /** The event's day, yyyy-mm-dd — the sheet spells its weekday from it. */
  date?: string;
  /** The ministry that runs the event, named over the order of service. */
  department?: string;
  lead?: string;
  items: ProgramItem[];
  /** A line the desk wrote above the order — the theme, or an announcement. */
  note?: string;
  className?: string;
}) {
  const weekday = weekdayOf(date);
  const hasItems = items.length > 0;
  return (
    <article
      className={`mx-auto w-full max-w-xl rounded-2xl border border-sand-line bg-white px-6 py-8 text-center shadow-sm sm:px-10 sm:py-10 print:border-0 print:shadow-none ${className}`}
    >
      {/* The letterhead — the same mark the church prints on its paper. */}
      <div className="flex justify-center">
        <ChurchLockup />
      </div>
      <div className="mx-auto mt-5 h-px w-16 bg-ember" aria-hidden="true" />

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-ember">Programme</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-bark sm:text-3xl">{title}</h2>
      {department && <p className="mt-1.5 text-sm font-semibold text-moss-dark">{department}</p>}
      {(date || lead) && (
        <p className="mt-2 text-sm text-moss">
          {date && (
            <>
              {weekday && <span className="font-semibold text-bark">{weekday}</span>}
              {weekday && <span aria-hidden="true"> · </span>}
              {dayFirst(date)}
            </>
          )}
          {lead && (
            <>
              {date && <span aria-hidden="true"> · </span>}
              Led by {lead}
            </>
          )}
        </p>
      )}

      {note && <p className="mx-auto mt-6 max-w-md text-sm leading-6 text-moss">{note}</p>}

      {hasItems && (
        <>
          <h3 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.28em] text-moss">
            Order of Service
          </h3>
          <ul className="mx-auto mt-4 max-w-md divide-y divide-sand-line border-y border-sand-line text-left">
            {items.map((item, index) => {
              // The hours this row runs, printed beside its name only when
              // it carries any: a session no longer collects hours of its
              // own (the activities hold the time), so it prints as its
              // name alone rather than against a column of dashes.
              const range = sessionRange(item);
              return (
                <li key={`${item.start}-${item.title}-${index}`} className="py-3">
                  <div className="flex items-baseline gap-4">
                    {range !== "—" && (
                      <span className="w-32 shrink-0 text-right text-xs font-semibold text-ember">
                        {range}
                      </span>
                    )}
                    <span className="text-sm font-semibold leading-6 text-bark">
                      {item.title || "—"}
                    </span>
                  </div>
                  <Facilitators
                    people={item.participants}
                    className={range !== "—" ? "mt-1 pl-36" : "mt-1"}
                  />

                  {/* What happens inside the session, indented behind a rule —
                      the printed programme's own way of showing a part of the
                      day holding the activities that run through it. */}
                  {item.parts.length > 0 && (
                    <ul className="mt-2 ml-4 space-y-2 border-l-2 border-sand-line pl-4">
                      {item.parts.map((part, partIndex) => {
                        const partRange = sessionRange(part);
                        return (
                          <li key={`${part.start}-${part.title}-${partIndex}`}>
                            <div className="flex items-baseline gap-4">
                              {partRange !== "—" && (
                                <span className="w-24 shrink-0 text-right text-[11px] font-semibold text-ember">
                                  {partRange}
                                </span>
                              )}
                              <span className="text-xs leading-5 text-bark">{part.title || "—"}</span>
                            </div>
                            <Facilitators
                              people={part.participants}
                              className={partRange !== "—" ? "pl-28" : ""}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </article>
  );
}

export default ProgramDocument;
