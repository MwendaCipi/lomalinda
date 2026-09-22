const CACHE_NAME = "sda-loma-linda-meru-v7";
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
  "/share/services/",
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
