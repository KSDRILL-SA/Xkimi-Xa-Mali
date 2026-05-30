import { db } from './db'
import { redis } from './redis'
import { logger } from './logger'

const ROLE_VERSION_PREFIX = 'xxm:role-version:'
const ROLE_VERSION_TTL = 300

export async function getRoleVersion(userId: string): Promise<number> {
  const cacheKey = `${ROLE_VERSION_PREFIX}${userId}`
  const cached = await redis.get<string>(cacheKey)
  if (cached !== null) return Number(cached)

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { roleVersion: true },
  })

  const version = user?.roleVersion ?? 0
  await redis.set(cacheKey, String(version), { ex: ROLE_VERSION_TTL }).catch(() => {})
  return version
}

export async function bumpRoleVersion(userId: string): Promise<void> {
  const updated = await db.user.update({
    where: { id: userId },
    data: { roleVersion: { increment: 1 } },
    select: { roleVersion: true },
  })

  const cacheKey = `${ROLE_VERSION_PREFIX}${userId}`
  await redis.set(cacheKey, String(updated.roleVersion), { ex: ROLE_VERSION_TTL }).catch(() => {})

  logger.info('Role version bumped', { userId, newVersion: updated.roleVersion })
}

export async function invalidateRoleVersionCache(userId: string): Promise<void> {
  const cacheKey = `${ROLE_VERSION_PREFIX}${userId}`
  await redis.del(cacheKey).catch(() => {})
}
