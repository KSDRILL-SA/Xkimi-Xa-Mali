import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Unauthenticated auth endpoints have no session to key on, so they rate-limit
// by client IP. That IP must be derived through getClientIP — NOT the raw
// `x-forwarded-for` header, which the client fully controls. Keying on the raw
// header lets an attacker mint a fresh bucket per request by appending junk
// hops, defeating brute-force protection.
//
// Which header getClientIP is allowed to believe depends on what sits in front
// of the deployment; that trust model and its edge cases are covered in
// client-ip-trust.test.ts. This file is about the route wiring: that the
// limiter is keyed on the derived value and cannot be shifted by the caller.
// ---------------------------------------------------------------------------

vi.mock('@/lib/redis', () => ({
  authRatelimit: { limit: vi.fn() },
  apiRatelimit: { limit: vi.fn() },
}))
vi.mock('@/services/invite.service', () => ({ validateInviteCode: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { authRatelimit, apiRatelimit } from '@/lib/redis'
import { validateInviteCode } from '@/services/invite.service'
import { getClientIP } from '@/lib/request'
import { POST } from '@/app/api/v1/auth/invitations/validate/route'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

function req(xff: string | null, cf?: string) {
  const headers: Record<string, string> = {}
  if (xff !== null) headers['x-forwarded-for'] = xff
  if (cf) headers['cf-connecting-ip'] = cf
  return new NextRequest('http://localhost/api/v1/auth/invitations/validate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code: 'XKM-ABCD-EFGH' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mock(authRatelimit.limit).mockResolvedValue({ success: true } as never)
  mock(apiRatelimit.limit).mockResolvedValue({ success: true } as never)
  mock(validateInviteCode).mockResolvedValue({ valid: true } as never)
})

describe('getClientIP — trustworthy client-IP derivation', () => {
  it('takes and trims the first hop of x-forwarded-for', () => {
    expect(getClientIP(req('203.0.113.9, 10.0.0.1, 10.0.0.2'))).toBe('203.0.113.9')
  })

  it('is undefined when no forwarding headers are present', () => {
    expect(getClientIP(req(null))).toBeUndefined()
  })

  it('ignores cf-connecting-ip on the default (Vercel) deployment', () => {
    // This assertion used to be the exact opposite, on the belief that
    // cf-connecting-ip is "set by the edge, not client-spoofable". True behind
    // Cloudflare; false on Vercel, where nothing sets or strips it — so any
    // client could send one and be handed a fresh rate-limit bucket per request.
    expect(getClientIP(req('203.0.113.9', '1.1.1.1'))).toBe('203.0.113.9')
  })
})

describe('auth rate limit keys on the real client IP, not the raw header', () => {
  it('keys the invite-validate limiter on the first XFF hop', async () => {
    await POST(req('203.0.113.9, 10.0.0.1'), { params: Promise.resolve({}) })
    expect(authRatelimit.limit).toHaveBeenCalledWith('203.0.113.9')
  })

  it('cannot be bypassed by appending junk hops — the key stays stable', async () => {
    await POST(req('203.0.113.9, 9.9.9.9'), { params: Promise.resolve({}) })
    await POST(req('203.0.113.9, 8.8.8.8'), { params: Promise.resolve({}) })

    const keys = mock(authRatelimit.limit).mock.calls.map((c) => c[0])
    // A raw-header key would have produced two distinct buckets here.
    expect(new Set(keys)).toEqual(new Set(['203.0.113.9']))
  })
})
