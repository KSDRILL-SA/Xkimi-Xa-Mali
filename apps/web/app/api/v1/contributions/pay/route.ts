import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { paymentRatelimit } from '@/lib/redis'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { submitManualPayment } from '@/services/contribution.service'
import { ManualContributionSchema } from '@/lib/validation/contribution'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  if (!env.ENABLE_MANUAL_PAYMENTS) {
    return apiError('SYS_006', 'Manual payments are currently disabled', 403)
  }

  const { success } = await paymentRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Payment limit reached. Please try again later.', 429)

  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  if (origin && referer) {
    const allowed = env.NEXTAUTH_URL ? new URL(env.NEXTAUTH_URL).origin : null
    if (allowed && origin !== allowed) {
      return apiError('SYS_007', 'Invalid request origin', 403)
    }
  }

  const body = await req.json().catch(() => null)
  const parsed = ManualContributionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

  try {
    const result = await submitManualPayment(
      session.user.id,
      parsed.data,
      session.user.id,
      session.user.roles ?? [],
      ip,
    )
    return apiSuccess(result, 201)
  } catch (err: unknown) {
    return handleServiceError(err)
  }
}
