import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { adminInviteRatelimit } from '@/lib/redis'
import {
  generateInvite, listInvitations,
} from '@/services/invite.service'

const SA_PHONE = /^(\+27|0)[6-8][0-9]{8}$/

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  try {
    const result = await listInvitations(roles, page, limit)
    return apiSuccess(result.items, 200, {
      page: result.page, limit: result.limit,
      total: result.total, totalPages: result.totalPages,
    })
  } catch (e) {
    return handleServiceError(e)
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { success } = await adminInviteRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Too many invitations. Please try again later.', 429)

  const roles = (session.user.roles as string[] | undefined) ?? []

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const b = body as Record<string, unknown>

  if (typeof b.firstName !== 'string' || b.firstName.trim().length < 2)
    return apiError('VAL_002', '"firstName" must be at least 2 characters', 400)
  if (typeof b.lastName !== 'string' || b.lastName.trim().length < 2)
    return apiError('VAL_003', '"lastName" must be at least 2 characters', 400)
  if (typeof b.email !== 'string' || !b.email.includes('@'))
    return apiError('VAL_004', '"email" must be a valid email address', 400)
  if (typeof b.phone !== 'string' || !SA_PHONE.test(b.phone))
    return apiError('VAL_005', '"phone" must be a valid SA mobile number', 400)
  const minAmt = Number(b.minimumAmount)
  if (!Number.isFinite(minAmt) || minAmt < 100)
    return apiError('VAL_006', '"minimumAmount" must be at least 100', 400)

  const baseUrl = new URL(req.url).origin
  const ip      = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const result = await generateInvite(
      session.user.id,
      roles,
      {
        firstName:     b.firstName.trim(),
        lastName:      b.lastName.trim(),
        email:         (b.email as string).toLowerCase().trim(),
        phone:         b.phone as string,
        minimumAmount: minAmt,
      },
      baseUrl,
      ip,
    )
    return apiSuccess(result, 201)
  } catch (e) {
    return handleServiceError(e)
  }
}
