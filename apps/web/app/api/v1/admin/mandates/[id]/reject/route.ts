import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { rejectMandate, AdminForbiddenError, AdminNotFoundError, AdminConflictError } from '@/services/admin.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const updated = await rejectMandate(session.user.id, roles, id, ip)
    return apiSuccess(updated)
  } catch (e) {
    if (e instanceof AdminForbiddenError) return apiError(e.code, e.message, 403)
    if (e instanceof AdminNotFoundError)  return apiError(e.code, e.message, 404)
    if (e instanceof AdminConflictError)  return apiError(e.code, e.message, 409)
    throw e
  }
}
