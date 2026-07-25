import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { env } from '@/lib/env'

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
