import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { setMemberStatus } from '@/services/admin.service'
import { withApiHandler } from '@/lib/api-handler'

const VALID_STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING'] as const
type UserStatus = typeof VALID_STATUSES[number]

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
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

  const updated = await setMemberStatus(session.user.id, roles, id, status as UserStatus, ip)
  return apiSuccess(updated)
})
