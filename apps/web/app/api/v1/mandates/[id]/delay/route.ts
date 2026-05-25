import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requestDelay } from '@/services/mandate.service'
import { DelayMandateSchema } from '@/lib/validation/mandate'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { success } = await apiRatelimit.limit(`mandate:${session.user.id}`)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = DelayMandateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

  try {
    const result = await requestDelay(id, parsed.data, session.user.id, session.user.roles ?? [], ip)
    return apiSuccess(result)
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; status?: number }
    return apiError(e.code ?? 'SYS_500', e.message ?? 'Server error', e.status ?? 500)
  }
}
