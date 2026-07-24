import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/redis', () => ({ apiRatelimit: { limit: vi.fn() } }))
vi.mock('@/lib/request', () => ({ getClientIP: vi.fn().mockReturnValue('1.2.3.4') }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { apiRatelimit } from '@/lib/redis'
import { withApiHandler } from '@/lib/api-handler'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>
const allow = () => mock(apiRatelimit.limit).mockResolvedValue({ success: true } as never)
const block = () => mock(apiRatelimit.limit).mockResolvedValue({ success: false } as never)

const ok = async () => NextResponse.json({ ok: true })
const req = (method: string) => new NextRequest('http://localhost/api/v1/goals', { method })

beforeEach(() => vi.clearAllMocks())

describe('withApiHandler — central rate limit (SEC-S05)', () => {
  it('rejects a state-changing request with 429 once the per-IP limit is exceeded', async () => {
    block()
    const handler = vi.fn(ok)
    const res = await withApiHandler(handler)(req('POST'), { params: Promise.resolve({}) })

    expect(res.status).toBe(429)
    expect(handler).not.toHaveBeenCalled() // blocked before the handler runs
  })

  it('runs the handler when under the limit', async () => {
    allow()
    const handler = vi.fn(ok)
    const res = await withApiHandler(handler)(req('POST'), { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('never rate-limits reads (GET)', async () => {
    const handler = vi.fn(ok)
    await withApiHandler(handler)(req('GET'), { params: Promise.resolve({}) })

    expect(apiRatelimit.limit).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('honours rateLimit:false (webhooks opt out)', async () => {
    const handler = vi.fn(ok)
    await withApiHandler(handler, { rateLimit: false })(req('POST'), { params: Promise.resolve({}) })

    expect(apiRatelimit.limit).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledOnce()
  })
})
