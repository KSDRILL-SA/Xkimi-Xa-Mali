import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    notificationPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// The route now resolves preferences through member.service, which transitively
// imports @/lib/encryption (and thus the validated env). Mock env so the suite
// doesn't require real secrets.
vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: '0'.repeat(64),
  },
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      json: async () => body,
      headers: { set: vi.fn(), get: vi.fn() },
    }),
  },
}))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'

const mockDb = db as {
  user: { findUnique: MockedFunction<typeof db.user.findUnique> }
  notificationPreference: {
    findUnique: MockedFunction<typeof db.notificationPreference.findUnique>
    upsert: MockedFunction<typeof db.notificationPreference.upsert>
  }
  auditLog: { create: MockedFunction<typeof db.auditLog.create> }
}
const mockAuth = auth as unknown as MockedFunction<typeof auth>

function makeReq(body?: unknown) {
  return {
    json: async () => body,
    url: 'http://localhost/api/v1/notifications/preferences/whatsapp',
    method: body !== undefined ? 'PATCH' : 'GET',
    headers: new Headers(),
    nextUrl: { pathname: '/api/v1/notifications/preferences/whatsapp' },
  } as never
}

/**
 * Imported once, at the top, rather than dynamically inside each test.
 *
 * Every test used `await import(...)` to reach the route. That buys nothing
 * here — `vi.mock` is hoisted, so a static import already receives the mocked
 * `@/lib/auth`, and `mockAuth.mockResolvedValue(...)` acts on the mock function
 * whenever the module was loaded.
 *
 * What it cost was a dependency on the module registry still holding those
 * mocks at the moment each test ran. This file is half of a pair that has
 * failed together in a full run and passed alone every time; the other half
 * calls `vi.resetModules()` in three places. A fresh import of this route after
 * such a reset resolves a `@/lib/auth` that is no longer the mock, `auth()`
 * stops returning null, and "returns 401 when not authenticated" sees something
 * that is not 401 — which is exactly the failure that was observed.
 *
 * That mechanism is not proven: the failure has never been captured in full,
 * and nine hunts since have come back clean. What is certain is that the
 * dependency was unnecessary, and it is now gone.
 */
import { GET, PATCH } from '@/app/api/v1/notifications/preferences/whatsapp/route'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── GET ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/notifications/preferences/whatsapp', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as never)
    const res = await GET(makeReq())
    expect((res as { status: number }).status).toBe(401)
  })

  it('returns enabled=true and phone when preference exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockDb.user.findUnique.mockResolvedValue({ phone: '+27821234567' } as never)
    mockDb.notificationPreference.findUnique.mockResolvedValue({ whatsapp: true } as never)
    const res = await GET(makeReq())
    const body = await (res as Response).json()
    expect(body.data).toMatchObject({ enabled: true, phone: '+27821234567' })
  })

  it('defaults enabled to true when no preference row exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2' } } as never)
    mockDb.user.findUnique.mockResolvedValue({ phone: '+27821234567' } as never)
    mockDb.notificationPreference.findUnique.mockResolvedValue(null as never)
    const res = await GET(makeReq())
    const body = await (res as Response).json()
    expect(body.data.enabled).toBe(true)
  })
})

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/notifications/preferences/whatsapp', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as never)
    const res = await PATCH(makeReq({ enabled: false }))
    expect((res as { status: number }).status).toBe(401)
  })

  it('upserts preference and returns updated value', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u3' } } as never)
    mockDb.notificationPreference.upsert.mockResolvedValue({ whatsapp: false } as never)
    mockDb.auditLog.create.mockResolvedValue({} as never)
    const res = await PATCH(makeReq({ enabled: false }))
    const body = await (res as Response).json()

    expect(mockDb.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { whatsapp: false } }),
    )
    expect(body.data.enabled).toBe(false)
  })

  it('returns 400 for invalid body', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u4' } } as never)
    const res = await PATCH(makeReq({ enabled: 'yes' }))
    expect((res as { status: number }).status).toBe(400)
  })
})
