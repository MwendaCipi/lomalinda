/* The cache name is the app's asset generation, not just a label.

   The page copies below are whole documents, and a document carries the app's
   shell — the rail, the identity bar, the phone's tab bar, the sign-in gate.
   A member whose app was installed under an older generation keeps painting
   that older shell for the routes we hold copies of (everything except
   `/dashboard/`, which was never listed here) until this name moves: their own
   build looks current on the dashboard and stale everywhere else. So bump the
   version whenever the chrome changes, not only when an icon does.

   v11 — the phone's tab bar carries its section's pages and the leaders' door
   holds the leadership rows, and the dashboard reads the congregation's pulse
   instead of a grid of tiles: chrome, so every installed app must take the new
   shell rather than keep painting the old one from its cache.

   v12 — every tab navigates now: a section's pages are the chip strip on the
   page itself at every width, the phone's menu sheet is the leaders' door
   only, and the Materials shelves carry the children's divisions directly.

   v13 — the door is gone: the Admin tab is ordinary navigation to the
   console, whose overview cards carry the desks. No menu sheet remains.

   v14 — prayer and visitation are separate desks under Requests; the
   combined page is a redirect.

   v15 — no Home tab on the phone (the topbar's mark is the way home), the
   join button sits right in the announcement rail, and Moments is a real
   gallery page in Fellowship.

   v16 — the announcements feed is compact by default with no density
   toggle, and its photo previews shrink so a card's actions stay on screen.

   v17 — the rail grows two headings (Ministries, Departments) with each area
   as its own row, the Leadership desk returns shared by elders and clerks,
   and the two desks are decoupled. Chrome changed, so installed apps must
   take the new shell.

   v18 — the leadership desk is rebuilt: the directory reads Leader / First
   Assistant / Second Assistant in fixed columns, rows keep one Edit
   Leadership button (no actions popover, checkboxes or Communicate), and the
   leadership modal appoints by seat — search under Leader or under Assistant
   — while custom roles move to a Create role form. Chrome changed, so
   installed apps must take the new shell.

   v19 — the leadership modal appoints by position: one Leader (search bar
   beneath with a Set leader button) and up to two Assistants (their own
   search bar with a Set assistant button), elders keep their three named
   offices, and areas carry only Leader and Assistant roles. Chrome changed,
   so installed apps must take the new shell.

   v20 — the rail files the church's areas under one heading: Ministries and
   Departments rows join as one Ministry list beside the desks' Leadership.
   Chrome changed, so installed apps must take the new shell.

   v21 — the rail's first two headings merge: Dashboard rows join the My
   church list, leaving Leadership and Ministry as the other headings.
   Chrome changed, so installed apps must take the new shell.

   v22 — announcement photos in the feed are a step taller again (md), a
   little over fifty pixels more than the compact height. Chrome changed,
   so installed apps must take the new shell.

   v23 — the Elders' Desk submenu carries Board and Business Meetings as two
   rows (no Meetings middleman), and User Management's header reads one
   record row: tabs left, search right. Chrome changed, so installed apps
   must take the new shell.

   v24 — the rail's headings settle: the desks and the ministries read as
   one Service list, with the departments a Departments list of their own.
   Chrome changed, so installed apps must take the new shell.

   v25 — announcement photos take another thirty pixels (md now 238px).

   v26 — the Fund Drives row in Giving opens the active drive directly, no
   listing page in between (the list remains for when no drive is active),
   and the drive's report reads as two columns on a PC: story beside
   progress, breakdown beside ministry giving.

   v27 — Giving's strip carries Live Balances and Reports as two pages
   again: the toggle that switched between them on one page is gone, and
   each opens on its own route.

   v28 — Moments keeps church events as albums: an event's own page holds
   every picture and video of the day, with a composer for the office and
   videos that play on the wall.

   v29 — the Treasury strip reads Ledger, Accounts, Expenditure, Drives,
   Budget, M-Pesa Refunds: a Budget desk of its own joins the row, where
   the treasurer posts the year's plan and publishes it.

   v30 — Elders' Desk and Clerk's Desk merge into one Eldership row: the
   two offices saw the same items, and the rail carries the register, the
   transfers, the settings, the meetings, the announcements and the
   requests under one heading.

   v31 — the rail's ministry and department rows read their short forms
   (AMM, AWM, APM, Personal…), so no row ever ellipsises.

   v32 — Moments leaves the Fellowship strip: the wall is the
   administrators' gallery now, reached from its own page, and posting is
   theirs alone.

   v33 — the Fellowship strip reads Announcements, Calendar, Moments,
   Testimonies, Ideas, Ideas & Suggestions shortens to Ideas, and every
   top-bar button drops its icon: names only.

   v34 — Leadership rides the Eldership strip as its second page, and the
   choir hangs with the music desk on one Music row: two fewer rows on
   the rail. Chrome changed, so installed apps must take the new shell.

   v35 — the Personal Ministries rail row takes its own initials, PM,
   matching its AMM, AWM, AYM and APM neighbours.

   v36 — dates read day-first everywhere, dd/mm/yyyy, through one shared
   helper: the ledger's from-date opens on the 1st of the month (it used to
   open on the first Sabbath, which hid the month's first receipts), and
   en-KE makes the native date pickers agree.

   v37 — a signed-in member requests a transfer from a modal that knows who
   they are: no name, email or phone to type, and nothing to verify by
   email — the session is the verification. Church settings loses its
   Administration badge.

   v38 — the rail reads Dashboard under a Dashboard heading of its own
   again, before My church. Chrome changed, so installed apps must take the
   new shell. */
const CACHE_NAME = "sda-loma-linda-meru-v38";
const STATIC_ASSETS = [
  "/",
  "/about/",
  "/beliefs/",
  "/calendar/",
  "/announcements/",
  "/give/",
  "/login/",
  "/requests/",
  "/share/",
  "/share/sabbath-school/",
  "/share/moments/",
  "/spiritual/",
  "/support/",
  "/manifest.json",
  "/manifest.webmanifest",
  "/adventist-logo.svg",
  "/adventist-logo-white.svg",
  "/icons/meru/app-icon-192.png",
  "/icons/meru/app-icon-512.png",
  "/icons/meru/app-icon-512-maskable.png",
  "/icons/meru/apple-touch-icon.png",
];

async function cacheStaticAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(STATIC_ASSETS.map(async (asset) => {
    try {
      const response = await fetch(asset, { cache: "no-cache" });
      if (response.ok) await cache.put(asset, response);
    } catch {
      // One unavailable asset must not prevent the service worker from installing.
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheStaticAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cachedPage(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const url = new URL(request.url);
  const normalizedPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return (await caches.match(normalizedPath, { ignoreSearch: true })) || (await caches.match("/"));
}

function remember(request, response) {
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

/* Hashed build assets are immutable: their URL only ever maps to one file, so
   the cache copy is always valid. Crucially, when the network answers 404
   (a purged chunk from an older build that a stale page shell still asks
   for) we serve the cached copy instead of passing the 404 through — that
   404 used to blank the page. */
async function cacheFirstImmutable(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) return remember(request, response);
    const fallback = await caches.match(request, { ignoreSearch: true });
    return fallback || response;
  } catch (error) {
    const fallback = await caches.match(request, { ignoreSearch: true });
    return fallback || Response.error();
  }
}

/* Pages: always prefer the network so members see fresh content. Only a dead
   server (5xx) or no network falls back to the last cached shell — a real
   404 for a genuinely missing page still passes through. */
async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) return remember(request, response);
    if (response.status >= 500) {
      const fallback = await cachedPage(request);
      return fallback || response;
    }
    return response;
  } catch (error) {
    const fallback = await cachedPage(request);
    return fallback || Response.error();
  }
}

/* Everything else (API calls, dynamic GETs): network first, cache successful
   responses for offline use. HTTP error responses (401, 403, 404 …) are
   returned untouched — never mask them with stale cache, or a logged-out
   member would see old data instead of being asked to sign in again. */
async function networkOnlyFallbackOffline(request) {
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      return remember(request, response);
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || Response.error();
  }
}

/* ── Web Push ────────────────────────────────────────────────────────────
   The server encrypts a small JSON payload ({title, body, link}) to each
   device; the browser wakes this worker even with the app closed and the
   OS shows the notification. Clicking it deep-links into the app. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "SDA Loma Linda";
  const options = {
    body: payload.body || "",
    icon: "/icons/meru/app-icon-192.png",
    badge: "/icons/meru/app-icon-192.png",
    tag: payload.link || undefined, // one notice per destination, no stacking
    data: { link: payload.link || "/administration?tab=requests" },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an existing window of this app if one is open.
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "push-navigate", link: target });
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // third-party: untouched

  const isImmutable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    /\.(svg|png|jpg|jpeg|webp|woff2?)$/.test(url.pathname);

  if (isImmutable) {
    event.respondWith(cacheFirstImmutable(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstPage(event.request));
    return;
  }

  event.respondWith(networkOnlyFallbackOffline(event.request));
});
