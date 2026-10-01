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

/** The first day of the current month, yyyy-mm-dd. */
export function firstDayOfMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
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
 */
export function dayFirst(value?: Dateish, fallback = "—"): string {
  const parsed = parseDateish(value);
  if (!parsed) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: parsed.dateOnly ? undefined : CHURCH_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed.date);
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
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CHURCH_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed.date);
}
