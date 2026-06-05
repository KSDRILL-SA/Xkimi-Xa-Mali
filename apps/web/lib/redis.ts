import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { env } from './env'

const REDIS_CONFIGURED = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)

// No-op redis shim — used in local dev when Upstash is not configured.
// All cache reads return null (cache miss), writes silently succeed.
const noopRedis = {
  get: async () => null,
  set: async () => 'OK' as const,
  del: async () => 0,
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
export const apiRatelimit       = makeRatelimit('xxm:ratelimit:api',             Ratelimit.slidingWindow(60, '1 m'))
export const paymentRatelimit   = makeRatelimit('xxm:ratelimit:payment',         Ratelimit.slidingWindow(5,  '1 h'))
export const mandateRatelimit   = makeRatelimit('xxm:ratelimit:mandate',         Ratelimit.slidingWindow(3,  '1 h'))
export const statementRatelimit = makeRatelimit('xxm:ratelimit:statement',       Ratelimit.slidingWindow(10, '1 h'))
export const forgotPasswordRatelimit  = makeRatelimit('xxm:ratelimit:forgot-password', Ratelimit.slidingWindow(5,  '15 m'))
export const verifyEmailRatelimit     = makeRatelimit('xxm:ratelimit:verify-email',    Ratelimit.slidingWindow(10, '15 m'))
export const mandateCreateRatelimit   = makeRatelimit('xxm:ratelimit:mandate-create',  Ratelimit.slidingWindow(10, '1 h'))
export const mandateDelayRatelimit    = makeRatelimit('xxm:ratelimit:mandate-delay',   Ratelimit.slidingWindow(5,  '1 h'))
export const adminInviteRatelimit     = makeRatelimit('xxm:ratelimit:admin-invite',    Ratelimit.slidingWindow(20, '1 h'))
export const adminBroadcastRatelimit  = makeRatelimit('xxm:ratelimit:admin-broadcast', Ratelimit.slidingWindow(5,  '1 h'))
export const adminBulkRatelimit       = makeRatelimit('xxm:ratelimit:admin-bulk',      Ratelimit.slidingWindow(3,  '1 h'))
