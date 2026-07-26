import { db } from './db'
import { Redis } from '@upstash/redis'
import { env } from './env'
import { logger } from '@xxm/observability'

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

const REDIS_CONFIGURED = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)

let _redis: Redis | null = null
function getRedis(): Redis | null {
  if (!REDIS_CONFIGURED) return null
  if (!_redis) {
    _redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
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
export async function seedRoleVersion(userId: string, version: number): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(`${ROLE_VERSION_PREFIX}${userId}`, String(version))
  } catch (err) {
    logger.warn('Could not publish role version to Redis at login', {
      userId,
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}

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
