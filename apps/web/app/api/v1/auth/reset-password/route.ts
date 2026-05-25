import { NextRequest } from 'next/server'
import { PasswordResetSchema } from '@/lib/validation/auth'
import { authRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { resetPassword } from '@/services/auth.service'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  const { success } = await authRatelimit.limit(`resetpw:${ip}`)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = PasswordResetSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  try {
    await resetPassword(parsed.data.token, parsed.data.password, ip)
    return apiSuccess({ message: 'Password reset successful. You can now log in.' })
  } catch (err) {
    const e = err as { code?: string }
    if (e.code === 'AUTH_004') return apiError('AUTH_004', 'This reset link is invalid or has expired.', 400)
    return apiError('SYS_004', 'Password reset failed. Please try again.', 500)
  }
}
