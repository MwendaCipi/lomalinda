"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Header data, cached across route changes.
 *
 * The chrome used to re-fetch the profile, announcements and personal
 * notifications on every pathname change — four requests per navigation,
 * with the rail's name and badges flashing empty while they ran. This hook
 * keeps that data in a module-level cache that survives remounts and route
 * changes, so the chrome paints from cache instantly and only revalidates in
 * the background when its copy has gone stale:
 *
 * - the profile (+ announcement channel prefs, folded into the same /me/
 *   call the chrome used to make twice) after 5 minutes,
 * - the announcement and notification feeds after 60 seconds,
 * - on window focus when either has expired,
 * - immediately whenever the signed-in token changes (sign-in, sign-out,
 *   another account on a shared device).
 *
 * In-flight requests are shared, so a burst of mounts costs one request each,
 * not one per mount. Mutators (patchCachedMe, markCachedNotificationsRead)
 * write through to the cache and notify mounted consumers at once — the
 * optimistic updates the popover does never wait for the TTL.
 */

export type AnnouncementItem = {
  id: number;
  title: string;
  text?: string;
  detail?: string;
  created_at?: string;
};

/** A server-pushed notification (e.g. a join request waiting for the office). */
export type ChurchNotificationItem = {
  id: number;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: string;
};

/** The header's view of /api/members/me/ — identity and channel prefs. */
export type HeaderMe = {
  role: string;
  roles: string[];
  username: string;
  name: string;
  email: string;
  /** As stored — the giving form derives an M-Pesa number from it. */
  phone_number: string;
  announce_email: boolean;
  announce_push: boolean;
  /** The office flags the desk endpoints also accept — a treasurer alone is
   * not enough to know whether a page's write controls should appear. */
  is_staff: boolean;
  is_superuser: boolean;
};

const ME_TTL = 5 * 60 * 1000;
const FEED_TTL = 60 * 1000;

type CacheEntry<T> = { data: T; at: number };

let meCache: CacheEntry<HeaderMe | null> | null = null;
let announcementsCache: CacheEntry<AnnouncementItem[]> | null = null;
let notificationsCache: CacheEntry<ChurchNotificationItem[]> | null = null;
let meInflight: Promise<MeResult> | null = null;
let announcementsInflight: Promise<AnnouncementItem[] | undefined> | null = null;
let notificationsInflight: Promise<ChurchNotificationItem[] | undefined> | null = null;
/** The token the caches were filled under; a different token means a different member. */
let cachedToken: string | null = null;

const cacheListeners = new Set<() => void>();
function notifyCacheListeners() {
  cacheListeners.forEach((listener) => listener());
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

/**
 * What a `/me` call came back as.
 *
 * The three cases must not be flattened into one, which is what the header
 * used to do: an identity, a token the server refused (the session really is
 * over), and a call that never landed or fell over (offline, a 5xx while the
 * server restarts). Treating the last as the second painted the app as signed
 * out at the worst possible moment and sent pages that watch `hasToken` to
 * /login — the reload loop, from the other end.
 */
type MeResult =
  | { kind: "ok"; me: HeaderMe }
  | { kind: "unauthorized" }
  | { kind: "error" };

async function fetchMe(token: string): Promise<MeResult> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/members/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Never reached the server: offline, or the link dropped mid-flight.
    return { kind: "error" };
  }
  if (res.status === 401 || res.status === 403) return { kind: "unauthorized" };
  if (!res.ok) return { kind: "error" };
  const data = await res.json().catch(() => null);
  if (!data) return { kind: "error" };
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ");
  return {
    kind: "ok",
    me: {
      role: data.role || "member",
      roles: Array.isArray(data.roles) && data.roles.length > 0 ? data.roles : [data.role || "member"],
      username: data.username || "Member",
      name: fullName || data.username || "Member",
      email: data.email || "",
      phone_number: data.phone_number || "",
      announce_email: !!data.announce_email,
      announce_push: !!data.announce_push,
      is_staff: !!data.is_staff,
      is_superuser: !!data.is_superuser,
    },
  };
}

async function fetchAnnouncements(token: string | null): Promise<AnnouncementItem[] | undefined> {
  try {
    const res = await fetch(`${API_URL}/api/members/announcements/`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return undefined;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as AnnouncementItem[]).slice(0, 5) : undefined;
  } catch {
    return undefined;
  }
}

async function fetchNotifications(token: string): Promise<ChurchNotificationItem[] | undefined> {
  try {
    const res = await fetch(`${API_URL}/api/members/notifications/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return undefined;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as ChurchNotificationItem[]).slice(0, 8) : undefined;
  } catch {
    return undefined;
  }
}

function isStale(cache: CacheEntry<unknown> | null, ttl: number, tokenChanged: boolean): boolean {
  if (!cache || tokenChanged) return true;
  return Date.now() - cache.at > ttl;
}

/**
 * Drop every cached value. Called when the signed-in member changes and by
 * sign-out, so a shared device never shows the previous member's header.
 */
export function resetHeaderSession() {
  meCache = null;
  announcementsCache = null;
  notificationsCache = null;
  meInflight = null;
  announcementsInflight = null;
  notificationsInflight = null;
  cachedToken = null;
  notifyCacheListeners();
}

/** Optimistically patch the cached profile (e.g. announcement channel prefs). */
export function patchCachedMe(patch: Partial<HeaderMe>) {
  if (!meCache?.data) return;
  meCache = { data: { ...meCache.data, ...patch }, at: Date.now() };
  notifyCacheListeners();
}

/** Optimistically flip server notifications to read (popover opened). */
export function markCachedNotificationsRead(ids: number[]) {
  if (!notificationsCache || ids.length === 0) return;
  notificationsCache = {
    data: notificationsCache.data.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
    at: Date.now(),
  };
  notifyCacheListeners();
}

// useLayoutEffect applies cached data before the first paint — the SSR'd HTML
// shows the signed-out header, and without this a signed-in member would see
// it flash on a full page load. (On the server the layout effect is a no-op,
// so swap it for useEffect there to keep React quiet.)
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useHeaderData() {
  // Navigating re-runs the revalidation effect below, where the TTL guards
  // decide whether anything actually fetches — rapid navigation within the
  // TTL stays cache-only.
  const pathname = usePathname();

  const [me, setMe] = useState<HeaderMe | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [notifications, setNotifications] = useState<ChurchNotificationItem[]>([]);
  /** A token exists for this browser (or the last check said so). The header
   * paints its signed-in chrome from this alone — identity fields arrive with
   * `me` — so the brand link points at the dashboard before /me/ returns. */
  const [hasToken, setHasToken] = useState(false);

  // Paint whatever the cache already holds — before the browser paints — and
  // keep applying cache writes while mounted.
  useIsomorphicLayoutEffect(() => {
    const applyFromCache = () => {
      const token = getToken();
      const mine = token !== null && token === cachedToken;
      setHasToken(token !== null);
      setMe(mine && meCache ? meCache.data : null);
      setAnnouncements(announcementsCache ? announcementsCache.data : []);
      setNotifications(mine && notificationsCache ? notificationsCache.data : []);
    };
    applyFromCache();
    cacheListeners.add(applyFromCache);
    return () => {
      cacheListeners.delete(applyFromCache);
    };
  }, []);

  // Revalidate: instant when the caches are fresh, background fetch when they
  // have expired. Keyed on pathname so navigating after the TTL has elapsed
  // freshens the feeds, but rapid navigation within the TTL stays cache-only —
  // the four-per-navigation storm this replaces.
  useEffect(() => {
    let cancelled = false;

    const revalidate = async () => {
      const token = getToken();
      const tokenChanged = token !== cachedToken;

      if (!token) {
        // Signed out: the announcement feed is public and still worth having.
        if (isStale(announcementsCache, FEED_TTL, tokenChanged)) {
          if (!announcementsInflight) {
            announcementsInflight = fetchAnnouncements(null).finally(() => {
              announcementsInflight = null;
            });
          }
          const data = await announcementsInflight;
          if (!cancelled && data !== undefined) {
            announcementsCache = { data, at: Date.now() };
            setAnnouncements(data);
          }
        }
        cachedToken = token;
        return;
      }

      const expired = (cache: CacheEntry<unknown> | null, ttl: number) =>
        isStale(cache, ttl, tokenChanged);

      if (expired(meCache, ME_TTL)) {
        if (!meInflight) {
          meInflight = fetchMe(token).finally(() => {
            meInflight = null;
          });
        }
        const result = await meInflight;
        if (!cancelled) {
          if (result.kind === "ok") {
            meCache = { data: result.me, at: Date.now() };
            setMe(result.me);
            setHasToken(true);
          } else if (result.kind === "unauthorized") {
            // The token really is dead (expired or revoked): stop painting
            // signed-in chrome, as the header always did.
            meCache = { data: null, at: Date.now() };
            setMe(null);
            setHasToken(false);
          }
          // "error": keep the last good identity and the session. A server
          // that fell over, or a link that dropped, is not a sign-out — and a
          // 500 flustered into one is what made the app look broken.
        }
      }

      if (expired(announcementsCache, FEED_TTL)) {
        if (!announcementsInflight) {
          announcementsInflight = fetchAnnouncements(token).finally(() => {
            announcementsInflight = null;
          });
        }
        const data = await announcementsInflight;
        if (!cancelled && data !== undefined) {
          announcementsCache = { data, at: Date.now() };
          setAnnouncements(data);
        }
      }

      if (expired(notificationsCache, FEED_TTL)) {
        if (!notificationsInflight) {
          notificationsInflight = fetchNotifications(token).finally(() => {
            notificationsInflight = null;
          });
        }
        const data = await notificationsInflight;
        if (!cancelled && data !== undefined) {
          notificationsCache = { data, at: Date.now() };
          setNotifications(data);
        }
      }

      cachedToken = token;
    };

    void revalidate();

    // Coming back to the tab is the one moment the header's badges may have
    // fallen behind without any navigation to trigger a check.
    const onFocus = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  return { me, hasToken, announcements, notifications };
}
