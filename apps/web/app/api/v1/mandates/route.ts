import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { mandateRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMandates, createMandate } from '@/services/mandate.service'
import { CreateMandateSchema } from '@/lib/validation/mandate'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? session.user.id

  const mandates = await getMandates(userId, session.user.id, session.user.roles ?? [])
  return apiSuccess(mandates)
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { success } = await mandateRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Mandate operations are limited. Please try again later.', 429)

  const body = await req.json().catch(() => null)
  const parsed = CreateMandateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

  const mandate = await createMandate(
    session.user.id,
    parsed.data,
    session.user.id,
    session.user.roles ?? [],
    ip,
  )
  return apiSuccess(mandate, 201)
})
