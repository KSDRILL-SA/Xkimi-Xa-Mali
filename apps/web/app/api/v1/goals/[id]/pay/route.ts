import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { paymentRatelimit } from '@/lib/redis'
import { payToGoal } from '@/services/goal-payment.service'
import { GoalPaymentSchema } from '@/lib/validation/goal'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'
import { MEMBER_PAYMENTS_ENABLED, PAYMENTS_DISABLED_MESSAGE } from '@/lib/payments-enabled'

export const POST = withApiHandler<{ id: string }>(async (
  req: NextRequest,
  { params },
) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  // A directed goal payment is a member-initiated gateway collection, so it sits
  // behind the same kill switch as a manual contribution — otherwise disabling
  // manual payments would still leave this route charging cards.
  if (!MEMBER_PAYMENTS_ENABLED) {
    return apiError('SYS_006', PAYMENTS_DISABLED_MESSAGE, 403)
  }

  const { success } = await paymentRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Payment limit reached. Please try again later.', 429)

  const body = await req.json().catch(() => null)
  const parsed = GoalPaymentSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const { id } = await params
  const ip = getClientIP(req)

  const result = await payToGoal(
    id,
    session.user.id,
    session.user.id,
    session.user.roles ?? [],
    parsed.data.amount,
    ip,
    parsed.data.idempotencyKey,
  )
  return apiSuccess(result, 201)
})
