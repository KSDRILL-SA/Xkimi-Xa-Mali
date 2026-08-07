// In-process TTL cache for role version lookups.
//
// Why this exists: the middleware calls Redis on every authenticated request to
// check whether the user's role has changed since the JWT was issued. In
// production that round-trip is fast (~5 ms Upstash near-edge), but it adds up
// across every navigation and every API call in a session.
//
// This module-level Map lives in the Edge Runtime V8 isolate scope, so it
// persists across requests handled by the same warm instance. A cache hit costs
// a Map lookup instead of a network call.
//
// The 60-second TTL is the whole revocation lag: it bounds how long a warm
// isolate can keep serving a session whose roles changed a moment ago. It is
// deliberately short, and it is now the ONLY such window — the stored key it
// caches no longer expires at all. (It previously carried a 300-second TTL,
// which was worse than a lag: once the key vanished, the middleware read the
// absence as version 0 and the revocation lapsed entirely.)

const CACHE_TTL_MS = 60_000

type Entry = { version: number; expiresAt: number }

const cache = new Map<string, Entry>()

export function getCachedRoleVersion(userId: string): number | null {
  const entry = cache.get(userId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId)
    return null
  }
  return entry.version
}

export function setCachedRoleVersion(userId: string, version: number): void {
  cache.set(userId, { version, expiresAt: Date.now() + CACHE_TTL_MS })
}
