import { db } from './db'
import { redis } from './redis'
import { logger } from '@xxm/observability'

const ROLE_VERSION_PREFIX = 'xxm:role-version:'

/**
 * The role version is what lets a suspension or a demotion take effect before
 * the member's JWT expires. The middleware compares the version in the token
 * against the one stored here; higher means the token is stale and the session
 * must be re-established.
 *
 * **These keys are stored without an expiry, on purpose.** They used to carry a
 * 300-second TTL, and the middleware reads a missing key as version 0 — which is
 * never greater than the version in a token. So five minutes after an admin
 * suspended someone, the key vanished, the comparison started saying "not
 * stale", and the revoked session worked again for the rest of the JWT's life.
 * A suspended member only had to wait.
 *
 * An integer per user is not worth expiring. The key is also seeded at login
 * (see `seedRoleVersion`) so that every live session has one, which keeps a miss
 * meaningful: it means eviction or data loss, not "no session".
 */

function key(userId: string): string {
  return `${ROLE_VERSION_PREFIX}${userId}`
}

export async function getRoleVersion(userId: string): Promise<number> {
  const cached = await redis.get<string>(key(userId))
  if (cached !== null) return Number(cached)

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { roleVersion: true },
  })

  const version = user?.roleVersion ?? 0
  await writeRoleVersion(userId, version, 'getRoleVersion')
  return version
}

/**
 * Write the version through to Redis, loudly.
 *
 * A failure here is not cosmetic: the middleware reads Redis and nothing else,
 * so a dropped write means the revocation never reaches the request path. This
 * used to be swallowed by `.catch(() => {})`, which turned a failed suspension
 * into silence. It still does not throw — the database is already updated and
 * the caller's work should stand — but it is now visible.
 */
async function writeRoleVersion(userId: string, version: number, operation: string): Promise<void> {
  try {
    await redis.set(key(userId), String(version))
  } catch (err) {
    logger.error('Role version could not be written to Redis — revocation may not take effect', {
      userId,
      version,
      operation,
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Make sure a live session has a stored version to be compared against.
 *
 * Called at login. Without it, a user who has never had their role changed has
 * no key, and a missing key is indistinguishable from one that was evicted.
 */
export async function seedRoleVersion(userId: string, version: number): Promise<void> {
  await writeRoleVersion(userId, version, 'seedRoleVersion')
}

export async function bumpRoleVersion(userId: string): Promise<void> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { roleVersion: { increment: 1 } },
    select: { roleVersion: true },
  })

  await writeRoleVersion(userId, updated.roleVersion, 'bumpRoleVersion')

  logger.info('Role version bumped', { userId, newVersion: updated.roleVersion })
}

export async function invalidateRoleVersionCache(userId: string): Promise<void> {
  await redis.del(key(userId)).catch(() => {})
}
