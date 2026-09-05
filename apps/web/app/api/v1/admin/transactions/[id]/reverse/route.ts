import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { createReversal } from '@/services/contribution.service'
import { withApiHandler } from '@/lib/api-handler'
import { verifyInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

/**
 * A reversal has to say why.
 *
 * The Founder Guide's promise is not merely that a mistake is corrected — it is
 * that "the full history stays honest and any of us can retrace exactly what
 * happened, years later." A reversing entry with no stated cause is a hole in
 * that history, so the reason is required here rather than left optional and
 * quietly omitted by the first caller that finds it inconvenient.
 *
 * Ten characters, because "oops" retraces nothing.
 */
const ReverseSchema = z.object({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(500),
})

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  // Two callers, two trust models.
  //
  // The admin console has no session cookie for this app — it calls
  // server-to-server through `internalAdminPost`, with the shared secret and a
  // timestamp. This route previously required a session outright, so the only
  // caller that exists got a 401 and no reversal was performable by anyone.
  // `broadcast/route.ts` established this pattern; it applies here for the same
  // reason and with one addition: a reversal must name the admin who ordered it.
  const isTrustedInternal = await verifyInternalRequest(req)

  const session = await auth()
  const sessionRoles = (session?.user?.roles as string[] | undefined) ?? []

  let adminId: string
  let adminRoles: string[]

  if (isTrustedInternal) {
    // The console has already run `requireAdmin`, which includes the
    // role-version staleness check — a demoted admin never gets this far. What
    // it must still hand over is who acted, because that is what the audit
    // entry records and "system" would be a lie about a money movement.
    // Confirmed against the database rather than believed. The console has
    // already run `requireAdmin`, but this route's promise is that the history
    // can be retraced years later — and an actor nobody checked is not that.
    // It also closes the window where an admin is demoted between the
    // console's check and this one.
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted reversal must name a current admin', 400)
    }
    adminId = forwarded
    adminRoles = ['ADMIN']
  } else {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!sessionRoles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
    adminId = session.user.id
    adminRoles = sessionRoles
  }

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const parsed = ReverseSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_002', parsed.error.issues[0]?.message ?? 'Invalid payload', 400)
  }

  const { id } = await params

  // On the trusted path the socket address belongs to the admin app, not to the
  // person who clicked. The console forwards the real one so the audit trail's
  // "where" is about a human rather than about our own infrastructure.
  const ip = (isTrustedInternal ? req.headers.get('x-admin-ip') : null) ?? getClientIP(req)

  const reversal = await createReversal(id, adminId, adminRoles, parsed.data.reason, ip)
  return apiSuccess(reversal, 201)
})
