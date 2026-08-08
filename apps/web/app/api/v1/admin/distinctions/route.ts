import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, getInternalAdminUserId } from '@/lib/internal-request'
import {
  grantDistinction,
  removeDistinction,
  listHolders,
} from '@/services/distinction.service'

/**
 * Granting and removing a distinction — today, the Founder badge.
 *
 * The trust model is the reversal route's, for the same reason: the admin
 * console holds no session cookie for this app and calls server-to-server with
 * the shared secret, so a route that required a session outright would be
 * unreachable by the only caller that exists (#283 was exactly that bug, found
 * only because nothing had ever tested it).
 *
 * A self-grant is expected here rather than exceptional. There is one admin and
 * he is himself a founder, so somebody has to grant the first badge and there is
 * nobody else to do it. What matters is that the acting admin is named, which is
 * why the internal path must forward an id and cannot fall back to "system".
 */

const GrantSchema = z.object({
  userId: z.string().min(1),
  // One kind today. Stated explicitly rather than defaulted, so adding a second
  // never silently reinterprets a caller that omitted it.
  kind: z.literal('FOUNDER'),
  note: z.string().trim().max(500).optional(),
})

const RemoveSchema = z.object({
  userId: z.string().min(1),
  kind: z.literal('FOUNDER'),
  // A founder badge is permanent. Removal exists for a badge granted to the
  // wrong account — an erratum, not a revocation — and the reason is required
  // to make whoever is removing it say which of the two they are doing.
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(500),
})

/** Resolve the acting admin, from either the session or the trusted console. */
async function resolveAdmin(req: NextRequest): Promise<
  { ok: true; adminId: string } | { ok: false; response: ReturnType<typeof apiError> }
> {
  if (isValidInternalRequest(req)) {
    // The console has already run `requireAdmin`, which includes the
    // role-version staleness check, so a demoted admin never reaches here. What
    // it must still hand over is who acted.
    const forwarded = getInternalAdminUserId(req)
    if (!forwarded) {
      return {
        ok: false,
        response: apiError('VAL_004', 'A trusted request must name the acting admin', 400),
      }
    }
    return { ok: true, adminId: forwarded }
  }

  const session = await auth()
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  if (!session?.user?.id) return { ok: false, response: apiError('SYS_002', 'Unauthorised', 401) }
  if (!roles.includes('ADMIN')) return { ok: false, response: apiError('SYS_003', 'Forbidden', 403) }
  return { ok: true, adminId: session.user.id }
}

/** Who holds the Founder badge. Admin-only: it is a management view. */
export const GET = withApiHandler(async (req: NextRequest) => {
  const admin = await resolveAdmin(req)
  if (!admin.ok) return admin.response

  return apiSuccess(await listHolders('FOUNDER'))
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const admin = await resolveAdmin(req)
  if (!admin.ok) return admin.response

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const parsed = GrantSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_002', parsed.error.issues[0]?.message ?? 'Invalid payload', 400)
  }

  const granted = await grantDistinction({
    userId: parsed.data.userId,
    kind: parsed.data.kind,
    grantedById: admin.adminId,
    note: parsed.data.note ?? null,
  })

  return apiSuccess(granted, 201)
})

export const DELETE = withApiHandler(async (req: NextRequest) => {
  const admin = await resolveAdmin(req)
  if (!admin.ok) return admin.response

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const parsed = RemoveSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_002', parsed.error.issues[0]?.message ?? 'Invalid payload', 400)
  }

  await removeDistinction({
    userId: parsed.data.userId,
    kind: parsed.data.kind,
    removedById: admin.adminId,
    reason: parsed.data.reason,
  })

  return apiSuccess({ removed: true })
})
