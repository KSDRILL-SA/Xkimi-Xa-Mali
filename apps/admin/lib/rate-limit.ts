import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { env } from './env'

/**
 * Throttling for admin server actions.
 *
 * Deliberately keyed on the admin's user id rather than their IP. Every action
 * behind this is already authenticated, so the id is the accurate identity and
 * cannot be spoofed by adding a forwarded-for hop — the bypass that had to be
 * closed on the member app's unauthenticated routes in #210.
 *
 * Shares the member app's Upstash instance, with its own key prefixes so the two
 * never contend. When Upstash is not configured the limiter allows everything
 * through: the member app makes the same choice, and the health endpoint reports
 * an unconfigured Redis honestly rather than letting it look healthy.
 */
const REDIS_CONFIGURED = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)

const noopRatelimit = {
  limit: async () => ({ success: true, limit: 9999, remaining: 9999, reset: 0, pending: Promise.resolve() }),
} as unknown as Ratelimit

function makeRatelimit(prefix: string, limiter: ReturnType<typeof Ratelimit.slidingWindow>): Ratelimit {
  if (!REDIS_CONFIGURED) return noopRatelimit
  return new Ratelimit({
    redis: new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! }),
    limiter,
    prefix,
  })
}

/**
 * Sign-in attempts at the admin console, per IP.
 *
 * This login had no throttle at all: the middleware matcher excludes
 * `api/auth`, so the credentials callback was reachable at any rate. The
 * per-account lockout does not cover it — that never fires for an address with
 * no row, so guessing at admin email addresses cost nothing.
 *
 * **Keyed on IP, unlike every other limiter in this file.** The rest are keyed
 * on the admin's user id because they sit behind an authenticated session;
 * there is no session yet at sign-in, and an account-keyed limit here would be
 * a gift to anyone wanting the single admin locked out of their own console.
 * Throttling the source does not do that.
 *
 * Five in five minutes, against the member app's ten. There is one admin, they
 * know their password, and this is the console that can reverse a transaction.
 */
export const adminLoginRatelimit = makeRatelimit(
  'xxm:ratelimit:admin-login',
  Ratelimit.slidingWindow(5, '5 m'),
)

/**
 * Ordinary admin work — approving a mandate, editing a goal, unlocking a member.
 * Generous enough that nobody working quickly will ever see it, tight enough to
 * stop a stolen session or a runaway client from walking the whole member list.
 */
export const adminActionRatelimit = makeRatelimit(
  'xxm:ratelimit:admin-action',
  Ratelimit.slidingWindow(60, '1 m'),
)

/**
 * Actions that fan out across every member — generating a month of contributions,
 * broadcasting to the whole brotherhood. Rare by nature, expensive to undo, and
 * the ones where a double submission does visible damage.
 */
export const adminBulkActionRatelimit = makeRatelimit(
  'xxm:ratelimit:admin-bulk-action',
  Ratelimit.slidingWindow(5, '1 h'),
)

/**
 * Taking a copy of the membership's personal information out of the system.
 *
 * A member downloading their own statement is held to ten an hour. An admin
 * downloading every member's name, email address and phone number was held to
 * nothing at all — the same inverted proportion found on the pages either side
 * of this one, except that here what leaves the building is other people's
 * personal information rather than a number.
 *
 * Twenty an hour is generous for legitimate use — a report is pulled once for
 * a period, occasionally re-pulled — while putting a ceiling on how much can be
 * taken through one session that should not have it.
 */
export const adminExportRatelimit = makeRatelimit(
  'xxm:ratelimit:admin-export',
  Ratelimit.slidingWindow(20, '1 h'),
)
