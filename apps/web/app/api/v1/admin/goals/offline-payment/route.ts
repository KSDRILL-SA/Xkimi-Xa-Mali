import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminOfflinePaymentRatelimit } from '@/lib/redis'
import { recordOfflineGoalPayment } from '@/services/goal-payment.service'
import { OfflineGoalPaymentSchema } from '@xxm/utils'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

/**
 * Record a member's cash or EFT payment toward a goal.
 *
 * The sibling of `/admin/contributions/offline`, with the same two trust
 * models: the admin console has no session cookie for this app and calls
 * server-to-server with the shared secret, naming the acting admin; a request
 * carrying a session is checked for the ADMIN role directly. Either way an
 * admin id reaches the service, because an offline row is somebody's claim that
 * money arrived and the record has to say whose.
 *
 * It shares the contribution route's rate-limit bucket deliberately. The limit
 * is there to bound how fast one admin can write payment rows, and that concern
 * does not care whether the money was for a month or for a goal — two separate
 * buckets would let a single admin write at twice the intended rate by
 * alternating between them.
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

  const { success } = await adminOfflinePaymentRatelimit.limit(adminId)
  if (!success) return apiError('SYS_005', 'Rate limit exceeded. Please try again shortly.', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const parsed = OfflineGoalPaymentSchema.safeParse(body)
  if (!parsed.success) {
    // The first message, not the whole issue tree. This reaches a person
    // filling in a form, and one clear sentence about the field they got wrong
    // is more use than a serialised Zod error.
    const first = parsed.error.issues[0]
    return apiError('VAL_002', first?.message ?? 'Invalid payment details', 400)
  }

  const ip = getClientIP(req)

  const result = await recordOfflineGoalPayment(parsed.data, adminId, adminRoles, ip)
  return apiSuccess(result, 201)
})
