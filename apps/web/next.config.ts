import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  transpilePackages: ['@xxm/ui', '@xxm/utils', '@xxm/types', '@xxm/config', '@xxm/observability', 'geist'],
  typedRoutes: true,
  serverExternalPackages: ['@prisma/client'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        // Service worker must be served from root scope
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // Content-Security-Policy is NOT here. It carries a per-request nonce so
          // that inline scripts do not need 'unsafe-inline', and a nonce cannot be
          // expressed in static config — middleware.ts builds and sets it. Adding a
          // second CSP header here would not relax that one, it would intersect
          // with it, and the nonced scripts would be blocked.
        ],
      },
    ]
  },
}

// Explicitly typed so that options a future SDK major removes or renames fail
// the build rather than being silently ignored. An untyped object literal
// assigned to a variable skips excess-property checking, which is how the
// now-removed `hideSourceMaps` kept type-checking while doing nothing.
const sentryOptions: Parameters<typeof withSentryConfig>[1] = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  // `hideSourceMaps` was removed in v10. Source maps are now deleted from the
  // build output after upload by default (sourcemaps.deleteSourcemapsAfterUpload),
  // so they are still never served publicly.
  webpack: {
    // Replaces the deprecated top-level `disableLogger`.
    treeshake: { removeDebugLogging: true },
    // Replaces the deprecated top-level `automaticVercelMonitors`.
    automaticVercelMonitors: true,
  },
}

let config: NextConfig = nextConfig

// Only wrap with Sentry in production when DSN is configured — dev injection
// loads Replay chunks that crash member-portal hydration in webpack dev mode.
if (
  process.env.NODE_ENV === 'production' &&
  (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN)
) {
  config = withSentryConfig(nextConfig, sentryOptions)
}

// Bundle analyser — run with ANALYZE=true next build
if (process.env.ANALYZE === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: true })
  config = withBundleAnalyzer(config)
}

export default config
