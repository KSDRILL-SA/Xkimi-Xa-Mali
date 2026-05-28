import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

const WEBHOOK_PREFIX = '/api/v1/webhooks'
const HEALTH_PATH = '/api/v1/health'
const AUTH_PREFIX = '/api/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Always allow: health, webhooks (self-verifying), NextAuth internals, SW + offline
  if (
    pathname === HEALTH_PATH ||
    pathname === '/offline' ||
    pathname === '/sw.js' ||
    pathname.startsWith(WEBHOOK_PREFIX) ||
    pathname.startsWith(AUTH_PREFIX)
  ) {
    return NextResponse.next()
  }

  const session = req.auth

  // Public routes — no session required
  const isPublicPage =
    pathname === '/' ||
    pathname === '/about' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/support' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/verify-email' ||
    pathname.startsWith('/invite/')

  const isPublicApi =
    pathname === '/api/v1/auth/register' ||
    pathname === '/api/v1/auth/forgot-password' ||
    pathname === '/api/v1/auth/reset-password' ||
    pathname === '/api/v1/auth/verify-email' ||
    pathname === '/api/v1/auth/invitations/validate'

  if (isPublicPage || isPublicApi) {
    // Redirect already-authed users away from auth pages
    if (session && (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // All other routes require a session
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'SYS_002', message: 'Unauthorised', traceId: '' } },
        { status: 401 },
      )
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Admin routes require ADMIN role
  const isAdminRoute =
    pathname.startsWith('/admin') || pathname.startsWith('/api/v1/admin')

  if (isAdminRoute) {
    const roles = session.user?.roles as string[] | undefined
    if (!roles?.includes('ADMIN')) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: { code: 'SYS_003', message: 'Forbidden', traceId: '' } },
          { status: 403 },
        )
      }
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw\\.js).*)'],
}
