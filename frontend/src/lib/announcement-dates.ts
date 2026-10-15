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
