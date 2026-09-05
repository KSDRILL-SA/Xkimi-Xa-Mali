import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { isLiveDeployment } from '@xxm/utils'
import { logger } from '@xxm/observability'
import { env } from '@/lib/env'
import { db } from '@/lib/db'
import { redis, REDIS_CONFIGURED } from '@/lib/redis'

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000

/** Keyspace for claimed nonces, so they are recognisable in Redis. */
const NONCE_PREFIX = 'xxm:internal-nonce:'

/** The drift window, plus a minute so a nonce outlives the timestamp it carries. */
const NONCE_TTL_SECONDS = MAX_TIMESTAMP_DRIFT_MS / 1000 + 60

/** Constant-time secret comparison — avoids leaking the secret via timing. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch; the length check is unavoidable
  // and only reveals length, not content.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * Validates a trusted server-to-server request from the admin app.
 *
 * Requires the shared secret (`x-admin-secret`), a request timestamp
 * (`x-admin-timestamp`) within ±5 minutes, and a nonce (`x-admin-nonce`) that
 * has not been seen before. The acting admin's id, when present, is forwarded
 * as `x-admin-user-id` and can be read separately via
 * {@link getInternalAdminUserId}.
 *
 * Centralised here so admin API routes share one implementation instead of
 * re-deriving the check (and drifting) in each handler.
 *
 * ── Why the timestamp was not enough ───────────────────────────────────────
 *
 * The previous comment said the window existed "to limit replay", and limit is
 * exactly what it did. A captured request stayed valid for the rest of its five
 * minutes and could be sent again, unchanged, as many times as anybody liked.
 * The routes behind this channel are the consequential ones — reverse a
 * transaction, change a role, suspend a member, approve a mandate, record an
 * offline payment — so a replayed request is a second reversal or a second
 * payment, not a duplicate page view.
 *
 * A nonce makes replay refusable by identity rather than by age: the first
 * request claims it, and every copy afterwards is refused for as long as the
 * timestamp would have been accepted. The claim is a single atomic `SET NX`, so
 * two copies arriving together cannot both win.
 *
 * ── Why it refuses outright when there is nowhere to keep nonces ───────────
 *
 * `redis` is a no-op shim when Upstash is not configured, and its `set()`
 * reports success without storing anything. A nonce store that always says
 * "yes, that one is new" is not a weaker control — it is the absence of one,
 * wearing the appearance of a control, which is the failure this repository
 * keeps rediscovering.
 *
 * So on a live deployment with no nonce store, the trusted channel closes. That
 * is a loud failure — the console's actions stop working — and a loud failure
 * is the point: the alternative is a replay window that nobody can see is open.
 * Off a live deployment it proceeds, because a developer has no Upstash and the
 * shared secret is not a production one.
 *
 * ── Renamed from `isValidInternalRequest` deliberately ─────────────────────
 *
 * This became async, and `if (isValidInternalRequest(req))` on a promise is
 * always true — a missed `await` would fail **open**, silently, on exactly the
 * routes that must not. TypeScript does not object to a truthy promise, so the
 * name had to change: every call site is now a compile error until it is
 * updated, which is a guarantee rather than a review note.
 */
export async function verifyInternalRequest(req: NextRequest): Promise<boolean> {
  if (!env.ADMIN_API_SECRET) return false
  const provided = req.headers.get('x-admin-secret')
  if (!provided || !secretsMatch(provided, env.ADMIN_API_SECRET)) return false

  const ts = req.headers.get('x-admin-timestamp')
  if (!ts) return false
  if (!(Math.abs(Date.now() - Number(ts)) <= MAX_TIMESTAMP_DRIFT_MS)) return false

  return claimNonce(req.headers.get('x-admin-nonce'))
}

/**
 * Claim this request's nonce, or refuse it.
 *
 * TTL is the drift window plus a minute of headroom: a nonce only has to
 * outlive the period in which its timestamp would still be accepted, and
 * keeping them longer would grow a set nobody reads.
 */
async function claimNonce(nonce: string | null): Promise<boolean> {
  if (!REDIS_CONFIGURED) {
    if (isLiveDeployment()) {
      logger.error('Trusted internal request refused — no nonce store on a live deployment', {
        code: 'INTERNAL_REPLAY_STORE_MISSING',
      })
      return false
    }
    // Local development. Say so once rather than pretending replay is covered.
    logger.warn('Internal request replay protection is not active — no Redis configured')
    return true
  }

  // A caller that sends no nonce cannot be replay-checked, so it is not
  // trusted. The admin app has sent one since this shipped.
  if (!nonce || nonce.length < 8 || nonce.length > 200) return false

  const claimed = await redis.set(`${NONCE_PREFIX}${nonce}`, '1', {
    nx: true,
    ex: NONCE_TTL_SECONDS,
  })

  if (claimed === null) {
    // Not an error the caller can fix, and not one to leave in a log nobody
    // reads: a replayed trusted request means the secret and a captured
    // request are both in somebody's hands.
    logger.error('Trusted internal request replayed and refused', {
      code: 'INTERNAL_REQUEST_REPLAYED',
    })
    return false
  }

  return true
}

/** The acting admin's user id forwarded on a trusted internal request, if any. */
export function getInternalAdminUserId(req: NextRequest): string | null {
  return req.headers.get('x-admin-user-id')
}

/**
 * The acting admin on a trusted internal request, confirmed against the database.
 *
 * The routes that accept the internal path took `x-admin-user-id` on faith and
 * granted it `['ADMIN']`. That is not an escalation — anyone holding the shared
 * secret can already reach every trusted route — but it does mean the id
 * attached to the action is whatever the header said. A reversal, a Founder
 * badge, an invitation: each could be recorded against any user id at all,
 * including an admin who had nothing to do with it.
 *
 * The reversal route quotes the Founder Guide on exactly this: "the full
 * history stays honest and any of us can retrace exactly what happened, years
 * later." An actor nobody verified is not a history that can be retraced.
 *
 * So the id is now looked up. It must belong to a live member who actually
 * holds ADMIN — which also closes the gap where the console forwards someone
 * demoted or suspended between its own check and this one. One indexed read on
 * operations that are rare and consequential by nature.
 *
 * Returns null when the header is absent or does not name a current admin; the
 * caller decides which error that is.
 */
export async function resolveInternalAdmin(req: NextRequest): Promise<string | null> {
  const forwarded = getInternalAdminUserId(req)
  if (!forwarded) return null

  const admin = await db.user.findFirst({
    where: {
      id: forwarded,
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { name: 'ADMIN' } } },
    },
    select: { id: true },
  })

  return admin?.id ?? null
}
