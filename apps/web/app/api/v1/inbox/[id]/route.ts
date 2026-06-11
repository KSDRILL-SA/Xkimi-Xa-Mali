import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { markInboxRead, deleteInboxMessage } from '@/services/inbox.service'
import { withApiHandler } from '@/lib/api-handler'

export const PATCH = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  await markInboxRead(session.user.id, id)
  return apiSuccess({ read: true })
})

export const DELETE = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  await deleteInboxMessage(session.user.id, id)
  return apiSuccess({ deleted: true })
})
