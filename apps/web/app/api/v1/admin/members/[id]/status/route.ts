import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { setMemberStatus, AdminForbiddenError, AdminNotFoundError, AdminConflictError } from '@/services/admin.service'

const VALID_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING'] as const
type UserStatus = typeof VALID_STATUSES[number]

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const status = (body as Record<string, unknown>).status as string
  if (!VALID_STATUSES.includes(status as UserStatus)) {
    return apiError('VAL_002', `status must be one of: ${VALID_STATUSES.join(', ')}`, 400)
  }

  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const updated = await setMemberStatus(session.user.id, roles, id, status as UserStatus, ip)
    return apiSuccess(updated)
  } catch (e) {
    if (e instanceof AdminForbiddenError) return apiError(e.code, e.message, 403)
    if (e instanceof AdminNotFoundError)  return apiError(e.code, e.message, 404)
    if (e instanceof AdminConflictError)  return apiError(e.code, e.message, 409)
    throw e
  }
}
