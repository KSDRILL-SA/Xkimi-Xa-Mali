import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMemberDetail, AdminForbiddenError, AdminNotFoundError } from '@/services/admin.service'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  try {
    const member = await getMemberDetail(roles, id)
    return apiSuccess(member)
  } catch (e) {
    if (e instanceof AdminForbiddenError) return apiError(e.code, e.message, 403)
    if (e instanceof AdminNotFoundError)  return apiError(e.code, e.message, 404)
    throw e
  }
}
