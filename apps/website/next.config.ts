import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@xxm/ui', '@xxm/utils', '@xxm/config', 'geist'],
  images: {
    formats: ['image/avif', 'image/webp'],
    // Next 16 requires every quality the app asks for to be declared, and warns
    // on each render otherwise. `FoundersBackdrop` uses both: 40 for the blurred
    // backdrop, where detail is thrown away anyway and the saving is real on a
    // 1.6 MB portrait, and 85 for the portrait shown at full size. 75 is Next's
    // default and is kept for anything that does not ask.
    qualities: [40, 75, 85],
    // No remotePatterns: every image the site renders is now served from its own
    // /public. The hero was the last third-party fetch (a stock photo from
    // Unsplash) and it is now the founders' own portraits.
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // base-uri and form-action have no default-src fallback — lock both
              // to same-origin to block <base> injection and form hijacking.
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
