// Simple in-memory cache with TTL — no Redis dependency required.
// Falls over to a no-op if called before init.
const _store = new Map();

export function getCache(key) {
  const entry = _store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache(key, value, ttlSeconds = 300) {
  _store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  // Keep memory tidy — evict oldest entry when over limit
  if (_store.size > 500) {
    _store.delete(_store.keys().next().value);
  }
}
