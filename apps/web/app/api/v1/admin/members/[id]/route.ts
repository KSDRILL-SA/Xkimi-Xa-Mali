import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { getMemberDetail } from '@/services/admin.service'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  try {
    const member = await getMemberDetail(roles, id)
    return apiSuccess(member)
  } catch (e) {
    return handleServiceError(e)
  }
}
