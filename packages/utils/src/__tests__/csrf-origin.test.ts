import { describe, it, expect } from 'vitest'
import { buildAllowedOrigins, verifyCsrfOrigin, type CsrfRequest } from '../csrf-origin'

/**
 * Builds the shape `verifyCsrfOrigin` consumes.
 *
 * `nextUrl` is deliberately settable apart from the headers: the whole bug this
 * suite covers is the case where the URL the framework reconstructs internally
 * disagrees with the origin the browser actually used.
 */
function req(opts: {
  nextUrl: string
  origin?: string
  referer?: string
  forwardedHost?: string
  forwardedProto?: string
}): CsrfRequest {
  const headers = new Headers()
  if (opts.origin) headers.set('origin', opts.origin)
  if (opts.referer) headers.set('referer', opts.referer)
  if (opts.forwardedHost) headers.set('x-forwarded-host', opts.forwardedHost)
  if (opts.forwardedProto) headers.set('x-forwarded-proto', opts.forwardedProto)
  return { headers, nextUrl: new URL(opts.nextUrl) }
}

const PUBLIC = 'https://member.xkimixamali.co.za'

describe('verifyCsrfOrigin — same-origin requests', () => {
  it('accepts a request whose Origin matches the request URL', () => {
    expect(verifyCsrfOrigin(req({ nextUrl: `${PUBLIC}/api/v1/members/x`, origin: PUBLIC }), {})).toBe(true)
  })

  it('falls back to Referer when Origin is absent', () => {
    expect(
      verifyCsrfOrigin(req({ nextUrl: `${PUBLIC}/api/v1/members/x`, referer: `${PUBLIC}/dashboard/profile` }), {}),
    ).toBe(true)
  })
})

describe('verifyCsrfOrigin — behind a reverse proxy (the reported bug)', () => {
  // The real production shape: the browser posts to the public domain, but the
  // framework reconstructs the request URL from the *internal* hop, so
  // `nextUrl.origin` is not the public origin at all.
  const internal = 'http://localhost:3000/api/v1/members/x'

  it('accepts the browser origin when x-forwarded-host reports the public host', () => {
    const request = req({
      nextUrl: internal,
      origin: PUBLIC,
      forwardedHost: 'member.xkimixamali.co.za',
      forwardedProto: 'https',
    })
    expect(verifyCsrfOrigin(request, {})).toBe(true)
  })

  it('defaults the forwarded scheme to https when x-forwarded-proto is absent', () => {
    // The internal hop is plain http here; the browser's Origin is https. Without
    // defaulting to https the reconstructed origin would be http:// and miss.
    const request = req({ nextUrl: internal, origin: PUBLIC, forwardedHost: 'member.xkimixamali.co.za' })
    expect(verifyCsrfOrigin(request, {})).toBe(true)
  })

  it('REGRESSION: without the forwarded host it would have been refused', () => {
    // This is the exact failure the owner hit — profile update, admin
    // broadcast, admin sign-out. Proves the new header is what fixes it,
    // rather than the test merely passing for some unrelated reason.
    const request = req({ nextUrl: internal, origin: PUBLIC })
    expect(verifyCsrfOrigin(request, {})).toBe(false)
  })

  it('still accepts via NEXTAUTH_URL when that is configured correctly', () => {
    const request = req({ nextUrl: internal, origin: PUBLIC })
    expect(verifyCsrfOrigin(request, { nextAuthUrl: PUBLIC })).toBe(true)
  })
})

describe('verifyCsrfOrigin — genuine cross-origin attempts are still refused', () => {
  it('refuses a mismatched Origin even with a forwarded host present', () => {
    const request = req({
      nextUrl: 'http://localhost:3000/api/v1/members/x',
      origin: 'https://evil.example.com',
      forwardedHost: 'member.xkimixamali.co.za',
      forwardedProto: 'https',
    })
    expect(verifyCsrfOrigin(request, {})).toBe(false)
  })

  it('refuses a mismatched Referer', () => {
    const request = req({ nextUrl: `${PUBLIC}/api/v1/members/x`, referer: 'https://evil.example.com/x' })
    expect(verifyCsrfOrigin(request, {})).toBe(false)
  })

  it('refuses when neither Origin nor Referer is present', () => {
    expect(verifyCsrfOrigin(req({ nextUrl: `${PUBLIC}/api/v1/members/x` }), {})).toBe(false)
  })

  it('does not let a forwarded host alone authorise a request', () => {
    // An attacker's cross-site POST cannot control the Origin header the
    // browser attaches, so a forwarded host without a matching Origin/Referer
    // must not pass.
    const request = req({ nextUrl: 'http://localhost:3000/x', forwardedHost: 'member.xkimixamali.co.za' })
    expect(verifyCsrfOrigin(request, {})).toBe(false)
  })
})

describe('buildAllowedOrigins', () => {
  it('includes the request origin, the forwarded origin, and NEXTAUTH_URL', () => {
    const origins = buildAllowedOrigins(
      req({
        nextUrl: 'http://localhost:3000/x',
        forwardedHost: 'member.xkimixamali.co.za',
        forwardedProto: 'https',
      }),
      { nextAuthUrl: 'https://configured.example.com' },
    )
    expect(origins.has('http://localhost:3000')).toBe(true)
    expect(origins.has(PUBLIC)).toBe(true)
    expect(origins.has('https://configured.example.com')).toBe(true)
  })

  it('ignores a malformed forwarded host rather than throwing', () => {
    const origins = buildAllowedOrigins(req({ nextUrl: `${PUBLIC}/x`, forwardedHost: '!! not a host !!' }), {})
    expect(origins.has(PUBLIC)).toBe(true)
  })
})
