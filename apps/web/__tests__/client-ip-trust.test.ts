import { describe, it, expect, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getClientIP } from '@/lib/request'

/**
 * Rate limiting on the unauthenticated endpoints keys on the client IP, so the
 * IP is a security control and not a log field. If a client can choose it, it
 * can mint a fresh bucket per request and brute-force protection is gone.
 *
 * A forwarded-for header is only worth anything when something in front of the
 * app overwrites it. Which header that is depends on what is actually deployed
 * — so these tests pin the behaviour per declared proxy, including the case
 * that used to be wrong.
 */

function req(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/v1/auth/invitations/validate', {
    method: 'POST',
    headers,
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('on Vercel (the deployment target)', () => {
  it('reads the header Vercel sets', () => {
    vi.stubEnv('TRUSTED_PROXY', 'vercel')
    expect(getClientIP(req({ 'x-vercel-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5')
  })

  it('IGNORES cf-connecting-ip, which nothing on Vercel sets or strips', () => {
    // The regression this whole change exists for. cf-connecting-ip used to win
    // outright, so a client could send one and be counted as a new visitor on
    // every single request — silently disabling every per-IP rate limit.
    vi.stubEnv('TRUSTED_PROXY', 'vercel')
    const ip = getClientIP(
      req({ 'cf-connecting-ip': '1.2.3.4', 'x-vercel-forwarded-for': '203.0.113.5' }),
    )
    expect(ip).toBe('203.0.113.5')
    expect(ip).not.toBe('1.2.3.4')
  })

  it('cannot be shifted by a spoofed cf-connecting-ip alone', () => {
    vi.stubEnv('TRUSTED_PROXY', 'vercel')
    expect(getClientIP(req({ 'cf-connecting-ip': '1.2.3.4' }))).toBeUndefined()
  })

  it('falls back to x-forwarded-for, taking the originating hop', () => {
    vi.stubEnv('TRUSTED_PROXY', 'vercel')
    expect(getClientIP(req({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' }))).toBe('203.0.113.5')
  })

  it('gives every attacker-supplied chain the same bucket, not a fresh one each', () => {
    // Appending junk hops must not change the answer, or the limiter is bypassed
    // by a client that simply varies its own header.
    vi.stubEnv('TRUSTED_PROXY', 'vercel')
    const a = getClientIP(req({ 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': 'junk-1' }))
    const b = getClientIP(req({ 'x-vercel-forwarded-for': '203.0.113.5', 'x-forwarded-for': 'junk-2' }))
    expect(a).toBe(b)
  })
})

describe('behind Cloudflare, when declared', () => {
  it('reads cf-connecting-ip', () => {
    vi.stubEnv('TRUSTED_PROXY', 'cloudflare')
    expect(getClientIP(req({ 'cf-connecting-ip': '203.0.113.5' }))).toBe('203.0.113.5')
  })

  it('does not fall back to a header Cloudflare passes through from the client', () => {
    vi.stubEnv('TRUSTED_PROXY', 'cloudflare')
    expect(getClientIP(req({ 'x-forwarded-for': '1.2.3.4' }))).toBeUndefined()
  })
})

describe('with no proxy declared', () => {
  it('reports no IP rather than believing the client', () => {
    // Nothing is normalising these headers, so every one of them is just text
    // the caller wrote. Callers collapse undefined into a single shared bucket,
    // which limits unattributable traffic together instead of per request.
    vi.stubEnv('TRUSTED_PROXY', 'none')
    expect(
      getClientIP(req({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '5.6.7.8' })),
    ).toBeUndefined()
  })
})

describe('defaults and malformed input', () => {
  it('defaults to Vercel when nothing is declared', () => {
    vi.stubEnv('TRUSTED_PROXY', '')
    expect(getClientIP(req({ 'x-vercel-forwarded-for': '203.0.113.5' }))).toBe('203.0.113.5')
    expect(getClientIP(req({ 'cf-connecting-ip': '1.2.3.4' }))).toBeUndefined()
  })

  it('ignores an unrecognised declaration rather than trusting everything', () => {
    vi.stubEnv('TRUSTED_PROXY', 'nginx-probably')
    expect(getClientIP(req({ 'cf-connecting-ip': '1.2.3.4' }))).toBeUndefined()
  })

  it('treats blank and whitespace-only headers as absent', () => {
    vi.stubEnv('TRUSTED_PROXY', 'vercel')
    expect(getClientIP(req({ 'x-vercel-forwarded-for': '   ' }))).toBeUndefined()
    expect(getClientIP(req({ 'x-forwarded-for': ' , , ' }))).toBeUndefined()
  })

  it('trims surrounding whitespace so a padded value shares one bucket', () => {
    vi.stubEnv('TRUSTED_PROXY', 'vercel')
    expect(getClientIP(req({ 'x-forwarded-for': '  203.0.113.5  , 70.41.3.18' }))).toBe('203.0.113.5')
  })
})
