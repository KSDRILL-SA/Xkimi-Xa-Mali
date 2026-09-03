import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminOfflinePaymentRatelimit } from '@/lib/redis'
import { recordOfflineContribution } from '@/services/contribution.service'
import { OfflineContributionSchema } from '@/lib/validation/contribution'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

/**
 * Record a contribution that arrived without the gateway — cash, or an EFT the
 * member pushed themselves.
 *
 * Rate limited with its own bucket rather than the bulk one: this writes a
 * single row for a single member, and catching up a backlog means doing that
 * many times in one sitting — the bulk limit (3/hour) is sized for sweeps that
 * bill everybody at once and would stop a catch-up halfway through.
 *
 * The schema is parsed here rather than hand-checking fields the way the
 * sibling `generate` route does. This payload carries a date and a free-text
 * reference, and `OfflineContributionSchema` already states every rule about
 * them — including that the period is inside the allowed window and the receipt
 * date is not in the future. Re-implementing that inline is how the two drift.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { success } = await adminOfflinePaymentRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Rate limit exceeded. Please try again shortly.', 429)

  const roles = (session.user.roles as string[] | undefined) ?? []

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

  const result = await recordOfflineContribution(parsed.data, session.user.id, roles, ip)
  return apiSuccess(result, 201)
})
