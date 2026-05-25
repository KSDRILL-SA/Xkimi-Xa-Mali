import { NextRequest } from 'next/server'
import { z } from 'zod'
import { authRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requestPasswordReset } from '@/services/auth.service'

const Schema = z.object({ email: z.string().email() })

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  const { success } = await authRatelimit.limit(`reset:${ip}`)
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
