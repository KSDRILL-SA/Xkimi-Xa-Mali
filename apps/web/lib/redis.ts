import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { env } from './env'

// Exported so the health check can report the honest Redis state. When this is
// false the redis client is a no-op whose ping() still returns 'PONG', so a
// health check must not infer "reachable" from a successful ping — that would
// hide a production misconfiguration that silently disables rate limiting and
// role-version session invalidation.
export const REDIS_CONFIGURED = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)

// No-op redis shim — used in local dev when Upstash is not configured.
// All cache reads return null (cache miss), writes silently succeed.
const noopRedis = {
  get: async () => null,
  set: async () => 'OK' as const,
  del: async () => 0,
  ping: async () => 'PONG' as const,
} as unknown as Redis

export const redis: Redis = REDIS_CONFIGURED
  ? new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! })
  : noopRedis

// No-op ratelimit — always allows the request through when Redis is not configured.
const noopRatelimit = {
  limit: async () => ({ success: true, limit: 9999, remaining: 9999, reset: 0, pending: Promise.resolve() }),
} as unknown as Ratelimit

function makeRatelimit(prefix: string, limiter: ReturnType<typeof Ratelimit.slidingWindow>): Ratelimit {
  if (!REDIS_CONFIGURED) return noopRatelimit
  return new Ratelimit({ redis, limiter, prefix })
}

export const authRatelimit      = makeRatelimit('xxm:ratelimit:auth',            Ratelimit.slidingWindow(5,  '1 m'))
/**
 * Sign-in attempts, per IP.
 *
 * Sign-in had no throttle of any kind. `authRatelimit` guards registration,
 * reset and invite validation, but NextAuth's `/api/auth/*` is passed straight
 * through by the middleware before any limiter runs, so the credentials
 * callback was reachable at whatever rate a client could manage.
 *
 * The per-account lockout is not a substitute, for two reasons. It is **per
 * account**, so one password tried against fifty member emails never trips it —
 * which is how spraying works, and is the attack this circle's shared surname
 * conventions make easiest. And it never fires for an address that does not
 * exist at all, because there is no row to increment, so enumeration by guess
 * is free.
 *
 * Per IP rather than per account **on purpose**: an IP limit throttles the
 * attacker's source and leaves the real member's next attempt untouched. An
 * account-keyed limit would do the opposite and hand anyone a way to hold a
 * member — or the single admin — out of their own account.
 *
 * Ten in five minutes: a member who has genuinely forgotten which password they
 * used gets several honest tries plus fat-finger room, and a spray of any width
 * from one source dies immediately.
 */
export const loginRatelimit     = makeRatelimit('xxm:ratelimit:login',           Ratelimit.slidingWindow(10, '5 m'))
export const apiRatelimit       = makeRatelimit('xxm:ratelimit:api',             Ratelimit.slidingWindow(60, '1 m'))
export const paymentRatelimit   = makeRatelimit('xxm:ratelimit:payment',         Ratelimit.slidingWindow(5,  '1 h'))
export const mandateRatelimit   = makeRatelimit('xxm:ratelimit:mandate',         Ratelimit.slidingWindow(3,  '1 h'))
export const statementRatelimit = makeRatelimit('xxm:ratelimit:statement',       Ratelimit.slidingWindow(10, '1 h'))
export const forgotPasswordRatelimit  = makeRatelimit('xxm:ratelimit:forgot-password', Ratelimit.slidingWindow(5,  '15 m'))
export const verifyEmailRatelimit     = makeRatelimit('xxm:ratelimit:verify-email',    Ratelimit.slidingWindow(10, '15 m'))
/**
 * Asking for the verification link again.
 *
 * Tighter than most, because each success sends mail to an address the caller
 * named rather than one they own — an unthrottled version is a way to have this
 * system post repeatedly to somebody else's inbox. Three in fifteen minutes
 * covers a member who clicks twice and then checks their spam folder.
 */
export const resendVerificationRatelimit = makeRatelimit('xxm:ratelimit:resend-verification', Ratelimit.slidingWindow(3, '15 m'))
export const mandateCreateRatelimit   = makeRatelimit('xxm:ratelimit:mandate-create',  Ratelimit.slidingWindow(10, '1 h'))
export const mandateDelayRatelimit    = makeRatelimit('xxm:ratelimit:mandate-delay',   Ratelimit.slidingWindow(5,  '1 h'))
// A proposal reaches every leader's inbox, so an unbounded one is a way to
// shout at leadership. Three an hour is generous for a real intention and
// useless as a megaphone.
export const goalProposalRatelimit    = makeRatelimit('xxm:ratelimit:goal-propose',    Ratelimit.slidingWindow(3,  '1 h'))
export const adminInviteRatelimit     = makeRatelimit('xxm:ratelimit:admin-invite',    Ratelimit.slidingWindow(20, '1 h'))
export const adminBroadcastRatelimit  = makeRatelimit('xxm:ratelimit:admin-broadcast', Ratelimit.slidingWindow(5,  '1 h'))
export const adminBulkRatelimit       = makeRatelimit('xxm:ratelimit:admin-bulk',      Ratelimit.slidingWindow(3,  '1 h'))

/**
 * Posting to the community board.
 *
 * The Founder Guide tells four co-founders that a member may "post on the
 * community board, up to ten times a day". Nothing enforced it — the route
 * used the general 60-a-minute API limit, so the promise in a signed document
 * was simply not true.
 *
 * A day rather than a minute is the point. The general limit stops a script;
 * this stops one member filling the board, which is what the sentence was
 * about. Both apply: whichever runs out first refuses.
 */
export const communityPostRatelimit = makeRatelimit(
  'xxm:ratelimit:community-post',
  Ratelimit.slidingWindow(10, '1 d'),
)

/**
 * The public statistics endpoint, per IP.
 *
 * The only unauthenticated endpoint in the system that reads the database on
 * demand, and it had no limit of any kind. It is not wrapped in
 * `withApiHandler` either, and that wrapper only throttles state-changing
 * methods in any case — a deliberate choice for authenticated reads, which is
 * exactly why an unauthenticated one needs saying explicitly rather than
 * inheriting a default written for a different situation.
 *
 * A cache miss costs three queries: a member count, a sum over every successful
 * inflow, and the oldest contribution row. The hour-long TTL makes that rare —
 * until Redis is not configured, when `cache.get` returns null forever and
 * every single request pays all three. That is the shape of the problem: the
 * mitigation and the thing being mitigated fail together, so the endpoint is
 * least protected in precisely the state where it most needs protecting.
 *
 * Thirty a minute is enormously generous for the one legitimate caller: the
 * marketing site fetches this server-side with `revalidate: 3600`, so its real
 * rate is once an hour per instance. The limit exists for everyone else.
 */
export const publicStatsRatelimit = makeRatelimit(
  'xxm:ratelimit:public-stats',
  Ratelimit.slidingWindow(30, '1 m'),
)

/**
 * POPIA data subject requests, submitted from the public privacy page.
 *
 * Deliberately loose for a public unauthenticated form — three an hour, not
 * three a day. The failure this endpoint must never have is a person exercising
 * a statutory right and being turned away by our throttle: someone who is angry
 * enough to demand deletion is exactly the person who will submit twice, correct
 * a typo in their email, and submit again. Duplicates cost an administrator a
 * minute each; a refused request costs the Foundation a complaint to the
 * Regulator that it cannot answer.
 */
export const dataRequestRatelimit = makeRatelimit(
  'xxm:ratelimit:data-request',
  Ratelimit.slidingWindow(3, '1 h'),
)
