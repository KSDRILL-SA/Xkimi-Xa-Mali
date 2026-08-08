import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from './db'
import { env } from './env'
import { authConfig } from './auth.config'
import { LoginSchema } from './validation/auth'
import { seedRoleVersion } from './role-version'
import { loginRatelimit } from './redis'
import { clientIpFromHeaders } from '@xxm/utils/client-ip'
import { logger } from '@xxm/observability'

const MAX_LOGIN_ATTEMPTS = env.MAX_LOGIN_ATTEMPTS
const LOCKOUT_DURATION_MS = env.LOCKOUT_DURATION_MINUTES * 60 * 1000

// A valid cost-12 bcrypt hash of a throwaway value. When no account matches, we
// still run bcrypt.compare against this decoy so a non-existent email costs the
// same time as a real one — closing the timing side-channel that would otherwise
// let an attacker enumerate registered emails (SEC-S07).
const DECOY_HASH = '$2a$12$0qvDdA8aXMT/QLT7ggsLKess1fpkA0Uy07.gAmSqiJcZy7/AcziCi'

async function recordLoginHistory(userId: string, success: boolean) {
  await db.loginHistory
    .create({ data: { userId, success } })
    .catch(() => {}) // non-critical — never let audit failure break login
}

// Exported so the lockout logic can be unit-tested independently of NextAuth.
export async function authorizeCredentials(credentials: Record<string, unknown>) {
  const parsed = LoginSchema.safeParse(credentials)
  if (!parsed.success) return null

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    include: { roles: { include: { role: true } } },
  })

  // Constant-time reject for absent/soft-deleted accounts: burn an equivalent
  // bcrypt comparison so response time cannot distinguish "no such user" from
  // "user exists, wrong password" (SEC-S07 — no user enumeration).
  if (!user?.password || user.deletedAt) {
    await bcrypt.compare(parsed.data.password, DECOY_HASH)
    return null
  }

  // Account lockout check — checked before bcrypt to short-circuit fast
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
    logger.warn('Login blocked — account locked', { userId: user.id, minutesLeft })
    throw new Error('ACCOUNT_LOCKED')
  }

  if (user.status === 'PENDING') {
    if (!user.emailVerified) throw new Error('EMAIL_NOT_VERIFIED')
    throw new Error('PENDING_ACTIVATION')
  }
  if (user.status === 'SUSPENDED') throw new Error('ACCOUNT_SUSPENDED')

  const valid = await bcrypt.compare(parsed.data.password, user.password)

  if (!valid) {
    // Atomic increment so parallel failed attempts cannot under-count the
    // counter (a read-modify-write here would let concurrent guesses share a
    // single increment and evade the lockout threshold).
    const { loginAttempts: attempts } = await db.user.update({
      where: { id: user.id },
      data: { loginAttempts: { increment: 1 } },
      select: { loginAttempts: true },
    })
    const lockout = attempts >= MAX_LOGIN_ATTEMPTS
    if (lockout) {
      await db.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
      })
    }
    await recordLoginHistory(user.id, false)
    logger.warn('Failed login attempt', { userId: user.id, attempts, locked: lockout })
    return null
  }

  // Successful login — reset lockout counters
  if (user.loginAttempts > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    })
  }

  await recordLoginHistory(user.id, true)

  // Publish the authoritative version alongside the token that carries it, so
  // every live session has a stored counterpart. Without this a user whose role
  // has never changed has no key, and the middleware cannot tell that absence
  // apart from a key that was evicted — which is the difference between "no
  // revocation has happened" and "a revocation may have been lost".
  await seedRoleVersion(user.id, user.roleVersion)

  return {
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    roles: user.roles.map((ur) => ur.role.name),
    roleVersion: user.roleVersion,
  }
}

/**
 * Refuse a sign-in attempt from a source that is making too many of them.
 *
 * Separate from {@link authorizeCredentials}, and deliberately so: the throttle
 * belongs at the boundary, before any account is looked up, because the attack
 * it stops is one that never names the same account twice. Keeping it out of
 * `authorizeCredentials` also leaves that function drivable by a test without a
 * request context.
 *
 * Takes the identifier rather than reading it, so a test can drive both sides.
 */
export async function assertLoginAllowed(identifier: string): Promise<void> {
  const { success } = await loginRatelimit.limit(identifier)
  if (success) return

  logger.warn('Sign-in throttled', { identifier })
  // Thrown, not returned null: `null` is "wrong password", and telling someone
  // their password is wrong when it was never checked sends them to the reset
  // flow for a problem a short wait would fix.
  throw new Error('RATE_LIMITED')
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      async authorize(credentials, request) {
        // `?? 'unknown'` matches every other rate-limited route in this app: an
        // IP that cannot be established from a header the front door controls
        // shares one bucket. On Vercel that header is always set, so this is the
        // path taken by direct-to-origin traffic, which is exactly the traffic
        // worth bucketing together.
        const ip = clientIpFromHeaders(request.headers) ?? 'unknown'
        await assertLoginAllowed(ip)
        return authorizeCredentials(credentials)
      },
    }),
  ],
})
