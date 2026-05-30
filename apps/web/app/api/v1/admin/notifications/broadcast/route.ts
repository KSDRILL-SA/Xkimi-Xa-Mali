import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { env } from '@/lib/env'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { broadcastNotification } from '@/services/admin.service'
import type { BroadcastChannel, BroadcastFilter } from '@/services/admin.service'

const VALID_CHANNELS: BroadcastChannel[] = ['SMS', 'EMAIL', 'BOTH']
const VALID_FILTERS: BroadcastFilter[]  = ['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED']

export async function POST(req: NextRequest) {
  // Allow trusted internal requests from the admin app via shared secret
  const incomingSecret = req.headers.get('x-admin-secret')
  const isTrustedInternal = env.ADMIN_API_SECRET && incomingSecret === env.ADMIN_API_SECRET

  const session = await auth()
  const roles = (session?.user?.roles as string[] | undefined) ?? []

  if (!isTrustedInternal) {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!roles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
  }

  const adminId = isTrustedInternal ? (session?.user?.id ?? 'system') : session!.user.id
  const adminRoles = isTrustedInternal ? ['ADMIN'] : roles

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
      adminId, adminRoles,
      message.trim(), channel as BroadcastChannel, resolvedFilter, ip,
    )
    return apiSuccess(result)
  } catch (e) {
    return handleServiceError(e)
  }
}
