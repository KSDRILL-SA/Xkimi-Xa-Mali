import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { bulkGenerateContributions } from '@/services/admin.service'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const { month, year } = body as Record<string, unknown>

  if (typeof month !== 'number' || month < 1 || month > 12)
    return apiError('VAL_002', '"month" must be 1-12', 400)
  if (typeof year !== 'number' || year < 2024)
    return apiError('VAL_003', '"year" must be ≥ 2024', 400)

  const ip = req.headers.get('x-forwarded-for') ?? undefined

  const result = await bulkGenerateContributions(session.user.id, roles, month, year, ip)
  return apiSuccess(result, 201)
})
