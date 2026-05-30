import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { approveMandate } from '@/services/admin.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const updated = await approveMandate(session.user.id, roles, id, ip)
    return apiSuccess(updated)
  } catch (e) {
    return handleServiceError(e)
  }
}
