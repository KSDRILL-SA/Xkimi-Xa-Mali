import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { mandateRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMandate, updateMandate, cancelMandate } from '@/services/mandate.service'
import { UpdateMandateSchema } from '@/lib/validation/mandate'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const GET = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { id } = await params

  const mandate = await getMandate(id, session.user.id, session.user.roles ?? [])
  return apiSuccess(mandate)
})

export const PATCH = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { success } = await mandateRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Mandate operations are limited. Please try again later.', 429)

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = UpdateMandateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }
  if (!parsed.data.debitDay && !parsed.data.amount) {
    return apiError('VAL_002', 'Provide at least one field to update', 422)
  }

  const ip = getClientIP(req)

  const mandate = await updateMandate(id, parsed.data, session.user.id, session.user.roles ?? [], ip)
  return apiSuccess(mandate)
})

export const DELETE = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { success } = await mandateRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Mandate operations are limited. Please try again later.', 429)

  const { id } = await params
  const ip = getClientIP(req)

  await cancelMandate(id, session.user.id, session.user.roles ?? [], ip)
  return apiSuccess({ cancelled: true })
})
