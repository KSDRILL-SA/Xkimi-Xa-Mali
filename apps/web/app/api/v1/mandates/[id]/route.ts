import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiRatelimit } from '@/lib/redis'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { getMandate, updateMandate, cancelMandate } from '@/services/mandate.service'
import { UpdateMandateSchema } from '@/lib/validation/mandate'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { id } = await params

  try {
    const mandate = await getMandate(id, session.user.id, session.user.roles ?? [])
    return apiSuccess(mandate)
  } catch (err: unknown) {
    return handleServiceError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { success } = await apiRatelimit.limit(`mandate:${session.user.id}`)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = UpdateMandateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }
  if (!parsed.data.debitDay && !parsed.data.amount) {
    return apiError('VAL_002', 'Provide at least one field to update', 422)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

  try {
    const mandate = await updateMandate(id, parsed.data, session.user.id, session.user.roles ?? [], ip)
    return apiSuccess(mandate)
  } catch (err: unknown) {
    return handleServiceError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { success } = await apiRatelimit.limit(`mandate:${session.user.id}`)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  const { id } = await params
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

  try {
    await cancelMandate(id, session.user.id, session.user.roles ?? [], ip)
    return apiSuccess({ cancelled: true })
  } catch (err: unknown) {
    return handleServiceError(err)
  }
}
