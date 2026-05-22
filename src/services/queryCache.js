const _cache = new Map();

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
}
