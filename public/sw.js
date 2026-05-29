/**
 * Notar service worker. Goals:
 *
 *   - Make `/` and the static JS/CSS bundle work after a tab reload even
 *     when the user is offline. The app itself is local-first via OPFS,
 *     so giving them the shell back is enough to keep working.
 *   - Stay-out-of-the-way for everything else: DuckDB WASM, Supabase
 *     network calls, fonts from Google, etc. all go straight to the
 *     network. They either don't matter offline (cloud sync defers) or
 *     are too large/dynamic to risk caching.
 *
 * Strategy in one line: cache-first for built assets and the shell HTML,
 * network-only for everything else. The CACHE_NAME version bump on every
 * release evicts stale entries.
 */

const CACHE_NAME = "notar-shell-v1";

// Vite emits hashed file names under /assets/. They are immutable per
// release — cache-first is safe.
const SHELL_PATHS_PREFIX = ["/assets/"];

// Network-only allow-list: paths we should never serve from cache because
// they are either dynamic (Supabase) or too large to keep around (DuckDB
// WASM binary, the worker, font CSS sheets).
const NETWORK_ONLY_HOSTS = [
  "supabase.co",
  "supabase.in",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

self.addEventListener("install", (event) => {
  // Skip waiting so the new SW takes over immediately on the next page
  // load. Without this users would keep running the previous version
  // until they close every tab.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["/"]).catch(() => null),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Drop any old shell caches from previous versions of the SW.
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
      // Claim open clients so the new SW handles their fetches.
      self.clients.claim(),
    ]),
  );
});

function isShellAsset(url) {
  return SHELL_PATHS_PREFIX.some((prefix) => url.pathname.startsWith(prefix));
}

function isAppShellHtml(request) {
  return (
    request.method === "GET" &&
    request.headers.get("accept")?.includes("text/html")
  );
}

function isNetworkOnly(url) {
  return NETWORK_ONLY_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) {
    if (isNetworkOnly(url)) return; // straight to network
    return; // anything else cross-origin: also network
  }

  // App shell HTML — network-first so users see updates, with cache
  // fallback for offline. Caches both the navigation target and `/`
  // (the SPA root) for the second visit.
  if (isAppShellHtml(request)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/", response.clone()).catch(() => null);
          return response;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match("/");
          if (cached) return cached;
          throw new Error("Offline e sem shell em cache.");
        }
      })(),
    );
    return;
  }

  // Built assets — cache-first, populate on miss. Hashed filenames make
  // this safe (the URL changes whenever the content changes).
  if (isShellAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          if (cached) return cached;
          throw new Error("Asset indisponível offline.");
        }
      })(),
    );
  }
});
