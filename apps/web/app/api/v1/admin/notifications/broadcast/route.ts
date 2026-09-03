import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminBroadcastRatelimit } from '@/lib/redis'
import { broadcastNotification } from '@/services/admin.service'
import type { BroadcastChannel, BroadcastFilter } from '@/services/admin.service'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

const VALID_CHANNELS: BroadcastChannel[] = ['SMS', 'EMAIL', 'BOTH', 'IN_APP']
const VALID_FILTERS: BroadcastFilter[]  = ['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED']

export const POST = withApiHandler(async (req: NextRequest) => {
  const isTrustedInternal = isValidInternalRequest(req)

  const session = await auth()
  const roles = (session?.user?.roles as string[] | undefined) ?? []

  if (!isTrustedInternal) {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!roles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
  }

  // On the internal path there is no session — the admin console calls this
  // server to server, without cookies — so `session?.user?.id` is always
  // undefined and the old fallback made `adminId` the literal string 'system'.
  // That string was then written as `inbox_messages.createdById` and as the
  // audit log's `userId`, both of which are foreign keys to `users.id`. No user
  // has that id, so **every** broadcast sent from the console failed on a
  // foreign key violation: the in-app one before anything was delivered, and
  // SMS or email *after* the messages had gone out and been charged for, losing
  // the audit record of a broadcast that had actually been sent.
  //
  // `resolveInternalAdmin` is what every other trusted route already uses. It
  // reads the forwarded id and confirms it belongs to a live admin, so the
  // broadcast is recorded against the person who sent it.
  let adminId: string
  if (isTrustedInternal) {
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted request must name a current admin', 400)
    }
    adminId = forwarded
  } else {
    adminId = session!.user.id
  }
  const adminRoles = isTrustedInternal ? ['ADMIN'] : roles

  const { success } = await adminBroadcastRatelimit.limit(adminId)
  if (!success) return apiError('SYS_005', 'Broadcast rate limit exceeded. Please try again later.', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const { message, channel, filter, subject } = body as Record<string, unknown>

  if (typeof message !== 'string' || message.trim().length < 5)
    return apiError('VAL_002', '"message" must be at least 5 characters', 400)
  // Required, and long enough to say something. It becomes the email subject
  // and the inbox title, which are the only parts most members read before
  // deciding whether to open it.
  if (typeof subject !== 'string' || subject.trim().length < 3)
    return apiError('VAL_002', '"subject" must be at least 3 characters', 400)
  if (subject.trim().length > 120)
    return apiError('VAL_002', '"subject" cannot exceed 120 characters', 400)
  if (!VALID_CHANNELS.includes(channel as BroadcastChannel))
    return apiError('VAL_003', `"channel" must be one of: ${VALID_CHANNELS.join(', ')}`, 400)

  const resolvedFilter: BroadcastFilter = VALID_FILTERS.includes(filter as BroadcastFilter)
    ? (filter as BroadcastFilter)
    : 'ALL'

  const ip = getClientIP(req)

  const result = await broadcastNotification(
    adminId, adminRoles,
    message.trim(), channel as BroadcastChannel, resolvedFilter, ip, subject.trim(),
  )
  return apiSuccess(result)
})
