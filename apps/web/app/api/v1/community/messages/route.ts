import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { apiRatelimit, communityPostRatelimit } from '@/lib/redis'
import { getMessages, postMessage } from '@/services/community.service'
import { PostMessageSchema } from '@/lib/validation/community'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')))

  const result = await getMessages(page, limit, session.user.id)
  return apiSuccess(
    { items: result.items, dailyLimit: result.dailyLimit },
    200,
    { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  )
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { success } = await apiRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  // Ten a day, which is what the Founder Guide promises members. The limit
  // above stops a script; this one is the sentence four founders signed.
  const daily = await communityPostRatelimit.limit(session.user.id)
  if (!daily.success) {
    return apiError(
      'SYS_005',
      'You have posted ten times today — that is the daily limit. Come back tomorrow.',
      429,
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('VAL_001', 'Invalid JSON', 400)
  }

  const parsed = PostMessageSchema.safeParse(body)
  if (!parsed.success) return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)

  const message = await postMessage(session.user.id, parsed.data.content, parsed.data.replyToId)
  return apiSuccess(message, 201)
})
