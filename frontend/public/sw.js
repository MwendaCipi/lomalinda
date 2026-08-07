const CACHE_NAME = "sda-loma-linda-meru-v3";
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
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-512x512-maskable.png",
  "/icons/apple-touch-icon.png",
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

async function cachedResponse(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const url = new URL(request.url);
  const normalizedPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return (await caches.match(normalizedPath)) || (await caches.match("/"));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => cachedResponse(event.request))
  );
});
