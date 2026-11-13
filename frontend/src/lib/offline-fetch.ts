/**
 * Offline-aware fetch helper.
 *
 * The service worker tags responses that came from the offline API cache with
 * two headers:
 *   X-SW-Cache: stale          — the response body is from the local cache
 *   X-SW-Cached-At: <ISO>      — when the live copy was last stored
 *
 * Components use `offlineFetch` in place of `fetch` and inspect the returned
 * `isOffline` / `cachedAt` fields to show a contextual offline chip rather
 * than an error screen.
 */

/**
 * Raised when a page's data could not be read at all — the one case the app's
 * offline notice answers (see `ConnectivityToast`).
 */
export const PAGE_LOAD_FAILED_EVENT = "app:page-load-failed";

/** Tells the shell a page failed to load because the network is gone. */
function reportPageLoadFailure() {
  if (typeof window === "undefined") return;
  // A server that answered badly is not an offline notice: only a request that
  // never left the device is.
  if (navigator.onLine) return;
  window.dispatchEvent(new Event(PAGE_LOAD_FAILED_EVENT));
}

export type OfflineFetchResult<T> = {
  data: T | null;
  ok: boolean;
  status: number;
  isOffline: boolean;    // true when the data came from the SW cache
  cachedAt: Date | null; // when the live copy was last stored (null if unknown)
  error: string | null;
};

export async function offlineFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<OfflineFetchResult<T>> {
  try {
    const res = await fetch(url, init);
    const isOffline = res.headers.get("X-SW-Cache") === "stale";
    const cachedAtRaw = res.headers.get("X-SW-Cached-At");
    const cachedAt = cachedAtRaw ? new Date(cachedAtRaw) : null;

    if (res.ok) {
      const data: T = await res.json();
      return { data, ok: true, status: res.status, isOffline, cachedAt, error: null };
    }

    return { data: null, ok: false, status: res.status, isOffline, cachedAt, error: null };
  } catch {
    /* Network error with no SW fallback available (never opened this URL
       while online). Treat as offline with no cached data — and, because a
       page that could not load at all is exactly what the offline notice is
       for, say so. Nothing else in the app raises that notice: a failed save
       or sign-in is the page's own business, not a banner over it. */
    reportPageLoadFailure();
    return { data: null, ok: false, status: 0, isOffline: true, cachedAt: null, error: "offline" };
  }
}

/**
 * Format a cached-at timestamp as a human-readable "last synced" string:
 *   "just now" / "2 min ago" / "1 hr ago" / "3 days ago"
 */
export function formatCachedAt(date: Date | null): string {
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
}
