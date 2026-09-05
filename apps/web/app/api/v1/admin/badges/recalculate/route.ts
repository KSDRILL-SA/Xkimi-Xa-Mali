import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminBulkRatelimit } from '@/lib/redis'
import { recalculateAll, recalculateOne } from '@/services/badge.service'
import { withApiHandler } from '@/lib/api-handler'
import { verifyInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { writeAuditLog } from '@/services/audit.service'
import { getClientIP } from '@/lib/request'

/**
 * Re-derive badge scores on request.
 *
 * Badges recalculate on a contribution status change and on the first of each
 * month, and neither reaches a badge that is *already* wrong. A reversal that
 * happened before the recalculation job was fixed left a member credited for
 * money the Foundation does not have, and the only remedies were to wait up to
 * a month for the monthly sweep or to hope some unrelated change to that
 * member's contributions happened to fire the event.
 *
 * A correction that cannot be applied to the data it was written for is half a
 * correction. This is the other half.
 *
 * It computes nothing new: `recalculateOne` derives everything from the
 * contribution rows, so asking twice in a row is simply the same answer again.
 * That is what makes it safe to expose — it cannot invent a promotion, only
 * discover one the data already supports.
 *
 * ## Why the bulk bucket
 *
 * Without `userId` this walks every active member, one recalculation each. That
 * is the same shape of action as generating a month's contributions, so it
 * shares that limiter rather than getting a laxer one of its own. A single
 * member is far cheaper, but it is not worth a second bucket: nobody needs to
 * ask more than three times an hour, and one limit is one thing to reason about.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const isTrustedInternal = await verifyInternalRequest(req)

  const session = await auth()
  const sessionRoles = (session?.user?.roles as string[] | undefined) ?? []

  let adminId: string
  let adminRoles: string[]

  if (isTrustedInternal) {
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted recalculation must name a current admin', 400)
    }
    adminId = forwarded
    adminRoles = ['ADMIN']
  } else {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!sessionRoles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
    adminId = session.user.id
    adminRoles = sessionRoles
  }

  const { success } = await adminBulkRatelimit.limit(adminId)
  if (!success) return apiError('SYS_005', 'Rate limit exceeded. Please try again shortly.', 429)

  let body: unknown = {}
  try { body = (await req.json()) ?? {} } catch { /* an empty body means everybody */ }
  const userId = (body as { userId?: unknown }).userId
  const one = typeof userId === 'string' && userId.length > 0 ? userId : null

  // `assertAdmin` runs inside the service for the same reason every other admin
  // path does it there: the check belongs with the work, not only with the door.
  const result = one
    ? { recalculated: 1, member: await recalculateOne(one, 'admin_requested') }
    : { recalculated: await recalculateAll('admin_requested'), member: null }

  // Recorded because it is a leadership action that can move a member's
  // standing. It derives rather than decides, so it cannot be abused to promote
  // somebody — but "who asked, and when" is what makes that checkable rather
  // than merely asserted.
  await writeAuditLog({
    userId: adminId,
    action: 'BADGE_RECALCULATION_REQUESTED',
    entity: 'Badge',
    entityId: one ?? 'all',
    payload: { scope: one ? 'member' : 'all', recalculated: result.recalculated },
    ipAddress: getClientIP(req),
  })

  return apiSuccess(result, 200)
})
