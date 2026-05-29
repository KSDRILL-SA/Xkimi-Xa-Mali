import { redis } from './redis'

// Thin Redis-backed cache with TTL. Values are serialized by the Upstash client.
// Use named keys from CACHE_KEYS below to avoid magic strings across services.

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    return redis.get<T>(key)
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redis.set(key, value, { ex: ttlSeconds })
  },

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await redis.del(...(keys as [string, ...string[]]))
  },
}

// Centralised key registry — prevents typo-based cache misses across services.
export const CACHE_KEYS = {
  // Admin dashboard stats — refreshed every 5 minutes.
  DASHBOARD_STATS: 'xxm:cache:stats',
  DASHBOARD_STATS_TTL: 300,

  // Goals list per filter set — TTL is short because mutations are infrequent
  // and 2-minute staleness is acceptable on a read-heavy endpoint.
  goalsPage: (status: string, page: number, limit: number) =>
    `xxm:cache:goals:${status}:${page}:${limit}`,
  GOALS_TTL: 120,
}
