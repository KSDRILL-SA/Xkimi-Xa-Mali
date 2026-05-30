import type { NextConfig } from 'next'

const WEB_URL = process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000'

const config: NextConfig = {
  transpilePackages: ['@xxm/ui', '@xxm/utils', '@xxm/types', '@xxm/config'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  // Proxy member/web REST API only — never /api/auth (admin has its own NextAuth)
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
      ],
    },
  ],
}

export default config
