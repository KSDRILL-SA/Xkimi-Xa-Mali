import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { createReversal } from '@/services/contribution.service'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

  const reversal = await createReversal(id, session.user.id, roles, ip)
  return apiSuccess(reversal, 201)
})
