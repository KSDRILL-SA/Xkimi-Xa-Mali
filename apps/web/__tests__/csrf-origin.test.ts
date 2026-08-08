import { describe, it, expect } from 'vitest'
import { buildAllowedOrigins, verifyCsrfOrigin } from '@xxm/utils/csrf-origin'

function req(
  url: string,
  headers: Record<string, string> = {},
): { headers: Headers; nextUrl: URL } {
  const h = new Headers(headers)
  return { headers: h, nextUrl: new URL(url) }
}

describe('buildAllowedOrigins', () => {
  it('always includes the request host origin', () => {
    const allowed = buildAllowedOrigins(
      req('http://143.160.234.184:3000/api/v1/members/1'),
      { nextAuthUrl: 'http://localhost:3000', nodeEnv: 'production' },
    )
    expect(allowed.has('http://143.160.234.184:3000')).toBe(true)
  })

  it('adds localhost loopback aliases in development', () => {
    const allowed = buildAllowedOrigins(
      req('http://localhost:3000/api/v1/members/1'),
      { nextAuthUrl: 'http://localhost:3000', nodeEnv: 'development' },
    )
    expect(allowed.has('http://localhost:3000')).toBe(true)
    expect(allowed.has('http://127.0.0.1:3000')).toBe(true)
  })
})

describe('verifyCsrfOrigin', () => {
  it('accepts origin matching the request host even when NEXTAUTH_URL differs', () => {
    const ok = verifyCsrfOrigin(
      req('http://143.160.234.184:3000/api/v1/members/1', {
        origin: 'http://143.160.234.184:3000',
      }),
      { nextAuthUrl: 'http://localhost:3000', nodeEnv: 'production' },
    )
    expect(ok).toBe(true)
  })

  it('accepts localhost origin against 127.0.0.1 NEXTAUTH_URL in development', () => {
    const ok = verifyCsrfOrigin(
      req('http://localhost:3000/api/v1/members/1', {
        origin: 'http://localhost:3000',
      }),
      { nextAuthUrl: 'http://127.0.0.1:3000', nodeEnv: 'development' },
    )
    expect(ok).toBe(true)
  })

  it('rejects cross-origin requests', () => {
    const ok = verifyCsrfOrigin(
      req('http://localhost:3000/api/v1/members/1', {
        origin: 'https://evil.example',
      }),
      { nextAuthUrl: 'http://localhost:3000', nodeEnv: 'production' },
    )
    expect(ok).toBe(false)
  })

  it('falls back to Referer when Origin is absent', () => {
    const ok = verifyCsrfOrigin(
      req('http://localhost:3000/api/v1/members/1', {
        referer: 'http://localhost:3000/profile/personal',
      }),
      { nextAuthUrl: 'http://localhost:3000', nodeEnv: 'production' },
    )
    expect(ok).toBe(true)
  })

  it('rejects when both Origin and Referer are missing or invalid', () => {
    const ok = verifyCsrfOrigin(
      req('http://localhost:3000/api/v1/members/1'),
      { nextAuthUrl: 'http://localhost:3000', nodeEnv: 'production' },
    )
    expect(ok).toBe(false)
  })
})
