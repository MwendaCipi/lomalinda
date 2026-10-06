/**
 * Dates read day first — dd/mm/yyyy — the way the church writes them.
 *
 * Every display site goes through here, so no page keeps its own private
 * formatter that drifts into month-first mush. Wire format (what the API
 * carries and what `<input type="date">` accepts) stays ISO yyyy-mm-dd;
 * only what a person reads is day-first.
 */

/** The church's timezone, so "today" is today in Meru, not on the server. */
const CHURCH_TZ = "Africa/Nairobi";

/** Today (or the given instant) as yyyy-mm-dd — the value date inputs want. */
export function localDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TZ }).format(now);
}

/**
 * The first day of the current month, yyyy-mm-dd.
 *
 * Derived from `localDate` rather than the browser's own clock, so "this
 * month" is the church's month: on the 1st in Meru the ledger must open on
 * that day, not on the last day of the previous one for a browser sitting in
 * a timezone behind.
 */
export function firstDayOfMonth(now: Date = new Date()): string {
  return `${localDate(now).slice(0, 8)}01`;
}

/** Anything a date can arrive as: an API string or a Date the page built. */
type Dateish = string | Date | null | undefined;

function parseDateish(value: Dateish): { date: Date; dateOnly: boolean } | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    // Built in the browser's own day: no offset can walk it a day, anywhere.
    return {
      date: new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
      dateOnly: true,
    };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

/**
 * A day as dd/mm/yyyy. Reads the shapes the API and the pages send: a
 * date-only string ("2026-10-03", parsed by hand so no timezone can walk it
 * a day), a full timestamp ("2026-10-03T14:05:00Z", rendered in the church's
 * timezone), or an already-built Date. Undated or unparseable is the fallback.
 *
 * Uses `formatToParts` so the output is strictly day-first: a 2-digit day,
 * a 2-digit month, and a 4-digit year, joined by slashes. This avoids
 * relying on the `en-GB` locale, which some browsers and OSes ignore and
 * fall back to a month-first order.
 */
export function dayFirst(value?: Dateish, fallback = "—"): string {
  const parsed = parseDateish(value);
  if (!parsed) return fallback;
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone: parsed.dateOnly ? undefined : CHURCH_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(parsed.date);
  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${find("day")}/${find("month")}/${find("year")}`;
}

/** The day's name — Monday … Sunday — without dragging in a date library. */
export function weekdayOf(value: Dateish): string {
  const parsed = parseDateish(value);
  if (!parsed) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: parsed.dateOnly ? undefined : CHURCH_TZ,
  }).format(parsed.date);
}

/** An instant as dd/mm/yyyy, HH:MM — for ledgers and logs that carry hours. */
export function dayFirstTime(value?: Dateish, fallback = "—"): string {
  const parsed = parseDateish(value);
  if (!parsed) return fallback;
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone: CHURCH_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(parsed.date);
  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${find("day")}/${find("month")}/${find("year")} ${find("hour")}:${find("minute")}`;
}
