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

/**
 * Whether this account must replace its password before signing in again.
 *
 * `passwordChangedAt` is null on every account created while registration
 * enforced eight characters. Null is not "never changed" — it is "set under a
 * rule we no longer consider sufficient".
 *
 * **Enforced only when a reset can actually be delivered.** The way out of this
 * requirement is a password-reset email, so turning it on without working email
 * does not enforce a policy — it locks every account out permanently, the
 * single admin's included, and the console you would fix it from is behind the
 * same door. `RESEND_FROM_EMAIL` defaults to a `.invalid` address and a live
 * deploy on an unverified domain is the failure #299 exists to catch, so this
 * is not a hypothetical. When email is not configured the requirement is
 * skipped and the reason is logged, loudly, on every attempt.
 *
 * Exported for tests: a control that decides who can sign in is worth driving
 * directly rather than inferring from a login that did or did not happen.
 */
export function passwordPolicyResetRequired(user: { passwordChangedAt: Date | null }): boolean {
  if (!env.REQUIRE_PASSWORD_POLICY_RESET) return false
  if (user.passwordChangedAt !== null) return false

  if (!canDeliverPasswordReset()) {
    logger.error(
      'REQUIRE_PASSWORD_POLICY_RESET is on but no reset email can be sent — not enforcing',
      { reason: 'RESEND_FROM_EMAIL is unset or still a .invalid placeholder' },
    )
    return false
  }

  return true
}

/**
 * Whether a password-reset email would actually reach anyone.
 *
 * `.invalid` is the reserved TLD (RFC 2606) this codebase's own env default
 * uses as its placeholder, so testing the suffix is more durable than matching
 * the literal default.
 */
function canDeliverPasswordReset(): boolean {
  const from = env.RESEND_FROM_EMAIL
  return !!env.RESEND_API_KEY && !!from && !from.endsWith('.invalid')
}

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

  // Lock state is *computed* here and disclosed further down. Computing it is
  // not the leak; answering with it is. Knowing it now is what lets a wrong
  // password on an already-locked account avoid extending the lock.
  const isLocked = !!(user.lockedUntil && user.lockedUntil > new Date())

  const valid = await bcrypt.compare(parsed.data.password, user.password)

  if (!valid) {
    // An already-locked account is not counted up further. Without this, wrong
    // guesses against a locked account keep crossing the threshold and keep
    // pushing `lockedUntil` forward, so anyone who knows an address can hold its
    // owner out indefinitely — and with one admin, that is the console.
    let attempts = user.loginAttempts
    let lockout = false

    if (!isLocked) {
      // Atomic increment so parallel failed attempts cannot under-count the
      // counter (a read-modify-write here would let concurrent guesses share a
      // single increment and evade the lockout threshold).
      const updated = await db.user.update({
        where: { id: user.id },
        data: { loginAttempts: { increment: 1 } },
        select: { loginAttempts: true },
      })
      attempts = updated.loginAttempts
      lockout = attempts >= MAX_LOGIN_ATTEMPTS
      if (lockout) {
        await db.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
        })
      }
    }

    await recordLoginHistory(user.id, false)
    logger.warn('Failed login attempt', { userId: user.id, attempts, locked: lockout || isLocked })
    return null
  }

  // ── The password is correct from here down ────────────────────────────────
  //
  // Everything below tells the caller something about this account: that it
  // exists, and what state it is in. None of it may be said to somebody who has
  // not proved they own the account.
  //
  // These checks used to sit *above* the comparison, which meant submitting any
  // string at all against an address returned "account suspended", "pending
  // activation" or "email not verified" — a plain statement that the address is
  // registered, and what it is doing. That undid the decoy-hash defence fifteen
  // lines up, which exists to stop exactly this being learned from timing. The
  // quiet channel was closed and the loud one left open beside it.
  //
  // The cost of moving them: a bcrypt comparison now runs for locked and
  // suspended accounts too, where it used to short-circuit. That is bounded by
  // the per-source sign-in throttle added in #301, and it is the price of the
  // reordering rather than an oversight.
  if (isLocked) {
    const minutesLeft = Math.ceil((user.lockedUntil!.getTime() - Date.now()) / 60_000)
    logger.warn('Login blocked — account locked', { userId: user.id, minutesLeft })
    throw new Error('ACCOUNT_LOCKED')
  }

  if (user.status === 'PENDING') {
    if (!user.emailVerified) throw new Error('EMAIL_NOT_VERIFIED')
    throw new Error('PENDING_ACTIVATION')
  }
  if (user.status === 'SUSPENDED') throw new Error('ACCOUNT_SUSPENDED')

  // No successful login is recorded for this one, because none happened — they
  // proved the password and were sent to replace it.
  if (passwordPolicyResetRequired(user)) {
    logger.info('Sign-in refused pending password policy reset', { userId: user.id })
    throw new Error('PASSWORD_RESET_REQUIRED')
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
