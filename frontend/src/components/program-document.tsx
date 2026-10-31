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
  /** Free text the row carries in place of — or beside — its name: a
      Bible verse, a song, anything the programme should say as it is
      typed. A session marked this way is a text block, not an hour. */
  text?: string;
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
 *
 * `around` is the hour the programme has already reached — the one typed
 * just before this field. A bare hour ("3", "12") names the clock's own
 * twelve and so is two places in the day, and a programme running through
 * the afternoon knows which one it means: whichever of the two sits nearer
 * the surrounding hour wins, so "3" after two o'clock becomes three in the
 * afternoon rather than three in the morning. Say a meridiem ("3 pm") or an
 * hour of the twenty-four ("15:00") and nothing is guessed. With nothing
 * around it, a bare hour stands as typed — the first half of the day, where
 * a programme begins.
 */
export function parseClockInput(value: unknown, around?: unknown): string {
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
  } else if (hour >= 1 && hour <= 12 && toClock(around)) {
    // Twelve hours twice over, read against what comes before: the nearer
    // of the two wins, and an even tie falls to the later one — at nine a
    // desk reaching for "3" means the afternoon's.
    const ref = toClock(around);
    const target = Number(ref.slice(0, 2)) * 60 + Number(ref.slice(3, 5));
    const twelve = hour % 12;
    const candidates = [twelve, twelve + 12];
    hour = candidates.reduce((best, candidate) => {
      const distance = Math.abs(candidate * 60 - target);
      const bestDistance = Math.abs(best * 60 - target);
      return distance < bestDistance || (distance === bestDistance && candidate > best) ? candidate : best;
    });
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
  const text = typeof entry.text === "string" ? String(entry.text) : undefined;
  if (!title && participants.length === 0 && !text?.trim()) return null;
  return {
    start: toClock(entry.start),
    end: toClock(entry.end),
    title,
    participants,
    ...(text !== undefined ? { text } : {}),
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

/** Does this session have anything to print — a name, an activity within it, or a block of free text? */
export function programItemHasContent(item: ProgramItem): boolean {
  return Boolean(item.title.trim()) || item.participants.length > 0 || item.parts.length > 0 || Boolean(item.text?.trim());
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
  around,
  placeholder = "8:00",
  className = "",
}: {
  /** The stored hour, ``HH:MM`` or blank. */
  value: string;
  onChange: (hour: string) => void;
  /** Names the field for a screen reader, e.g. "Start time of activity 2". */
  label: string;
  /** The hour just before this one, so a bare hour typed here lands in the
      right half of the day — the end of the row above, or of this row. */
  around?: string;
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
        const hour = parseClockInput(draft, around);
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

/**
 * The measure every row gives its hour: one width for the day, so a time
 * never grows into the name beside it and every name — and the
 * facilitators under it — begins at the same place. The indent is that
 * column plus the gap that follows it, which is exactly where the name
 * starts, so a facilitator hangs level with the name it carries.
 */
const TIME_COL = "w-32";
const TIME_INDENT = "pl-36";

/** The facilitators, read as "Jane Wanjiru – Teacher" lines — the dash the
 * printed sheet separates name and role with, so screen and paper agree.
 * Name and time speak in one weight; the role is the one thing in the row
 * allowed to say it more lightly. */
function Facilitators({ people, className = "" }: { people: ProgramParticipant[]; className?: string }) {
  if (people.length === 0) return null;
  return (
    <ul className={`space-y-0.5 ${className}`}>
      {people.map((person, index) => (
        <li key={`${person.name}-${index}`} className="text-xs font-semibold leading-5 text-moss">
          <span className="text-moss-dark">{person.name}</span>
          {person.role && (
            <span className="font-normal">
              <span aria-hidden="true"> – </span>
              {person.role}
            </span>
          )}
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
  idPrefix,
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
  /** Stamps each row with ``${idPrefix}-session-…`` / ``-part-…``, so the
      desk's editor can walk the reading column to the row just added. */
  idPrefix?: string;
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
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-bark sm:text-3xl">{title}</h2>
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
              const range = sessionRange(item);
              // A free-text block — a song, a Bible verse — prints the way
              // the desk wrote it: each typed line its own line. If it has
              // a title it appears like a session; otherwise it starts from
              // the left margin with no time-column indent.
              // A free-text block — a song, a Bible verse — prints the way
              // the desk wrote it, blank lines and all: every press of Enter
              // is read as spacing on the paper. Leading and trailing blank
              // lines are trimmed so the block doesn't open or close on air.
              const freeText = (item.text ?? "")
                .replace(/\r\n/g, "\n")
                .replace(/^\n+/, "")
                .replace(/\n+$/, "");
              const freeTextOnly =
                (item.text !== undefined) && !item.title && item.participants.length === 0 && item.parts.length === 0;
              const isFreeText = item.text !== undefined;
              return (
                <li
                  key={`${item.start}-${item.title}-${index}`}
                  id={idPrefix ? `${idPrefix}-session-${index}` : undefined}
                  className="py-3"
                >
                  {freeTextOnly ? (
                    <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-bark">
                      {freeText}
                    </p>
                  ) : isFreeText && item.title ? (
                    <>
                      <div className="flex items-baseline gap-4">
                        <span
                          className={`${TIME_COL} shrink-0 text-right text-sm font-semibold text-ember`}
                          aria-hidden={range === "—"}
                        >
                          {range !== "—" ? range : ""}
                        </span>
                        <span className="text-sm font-semibold leading-6 text-bark">
                          {item.title}
                        </span>
                      </div>
                      {freeText && (
                        <p className={`mt-1.5 whitespace-pre-wrap text-sm leading-6 text-bark ${TIME_INDENT}`}>
                          {freeText}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-4">
                        {/* The hour's own column, held open whether the row
                            carries one or not: the name — and the facilitators
                            under it — begin at the same place the whole sheet
                            down, the way the papers print them. */}
                        <span
                          className={`${TIME_COL} shrink-0 text-right text-sm font-semibold text-ember`}
                          aria-hidden={range === "—"}
                        >
                          {range !== "—" ? range : ""}
                        </span>
                        <span className="text-sm font-semibold leading-6 text-bark">
                          {item.title || "—"}
                        </span>
                      </div>
                      <Facilitators people={item.participants} className={`mt-1 ${TIME_INDENT}`} />

                      {/* What happens inside the session, indented behind a rule —
                          the printed programme's own way of showing a part of the
                          day holding the activities that run through it. */}
                      {item.parts.length > 0 && (
                        <ul className="mt-1.5 ml-2 space-y-2 border-l-2 border-sand-line pl-3">
                          {item.parts.map((part, partIndex) => {
                            const partRange = sessionRange(part);
                            return (
                              <li
                                key={`${part.start}-${part.title}-${partIndex}`}
                                id={idPrefix ? `${idPrefix}-part-${index}-${partIndex}` : undefined}
                              >
                                <div className="flex items-baseline gap-4">
                                  <span
                                    className={`${TIME_COL} shrink-0 text-right text-xs font-semibold text-ember`}
                                    aria-hidden={partRange === "—"}
                                  >
                                    {partRange !== "—" ? partRange : ""}
                                  </span>
                                  <span className="text-xs font-semibold leading-5 text-bark">{part.title || "—"}</span>
                                </div>
                                <Facilitators people={part.participants} className={TIME_INDENT} />
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {/* Typed lines beside a named row — the verses a session
                          carries under it — print beneath its people, the
                          spacing the desk pressed carried with them. */}
                      {freeText && !freeTextOnly && (
                        <p className={`mt-1.5 whitespace-pre-wrap text-xs leading-5 text-moss ${TIME_INDENT}`}>
                          {freeText}
                        </p>
                      )}
                    </>
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
