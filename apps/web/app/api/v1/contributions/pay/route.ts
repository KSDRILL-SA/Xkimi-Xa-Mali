import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { paymentRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { submitManualPayment } from '@/services/contribution.service'
import { ManualContributionSchema } from '@/lib/validation/contribution'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'
import { MEMBER_PAYMENTS_ENABLED, PAYMENTS_DISABLED_MESSAGE } from '@/lib/payments-enabled'

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  if (!MEMBER_PAYMENTS_ENABLED) {
    return apiError('SYS_006', PAYMENTS_DISABLED_MESSAGE, 403)
  }

  const { success } = await paymentRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Payment limit reached. Please try again later.', 429)

  const body = await req.json().catch(() => null)
  const parsed = ManualContributionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const ip = getClientIP(req)

  const result = await submitManualPayment(
    session.user.id,
    parsed.data,
    session.user.id,
    session.user.roles ?? [],
    ip,
  )
  return apiSuccess(result, 201)
})
