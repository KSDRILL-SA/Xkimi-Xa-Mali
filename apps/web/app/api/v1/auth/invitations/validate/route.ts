import { NextRequest } from 'next/server'
import { authRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { apiSuccess, apiError } from '@/lib/api-response'
import { validateInviteCode } from '@/services/invite.service'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIP(req) ?? 'unknown'

  const { success } = await authRatelimit.limit(ip)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const code = (body as Record<string, unknown>).code
  if (typeof code !== 'string' || !code.trim())
    return apiError('VAL_002', '"code" is required', 400)

  const result = await validateInviteCode(code.trim().toUpperCase())
  return apiSuccess(result)
})
