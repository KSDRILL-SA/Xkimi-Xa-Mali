import { NextRequest, NextResponse } from 'next/server'
import { verifyEmail } from '@/services/auth.service'
import { apiError } from '@/lib/api-response'
import { isAppError } from '@/lib/errors'
import { verifyEmailRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (req: NextRequest) => {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return apiError('SYS_001', 'Verification token is required.', 400)

  const ip = getClientIP(req) ?? 'unknown'

  const { success } = await verifyEmailRatelimit.limit(ip)
  if (!success) return NextResponse.redirect(new URL('/login?error=rate_limited', req.url))

  try {
    await verifyEmail(token, ip)
    return NextResponse.redirect(new URL('/login?verified=1', req.url))
  } catch (err) {
    if (isAppError(err) && err.code === 'AUTH_004') {
      return NextResponse.redirect(new URL('/login?error=invalid_token', req.url))
    }
    return NextResponse.redirect(new URL('/login?error=server', req.url))
  }
})
