import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { deleteMessage, editMessage } from '@/services/community.service'
import { withApiHandler } from '@/lib/api-handler'

export const PATCH = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }
  const content = (body as { content?: unknown }).content
  if (typeof content !== 'string') return apiError('VAL_002', '"content" is required', 400)

  const updated = await editMessage(session.user.id, id, content)
  return apiSuccess(updated)
})

export const DELETE = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  await deleteMessage(session.user.id, id, session.user.roles ?? [])
  return apiSuccess({ deleted: true })
})
