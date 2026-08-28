import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const WEB_URL = process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000'

const nextConfig: NextConfig = {
  transpilePackages: ['@xxm/ui', '@xxm/utils', '@xxm/types', '@xxm/config', '@xxm/observability', 'geist'],
  serverExternalPackages: ['@prisma/client'],
  // Signature uploads (drawn PNGs / images) are sent through a server action;
  // raise the default 1 MB body cap so larger signatures aren't rejected.
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
  // Proxy /api/* calls to the web app so client components work without CORS issues
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${WEB_URL}/api/v1/:path*`,
      },
    ]
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options',           value: 'DENY' },
        { key: 'X-Content-Type-Options',     value: 'nosniff' },
        { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security',  value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            // base-uri and form-action have no default-src fallback — lock both
            // to same-origin to block <base> injection and form hijacking.
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
            `script-src 'self' 'unsafe-inline' https://browser.sentry-cdn.com${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            // Sentry ingestion, or reports are blocked by the policy that is
            // meant to protect this app. `data:` is not a network origin —
            // it's what SignaturePadCard.tsx converts a drawn signature
            // through (`fetch(canvas.toDataURL(...))` into a Blob before
            // upload). Chrome enforces connect-src against `fetch()` calls to
            // data: URIs same as any other origin, so without it here that
            // fetch throws "Failed to fetch" before the signature ever
            // reaches the server action — this is that bug's actual cause.
            `connect-src 'self' data: ${WEB_URL} https://o*.ingest.sentry.io`,
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ],
}

// Explicitly typed so that options a future SDK major removes or renames fail
// the build rather than being silently ignored.
const sentryOptions: Parameters<typeof withSentryConfig>[1] = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
}

// Only wrap in production with a DSN configured — the dev-mode injection loads
// Replay chunks that break hydration, which is why the member portal gates it
// the same way.
const config: NextConfig =
  process.env.NODE_ENV === 'production' &&
  (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN)
    ? withSentryConfig(nextConfig, sentryOptions)
    : nextConfig

export default config
