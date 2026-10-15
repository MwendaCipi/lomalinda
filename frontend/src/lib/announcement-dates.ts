import { countdownTo } from "@/lib/gathering";
import { dayFirst } from "@/lib/dates";

/** Date-only strings from the API ("2026-10-01") must not shift a day when
 *  rendered — parse them as local dates, the way the rest of the app does. */
export function shortDate(iso?: string | null): string {
  return dayFirst(iso, "");
}

/**
 * The event's clock, when one was told: "09:00–11:00".
 *
 * The API hands times back as HH:MM:SS, and the church reads hours to the
 * minute, so the seconds are dropped. A post may name only a start (a service
 * whose end nobody wrote down) or only an end, and each reads as its own
 * phrase rather than as half a window.
 */
function eventClock(item: {
  event_time_from?: string | null;
  event_time_to?: string | null;
}): string {
  const clock = (value?: string | null) => (value ? value.slice(0, 5) : "");
  const from = clock(item.event_time_from);
  const to = clock(item.event_time_to);
  if (from && to) return `${from}–${to}`;
  if (from) return `from ${from}`;
  if (to) return `until ${to}`;
  return "";
}

/**
 * "25 – 27 Sep, 09:00–11:00" for a windowed event, "25 Sep, from 09:00" for a
 * single day that names an hour, "25 Sep" when the day alone says it, and ""
 * when undated.
 */
export function eventLabel(item: {
  event_date_from?: string | null;
  event_date_to?: string | null;
  event_time_from?: string | null;
  event_time_to?: string | null;
}): string {
  const from = item.event_date_from;
  const to = item.event_date_to;
  const clock = eventClock(item);
  const days = !from && !to
    ? ""
    : from && to && from !== to
      ? `${shortDate(from)} – ${shortDate(to)}`
      : shortDate(from || to);
  if (!days) return clock;
  return clock ? `${days}, ${clock}` : days;
}

/**
 * The instant the announcement's event begins, or null when it names no day.
 *
 * A date-only string is built in the reader's own calendar ("2026-10-21" is
 * the 21st wherever they are), and the hour it named is laid on top; a post
 * that named no hour begins at midnight of its day, which is the most a
 * day-only event can promise.
 */
export function eventStart(item: {
  event_date_from?: string | null;
  event_time_from?: string | null;
}): Date | null {
  const [year, month, day] = (item.event_date_from || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const [hour, minute] = (item.event_time_from || "").split(":").map(Number);
  return new Date(
    year,
    month - 1,
    day,
    Number.isFinite(hour) ? hour : 0,
    Number.isFinite(minute) ? minute : 0,
    0,
    0,
  );
}

/**
 * How long until the event this post is about.
 *
 * The countdown belongs to the post's own event, and to nothing else: the
 * week's next meeting is not this post's clock, and reading it as one had a
 * notice about the 21st counted down to the coming Wednesday.
 *
 * A post that named an hour is counted to the minute, exactly like the week's
 * gathering. A day-only post is counted in whole days — "today", "tomorrow",
 * "in 6 days" — because the day is all it promised, and midnight is not a
 * time anybody was told to arrive. A plain notice with no event day, and an
 * event already past, both count down to nothing.
 */
export function announcementCountdown(
  item: {
    event_date_from?: string | null;
    event_time_from?: string | null;
  },
  now: Date,
): string | null {
  const start = eventStart(item);
  if (!start) return null;
  if (item.event_time_from) return countdownTo(start, now);

  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((midnight(start).getTime() - midnight(now).getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
