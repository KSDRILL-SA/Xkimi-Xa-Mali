import type { NextConfig } from 'next'

const WEB_URL = process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000'

const config: NextConfig = {
  transpilePackages: ['@xxm/ui', '@xxm/utils', '@xxm/types', '@xxm/config'],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
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
            `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self'",
            `connect-src 'self' ${WEB_URL}`,
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ],
}

export default config
