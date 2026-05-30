import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { broadcastNotification } from '@/services/admin.service'
import type { BroadcastChannel, BroadcastFilter } from '@/services/admin.service'

const VALID_CHANNELS: BroadcastChannel[] = ['SMS', 'EMAIL', 'BOTH']
const VALID_FILTERS: BroadcastFilter[]  = ['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED']

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const { message, channel, filter } = body as Record<string, unknown>

  if (typeof message !== 'string' || message.trim().length < 5)
    return apiError('VAL_002', '"message" must be at least 5 characters', 400)
  if (!VALID_CHANNELS.includes(channel as BroadcastChannel))
    return apiError('VAL_003', `"channel" must be one of: ${VALID_CHANNELS.join(', ')}`, 400)

  const resolvedFilter: BroadcastFilter = VALID_FILTERS.includes(filter as BroadcastFilter)
    ? (filter as BroadcastFilter)
    : 'ALL'

  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const result = await broadcastNotification(
      session.user.id, roles,
      message.trim(), channel as BroadcastChannel, resolvedFilter, ip,
    )
    return apiSuccess(result)
  } catch (e) {
    return handleServiceError(e)
  }
}
