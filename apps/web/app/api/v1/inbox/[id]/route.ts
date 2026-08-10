import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { markInboxRead, deleteInboxMessage } from '@/services/inbox.service'
import { withApiHandler } from '@/lib/api-handler'

export const PATCH = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  // 404 rather than 403 when the message is not theirs. Both "no such message"
  // and "not yours" answer the same way, so nothing here tells a caller whether
  // an id they do not own exists — the same choice the goal-plan routes make.
  const read = await markInboxRead(session.user.id, id)
  if (!read) return apiError('INB_001', 'Message not found', 404)
  return apiSuccess({ read: true })
})

export const DELETE = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  const deleted = await deleteInboxMessage(session.user.id, id)
  if (!deleted) return apiError('INB_001', 'Message not found', 404)
  return apiSuccess({ deleted: true })
})
