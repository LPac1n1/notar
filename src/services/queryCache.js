// Simple time-based in-memory cache for query results. Every write through
// `executePrepared` calls `invalidateCache()` (connection.js), so the cache
// only stays warm between mutations. That's still useful for the common
// pattern of "browse around / change filters without editing" where the
// same dropdown options keep being queried.

const _cache = new Map();

// Tracks in-flight promises so two concurrent calls for the same key
// share a single underlying load (request coalescing).
const _inFlight = new Map();

export function getCached(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    return undefined;
  }
  return entry.data;
}

export function setCached(key, data, ttlMs) {
  _cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache() {
  _cache.clear();
  // Don't touch _inFlight — those promises are about to resolve and the
  // results will land in a freshly-empty cache, which is fine.
}

/**
 * Wraps an async loader with the simple TTL cache. Returns a function with
 * the same signature; on cache hit the underlying loader is not called.
 *
 *   const cachedListDemands = withCache("demands", listDemands, 30_000);
 *
 * If the key needs to vary by argument, pass a function:
 *
 *   const cachedListDonors = withCache(
 *     (filters) => `donors:${JSON.stringify(filters)}`,
 *     listDonors,
 *     30_000,
 *   );
 */
export function withCache(keyOrFn, loader, ttlMs) {
  return async (...args) => {
    const key = typeof keyOrFn === "function" ? keyOrFn(...args) : keyOrFn;
    const hit = getCached(key);
    if (hit !== undefined) return hit;

    const pending = _inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const result = await loader(...args);
        setCached(key, result, ttlMs);
        return result;
      } finally {
        _inFlight.delete(key);
      }
    })();

    _inFlight.set(key, promise);
    return promise;
  };
}
