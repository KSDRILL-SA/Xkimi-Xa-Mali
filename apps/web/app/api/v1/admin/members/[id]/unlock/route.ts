import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { unlockMember } from '@/services/admin.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = session.user.roles as string[] | undefined
  if (!roles?.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const result = await unlockMember(session.user.id, roles, id, ip)
    return apiSuccess(result)
  } catch (err) {
    return handleServiceError(err)
  }
}
