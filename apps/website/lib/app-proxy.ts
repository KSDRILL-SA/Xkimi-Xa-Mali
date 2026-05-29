/** App routes served by @xxm/web — proxied in local unified dev (single localhost). */
export const APP_PROXY_ROUTES = [
  '/api/:path*',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/dashboard/:path*',
  '/admin/:path*',
  '/invite/:path*',
  '/privacy',
  '/terms',
  '/support',
  '/offline',
  '/sw.js',
  '/manifest.webmanifest',
  '/icons/:path*',
] as const

export function buildAppRewrites(appOrigin: string) {
  const base = appOrigin.replace(/\/$/, '')
  return APP_PROXY_ROUTES.map((source) => ({
    source,
    destination: `${base}${source}`,
  }))
}
