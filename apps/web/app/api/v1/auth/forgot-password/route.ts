import { NextRequest } from 'next/server'
import { PasswordResetRequestSchema as Schema } from '@/lib/validation/auth'
import { forgotPasswordRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requestPasswordReset } from '@/services/auth.service'


export async function POST(req: NextRequest) {
  const ip = getClientIP(req) ?? 'unknown'

  const { success } = await forgotPasswordRatelimit.limit(ip)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', 'A valid email address is required.', 400)

  try {
    const baseUrl = new URL(req.url).origin
    await requestPasswordReset(parsed.data.email, baseUrl, ip)
  } catch {
    // Swallow all errors — never reveal if email exists
  }

  return apiSuccess({ message: 'If that email is registered, a reset link has been sent.' })
}
