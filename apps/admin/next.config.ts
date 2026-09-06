import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const WEB_URL = process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000'

const nextConfig: NextConfig = {
  // Next.js advertises itself in an X-Powered-By response header by default.
  // It tells an attacker which framework and therefore which advisories to try
  // first, and buys nothing in return. Off.
  poweredByHeader: false,
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
        // Content-Security-Policy is NOT here. It carries a per-request nonce
        // so an injected <script> cannot execute, and a nonce cannot be a
        // static header — see `buildCsp` in proxy.ts.
        //
        // It used to be here, with `script-src 'unsafe-inline'`, which is the
        // directive that decides whether a policy stops an XSS or merely
        // records that one happened. The member app was moved to a nonce and
        // this console was not, which left the weaker policy on the app that
        // reverses transactions, changes roles and suspends members — the same
        // one-app-not-its-sibling drift the Sentry note above describes.
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
