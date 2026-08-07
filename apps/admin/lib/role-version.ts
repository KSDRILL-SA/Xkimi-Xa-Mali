import { db } from './db'
import { Redis } from '@upstash/redis'
import { logger } from '@xxm/observability'
import { env } from './env'

// Read through the validated config module rather than process.env directly,
// so production startup keeps enforcing `requiredWhenLive` on both Upstash
// variables. Tests mock '@/lib/env' (see apps/admin/__tests__/role-revocation.test.ts
// and role-version-publish.test.ts) rather than the environment itself, so
// importing the strict module here does not weaken isolated unit tests.
const REDIS_URL = env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN
const REDIS_CONFIGURED = !!(REDIS_URL && REDIS_TOKEN)

/**
 * Has this admin's session outlived the roles it was issued with?
 *
 * The admin app already carried `roleVersion` in its JWT and already bumped it
 * when suspending a member — but nothing ever read it back. Neither the
 * middleware nor the action guard compared the token's version against the
 * stored one, so revoking someone's ADMIN role did not end their session in the
 * console that approves mandates, reverses transactions and suspends members.
 * They kept every power in the token until it expired, up to a day later.
 *
 * Unlike the member app's Edge middleware, this runs in Node and can reach the
 * database — so there is no "unverifiable" case to reason about here. Redis is
 * consulted first because it is cheap and is where revocations are published;
 * a miss falls through to the database, which is authoritative and always
 * answers.
 */

const ROLE_VERSION_PREFIX = 'xxm:role-version:'

let _redis: Redis | null = null
function getRedis(): Redis | null {
  if (!REDIS_CONFIGURED) return null
  if (!_redis) {
    _redis = new Redis({
      url: REDIS_URL!,
      token: REDIS_TOKEN!,
    })
  }
  return _redis
}

/**
 * Publish a version so the Edge middleware has something to compare against.
 *
 * Best-effort: a failure here is logged rather than raised, because the
 * authoritative check in {@link isSessionRoleStale} reads the database and does
 * not depend on this succeeding.
 */
export async function publishRoleVersion(userId: string, version: number): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(`${ROLE_VERSION_PREFIX}${userId}`, String(version))
  } catch (err) {
    logger.warn('Could not publish role version to Redis', {
      userId,
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Seed the role-version cache when a session is established. */
export const seedRoleVersion = publishRoleVersion

/** The authoritative current role version, preferring Redis but never trusting a miss. */
export async function currentRoleVersion(userId: string): Promise<number> {
  const redis = getRedis()

  if (redis) {
    try {
      const stored = await redis.get<string>(`${ROLE_VERSION_PREFIX}${userId}`)
      if (stored !== null && stored !== undefined) {
        const version = Number(stored)
        if (Number.isFinite(version)) return version
      }
    } catch (err) {
      // Fall through to the database rather than assume anything.
      logger.warn('Role version lookup failed in Redis, falling back to the database', {
        userId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { roleVersion: true },
  })
  return user?.roleVersion ?? 0
}

/**
 * True when the session must be re-established.
 *
 * Any stored version ahead of the token's means the roles changed after it was
 * issued. There is deliberately no tolerance and no cache here: this gates the
 * actions that move money, and it runs once per action rather than per request.
 */
export async function isSessionRoleStale(userId: string, tokenVersion: number): Promise<boolean> {
  const current = await currentRoleVersion(userId)
  return current > tokenVersion
}
