import { NextRequest, NextResponse } from 'next/server'
import { verifyEmail } from '@/services/auth.service'
import { apiError } from '@/lib/api-response'
import { isAppError } from '@/lib/errors'
import { verifyEmailRatelimit } from '@/lib/redis'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return apiError('SYS_001', 'Verification token is required.', 400)

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  const { success } = await verifyEmailRatelimit.limit(ip)
  if (!success) return NextResponse.redirect(new URL('/auth/login?error=rate_limited', req.url))

  try {
    await verifyEmail(token, ip)
    return NextResponse.redirect(new URL('/auth/login?verified=1', req.url))
  } catch (err) {
    if (isAppError(err) && err.code === 'AUTH_004') {
      return NextResponse.redirect(new URL('/auth/login?error=invalid_token', req.url))
    }
    return NextResponse.redirect(new URL('/auth/login?error=server', req.url))
  }
}
