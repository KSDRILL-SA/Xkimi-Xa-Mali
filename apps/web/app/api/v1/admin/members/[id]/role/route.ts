import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { setMemberRole } from '@/services/invite.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const b = body as Record<string, unknown>
  if (b.role !== 'ADMIN' && b.role !== 'MEMBER')
    return apiError('VAL_002', '"role" must be ADMIN or MEMBER', 400)
  if (typeof b.assign !== 'boolean')
    return apiError('VAL_003', '"assign" must be a boolean', 400)

  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const result = await setMemberRole(session.user.id, roles, id, b.role, b.assign, ip)
    return apiSuccess(result)
  } catch (e) {
    return handleServiceError(e)
  }
}
