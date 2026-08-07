import { describe, it, expect } from 'vitest'
import { clientIpFromHeaders, resolveTrustedProxy } from '../src/client-ip'

/**
 * The client IP is a security control, not a log field: rate limiters key on it
 * and audit records preserve it. If a caller can choose the value, they get a
 * fresh rate-limit bucket per request and can decide what the audit trail says
 * about them.
 *
 * A forwarded-for header only means something when the thing in front of the app
 * overwrites it. Which header that is depends on what is actually deployed —
 * so the behaviour is pinned per declared proxy, including the case that was
 * previously wrong in three separate implementations.
 */

const headers = (h: Record<string, string>) => ({
  get: (name: string) => h[name.toLowerCase()] ?? null,
})

describe('on Vercel — the deployment target, and the default', () => {
  it('reads the header Vercel sets', () => {
    expect(
      clientIpFromHeaders(headers({ 'x-vercel-forwarded-for': '203.0.113.5' }), 'vercel'),
    ).toBe('203.0.113.5')
  })

  it('IGNORES cf-connecting-ip, which nothing on Vercel sets or strips', () => {
    // The regression this exists to prevent. cf-connecting-ip used to win
    // outright, so a caller could send one and be counted as a brand new
    // visitor on every request — silently disabling every per-IP rate limit.
    const ip = clientIpFromHeaders(
      headers({ 'cf-connecting-ip': '1.2.3.4', 'x-vercel-forwarded-for': '203.0.113.5' }),
      'vercel',
    )
    expect(ip).toBe('203.0.113.5')
  })

  it('cannot be moved by a spoofed cf-connecting-ip alone', () => {
    expect(clientIpFromHeaders(headers({ 'cf-connecting-ip': '1.2.3.4' }), 'vercel')).toBeUndefined()
  })

  it('falls back to x-forwarded-for, taking the originating hop', () => {
    expect(
      clientIpFromHeaders(headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' }), 'vercel'),
    ).toBe('203.0.113.5')
  })

  it('yields one stable bucket however much junk the caller appends', () => {
    const a = clientIpFromHeaders(
      headers({ 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': 'junk-1, junk-2' }),
      'vercel',
    )
    const b = clientIpFromHeaders(
      headers({ 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': 'junk-3' }),
      'vercel',
    )
    expect(a).toBe(b)
    expect(a).toBe('203.0.113.5')
  })
})

describe('behind Cloudflare, when declared', () => {
  it('reads cf-connecting-ip', () => {
    expect(
      clientIpFromHeaders(headers({ 'cf-connecting-ip': '203.0.113.5' }), 'cloudflare'),
    ).toBe('203.0.113.5')
  })

  it('does not fall back to a header Cloudflare forwards from the client', () => {
    expect(
      clientIpFromHeaders(headers({ 'x-forwarded-for': '1.2.3.4' }), 'cloudflare'),
    ).toBeUndefined()
  })
})

describe('with nothing declared in front', () => {
  it('reports no IP rather than believing the caller', () => {
    expect(
      clientIpFromHeaders(
        headers({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '5.6.7.8' }),
        'none',
      ),
    ).toBeUndefined()
  })
})

describe('resolveTrustedProxy', () => {
  it('accepts exactly the three known values', () => {
    expect(resolveTrustedProxy('vercel')).toBe('vercel')
    expect(resolveTrustedProxy('cloudflare')).toBe('cloudflare')
    expect(resolveTrustedProxy('none')).toBe('none')
  })

  it('falls back to the deployment target, never to trusting everything', () => {
    // A typo must not widen what is believed. 'cloudflare ' and 'CLOUDFLARE'
    // are not cloudflare — they are unrecognised, and resolve to the default.
    for (const value of [undefined, '', 'nginx', 'CLOUDFLARE', 'cloudflare ', 'Vercel']) {
      expect(resolveTrustedProxy(value), String(value)).toBe('vercel')
    }
  })
})

describe('malformed headers', () => {
  it('treats blank and separator-only values as absent', () => {
    expect(clientIpFromHeaders(headers({ 'x-vercel-forwarded-for': '   ' }), 'vercel')).toBeUndefined()
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': ' , , ' }), 'vercel')).toBeUndefined()
  })

  it('trims padding so a padded value shares the same bucket', () => {
    expect(
      clientIpFromHeaders(headers({ 'x-forwarded-for': '  203.0.113.5  , 10.0.0.1' }), 'vercel'),
    ).toBe('203.0.113.5')
  })

  it('is undefined when no forwarding headers are present at all', () => {
    expect(clientIpFromHeaders(headers({}), 'vercel')).toBeUndefined()
  })
})
