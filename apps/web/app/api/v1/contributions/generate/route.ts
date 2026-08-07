import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { generateMonthlyContributions } from '@/services/contribution.service'
import { GenerateContributionsSchema } from '@/lib/validation/contribution'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  if (!session.user.roles?.includes('ADMIN')) {
    return apiError('SYS_003', 'Admin access required', 403)
  }

  const body = await req.json().catch(() => null)
  const parsed = GenerateContributionsSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const result = await generateMonthlyContributions(
    parsed.data,
    session.user.id,
    session.user.roles ?? [],
  )
  return apiSuccess(result, 201)
})
