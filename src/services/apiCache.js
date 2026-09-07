import { debug } from '../logger.js';

const STORE_KEY = 'apiCache';

const MAX_ENTRY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let store = null;
let entries = {};
const inFlight = new Map();

let hits = 0;
let misses = 0;
let dedups = 0;

export function initApiCache(electronStore) {
  store = electronStore;
  entries = store.get(STORE_KEY) || {};
  const now = Date.now();
  let pruned = 0;
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry?.ts || now - entry.ts > MAX_ENTRY_AGE_MS) {
      delete entries[key];
      pruned += 1;
    }
  }
  if (pruned > 0) {
    store.set(STORE_KEY, entries);
    debug(`[apiCache] ${pruned} entrée(s) périmée(s) purgée(s) au démarrage`);
  }
}

let persistTimer = null;
function persist() {
  if (persistTimer || !store) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    store.set(STORE_KEY, entries);
  }, 1000);
  persistTimer.unref?.();
}

export function ageOf(key) {
  const entry = entries[key];
  return entry?.ts ? Date.now() - entry.ts : Infinity;
}

export function peek(key, ttlMs) {
  const entry = entries[key];
  if (!entry?.ts) return undefined;
  if (ttlMs != null && Date.now() - entry.ts > ttlMs) return undefined;
  return entry.value;
}

export function write(key, value) {
  entries[key] = { value, ts: Date.now() };
  persist();
  return value;
}

export function forget(key) {
  inFlight.delete(key);
  if (key in entries) {
    delete entries[key];
    persist();
  }
}

export async function remember(key, ttlMs, producer) {
  const cached = peek(key, ttlMs);
  if (cached !== undefined) {
    hits += 1;
    return cached;
  }
  const pending = inFlight.get(key);
  if (pending) {
    dedups += 1;
    return pending;
  }

  misses += 1;
  const isCurrent = () => inFlight.get(key) === promise;
  const promise = (async () => producer())()
    .then((value) => (isCurrent() ? write(key, value) : value))
    .finally(() => {
      if (isCurrent()) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

export function cacheStats() {
  return { hits, misses, dedups, saved: hits + dedups };
}
