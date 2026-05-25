import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = ['/', '/whatsapp', '/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password']
const ADMIN_PREFIX = '/admin'
const MEMBER_PREFIX = '/dashboard'
const WEBHOOK_PREFIX = '/api/v1/webhooks'
const HEALTH_PATH = '/api/v1/health'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Health check and webhooks: always public (webhooks validate their own signatures)
  if (pathname === HEALTH_PATH || pathname.startsWith(WEBHOOK_PREFIX)) {
    return NextResponse.next()
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p) || pathname.startsWith('/auth/')
  if (isPublic) return NextResponse.next()

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes require ADMIN role
  if (pathname.startsWith(ADMIN_PREFIX) || pathname.startsWith('/api/v1/admin')) {
    const roles = token.roles as string[] | undefined
    if (!roles?.includes('ADMIN')) {
      return NextResponse.json({ error: { code: 'SYS_003', message: 'Forbidden', traceId: '' } }, { status: 403 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)',
  ],
}
