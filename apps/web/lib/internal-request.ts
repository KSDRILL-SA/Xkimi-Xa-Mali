import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { db } from '@/lib/db'

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000

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
 * Requires the shared secret (`x-admin-secret`) and a recent request
 * timestamp (`x-admin-timestamp`) within ±5 minutes to limit replay. The
 * acting admin's id, when present, is forwarded as `x-admin-user-id` and can
 * be read separately via {@link getInternalAdminUserId}.
 *
 * Centralised here so admin API routes share one implementation instead of
 * re-deriving the check (and drifting) in each handler.
 */
export function isValidInternalRequest(req: NextRequest): boolean {
  if (!env.ADMIN_API_SECRET) return false
  const provided = req.headers.get('x-admin-secret')
  if (!provided || !secretsMatch(provided, env.ADMIN_API_SECRET)) return false

  const ts = req.headers.get('x-admin-timestamp')
  if (!ts) return false

  return Math.abs(Date.now() - Number(ts)) <= MAX_TIMESTAMP_DRIFT_MS
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
