/**
 * Places, said in links rather than in numbers.
 *
 * Somebody who wants the church to come to their home knows how to find it in
 * Google Maps and how to share it — they rarely know their latitude. A shared
 * Maps link already carries the point, in one of four shapes, so this module
 * reads the point out of the link, and the reverse: a map link for a point the
 * church has stored. Neither direction ever prints a bare coordinate at
 * somebody who did not ask for one.
 */

/** A point as the API stores it: degrees, and nothing else. */
export type Coordinates = { latitude: number; longitude: number };

/** Latitude then longitude, as numbers, within the globe — or null. */
function point(rawLat: string, rawLng: string): Coordinates | null {
  const latitude = Number(rawLat);
  const longitude = Number(rawLng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

const NUM = String.raw`-?\d{1,3}(?:\.\d+)?`;

/**
 * The four places a shared Google Maps link keeps its point, most precise
 * first: the dropped pin (`!3d…!4d…`), the map's centre (`@lat,lng,`), a
 * query (`?q=`, `?query=`, `?ll=`, `?destination=`), and — for a link
 * somebody trimmed by hand — a plain "lat, lng" pair.
 *
 * The order matters: a place link carries both the exact pin and the
 * viewport's centre, and the pin is the one the person meant.
 */
const LINK_PATTERNS: RegExp[] = [
  new RegExp(`!3d(${NUM})!4d(${NUM})`),
  new RegExp(`@(${NUM}),(${NUM})`),
  new RegExp(`[?&](?:q|query|ll|center|destination|daddr|sll)=(${NUM})(?:,|%2C|%2c)(${NUM})`, "i"),
  new RegExp(`(${NUM}),(?:\\s*)(${NUM})`),
];

/**
 * The point a Google Maps link names, or null when it names none.
 *
 * A percent-encoded query (`?q=-0.0463%2C37.6562`) is decoded first, because
 * that is how a link copied from the Maps app arrives. Short links —
 * `maps.app.goo.gl/…` — carry their point behind a redirect and have none to
 * read; the caller resolves those differently (see the map picker).
 */
export function coordinatesFromMapLink(link: string): Coordinates | null {
  const text = (link || "").trim();
  if (!text) return null;
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // A stray "%" is not worth failing the whole link over.
  }
  for (const pattern of LINK_PATTERNS) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const found = point(match[1], match[2]);
    if (found) return found;
  }
  return null;
}

/** Whether a link is one of Google's short forms, whose point needs a redirect. */
export function isShortMapLink(link: string): boolean {
  return /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test((link || "").trim());
}

/**
 * The map link for a stored point, or null when the record carries no point.
 *
 * This is the only way a stored location is shown back: it opens the same
 * place the asker pinned, and says nothing in numbers.
 */
export function pinnedMapHref(
  latitude?: string | number | null,
  longitude?: string | number | null,
): string | null {
  const found = storage(latitude, longitude);
  if (!found) return null;
  return `https://www.google.com/maps/search/?api=1&query=${found.latitude},${found.longitude}`;
}

/** The API's decimal strings, read as the pair they are — or null. */
function storage(rawLat?: string | number | null, rawLng?: string | number | null): Coordinates | null {
  if (rawLat == null || rawLng == null) return null;
  const lat = String(rawLat).trim();
  const lng = String(rawLng).trim();
  if (lat === "" || lng === "") return null;
  return point(lat, lng);
}
