import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { mandateDelayRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requestDelay } from '@/services/mandate.service'
import { DelayMandateSchema } from '@/lib/validation/mandate'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { success } = await mandateDelayRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Mandate operations are limited. Please try again later.', 429)

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = DelayMandateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const ip = getClientIP(req)

  const result = await requestDelay(id, parsed.data, session.user.id, session.user.roles ?? [], ip)
  return apiSuccess(result)
})
