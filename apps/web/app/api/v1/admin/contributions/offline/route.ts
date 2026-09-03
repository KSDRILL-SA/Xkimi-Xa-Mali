import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminOfflinePaymentRatelimit } from '@/lib/redis'
import { recordOfflineContribution } from '@/services/contribution.service'
import { OfflineContributionSchema } from '@/lib/validation/contribution'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

/**
 * Record a contribution that arrived without the gateway — cash, or an EFT the
 * member pushed themselves.
 *
 * Two callers, two trust models, the same shape the mandate-rejection route
 * uses. The admin console has no session cookie for this app, so it calls
 * server-to-server with the shared secret and names the acting admin; a
 * request carrying a session is checked for the ADMIN role directly. Either
 * way an admin id reaches the service, because an offline row is somebody's
 * claim that money arrived and the audit trail has to say whose.
 *
 * The schema is parsed here rather than the fields being hand-checked the way
 * the sibling `generate` route does. This payload carries a date and a
 * free-text reference, and `OfflineContributionSchema` already states every
 * rule about them — including that the period is inside the allowed window and
 * the receipt date is not in the future. Re-implementing that inline is how
 * the two drift.
 *
 * Rate limited with its own bucket rather than the bulk one: this writes a
 * single row for a single member, and catching up a backlog means doing that
 * many times in one sitting — the bulk limit (3/hour) is sized for sweeps that
 * bill everybody at once and would stop a catch-up halfway through.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const isTrustedInternal = isValidInternalRequest(req)

  const session = await auth()
  const sessionRoles = (session?.user?.roles as string[] | undefined) ?? []

  let adminId: string
  let adminRoles: string[]

  if (isTrustedInternal) {
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted payment record must name a current admin', 400)
    }
    adminId = forwarded
    adminRoles = ['ADMIN']
  } else {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!sessionRoles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
    adminId = session.user.id
    adminRoles = sessionRoles
  }

  // Keyed on the acting admin either way, so a console session and a browser
  // session cannot between them write twice the intended rate.
  const { success } = await adminOfflinePaymentRatelimit.limit(adminId)
  if (!success) return apiError('SYS_005', 'Rate limit exceeded. Please try again shortly.', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const parsed = OfflineContributionSchema.safeParse(body)
  if (!parsed.success) {
    // The first message, not a dump of the whole issue tree: this reaches a
    // person filling in a form, and one clear sentence about the field they got
    // wrong is more use than a serialised Zod error.
    const first = parsed.error.issues[0]
    return apiError('VAL_002', first?.message ?? 'Invalid payment details', 400)
  }

  const ip = getClientIP(req)

  const result = await recordOfflineContribution(parsed.data, adminId, adminRoles, ip)
  return apiSuccess(result, 201)
})
