import { NextRequest } from 'next/server'
import { authRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  validateInviteCode,
  InviteNotFoundError, InviteUsedError, InviteRevokedError, InviteExpiredError,
} from '@/services/invite.service'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  const { success } = await authRatelimit.limit(ip)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const code = (body as Record<string, unknown>).code
  if (typeof code !== 'string' || !code.trim())
    return apiError('VAL_002', '"code" is required', 400)

  try {
    const result = await validateInviteCode(code.trim().toUpperCase())
    return apiSuccess(result)
  } catch (e) {
    if (e instanceof InviteNotFoundError) return apiError(e.code, e.message, 400)
    if (e instanceof InviteUsedError)     return apiError(e.code, e.message, 400)
    if (e instanceof InviteRevokedError)  return apiError(e.code, e.message, 400)
    if (e instanceof InviteExpiredError)  return apiError(e.code, e.message, 400)
    throw e
  }
}
