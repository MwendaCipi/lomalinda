/** Date-only strings from the API ("2026-10-01") must not shift a day when
 *  rendered — parse them as local dates, the way the rest of the app does. */
export function shortDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-KE", {
    month: "short",
    day: "numeric",
  });
}

/** "25 – 27 Sep" for a window, "25 Sep" for a single day, "" when undated. */
export function eventLabel(item: {
  event_date_from?: string | null;
  event_date_to?: string | null;
}): string {
  const from = item.event_date_from;
  const to = item.event_date_to;
  if (!from && !to) return "";
  if (from && to && from !== to) return `${shortDate(from)} – ${shortDate(to)}`;
  return shortDate(from || to);
}
