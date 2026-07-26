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
