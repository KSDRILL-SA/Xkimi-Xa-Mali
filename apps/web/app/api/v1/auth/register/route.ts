import { NextRequest } from 'next/server'
import { RegisterSchema } from '@/lib/validation/auth'
import { authRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { registerUser } from '@/services/auth.service'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  const { success } = await authRatelimit.limit(ip)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = RegisterSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('SYS_001', parsed.error.errors[0].message, 400)
  }

  try {
    const baseUrl = new URL(req.url).origin
    const result = await registerUser(parsed.data, baseUrl, ip)
    return apiSuccess(
      { message: 'Registration successful. Please check your email to verify your account.', userId: result.id },
      201,
    )
  } catch (err) {
    const e = err as { code?: string; field?: string; message: string }
    if (e.code === 'MBR_002') {
      return apiError('MBR_002', `An account with this ${e.field ?? 'email'} already exists.`, 409)
    }
    console.error('[register]', e)
    return apiError('SYS_004', 'Registration failed. Please try again.', 500)
  }
}
