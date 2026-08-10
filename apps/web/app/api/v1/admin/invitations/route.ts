import { NextRequest } from 'next/server'
import { isValidSAId } from '@xxm/utils/sa-id'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminInviteRatelimit } from '@/lib/redis'
import {
  generateInvite, listInvitations,
} from '@/services/invite.service'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

const SA_PHONE = /^(\+27|0)[6-8][0-9]{8}$/

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  const result = await listInvitations(roles, page, limit)
  return apiSuccess(result.items, 200, {
    page: result.page, limit: result.limit,
    total: result.total, totalPages: result.totalPages,
  })
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const isTrusted = isValidInternalRequest(req)
  const session   = isTrusted ? null : await auth()
  if (!isTrusted && !session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  // On the trusted server-to-server path the admin app forwards the acting
  // admin's real user id. It is required because invitedById is a FK to User —
  // and confirmed against the database rather than believed, so an invitation
  // cannot be recorded against someone who never sent it, or against an admin
  // who has since been demoted.
  const adminId = isTrusted ? await resolveInternalAdmin(req) : session!.user.id
  if (!adminId) return apiError('SYS_002', 'Missing or unrecognised admin identity', 401)
  const roles   = isTrusted ? ['ADMIN'] : (session!.user.roles as string[] | undefined) ?? []

  const rlKey = isTrusted ? 'internal-admin-invite' : adminId
  const { success } = await adminInviteRatelimit.limit(rlKey)
  if (!success) return apiError('SYS_005', 'Too many invitations. Please try again later.', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const b = body as Record<string, unknown>

  if (typeof b.firstName !== 'string' || b.firstName.trim().length < 2)
    return apiError('VAL_002', '"firstName" must be at least 2 characters', 400)
  if (typeof b.lastName !== 'string' || b.lastName.trim().length < 2)
    return apiError('VAL_003', '"lastName" must be at least 2 characters', 400)
  if (typeof b.email !== 'string' || !b.email.includes('@'))
    return apiError('VAL_004', '"email" must be a valid email address', 400)
  // Required and checked here, because this is the identity leadership is
  // vouching for and the member will be asked to confirm it.
  if (typeof b.idNumber !== 'string' || !isValidSAId(b.idNumber.trim()))
    return apiError('VAL_007', '"idNumber" must be a valid 13-digit SA ID number', 400)
  if (typeof b.phone !== 'string' || !SA_PHONE.test(b.phone))
    return apiError('VAL_005', '"phone" must be a valid SA mobile number', 400)
  const minAmt = Number(b.minimumAmount)
  if (!Number.isFinite(minAmt) || minAmt < 100)
    return apiError('VAL_006', '"minimumAmount" must be at least 100', 400)

  const baseUrl = new URL(req.url).origin
  const ip      = getClientIP(req)

  const result = await generateInvite(
    adminId,
    roles,
    {
      firstName:     b.firstName.trim(),
      lastName:      b.lastName.trim(),
      email:         (b.email as string).toLowerCase().trim(),
      phone:         b.phone as string,
      idNumber: String(b.idNumber ?? ''),
      vouchedFor: typeof b.vouchedFor === 'string' ? b.vouchedFor : undefined,
      minimumAmount: minAmt,
    },
    baseUrl,
    ip,
  )
  return apiSuccess(result, 201)
})
