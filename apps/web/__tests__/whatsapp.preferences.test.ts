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

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) =>
      ({ body, status: init?.status ?? 200, json: async () => body }),
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

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── GET ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/notifications/preferences/whatsapp', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as never)
    const { GET } = await import('@/app/api/v1/notifications/preferences/whatsapp/route')
    const res = await GET()
    expect((res as { status: number }).status).toBe(401)
  })

  it('returns enabled=true and phone when preference exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u1' } } as never)
    mockDb.user.findUnique.mockResolvedValue({ phone: '+27821234567' } as never)
    mockDb.notificationPreference.findUnique.mockResolvedValue({ whatsapp: true } as never)

    const { GET } = await import('@/app/api/v1/notifications/preferences/whatsapp/route')
    const res = await GET()
    const body = await (res as Response).json()
    expect(body.data).toMatchObject({ enabled: true, phone: '+27821234567' })
  })

  it('defaults enabled to true when no preference row exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u2' } } as never)
    mockDb.user.findUnique.mockResolvedValue({ phone: '+27821234567' } as never)
    mockDb.notificationPreference.findUnique.mockResolvedValue(null as never)

    const { GET } = await import('@/app/api/v1/notifications/preferences/whatsapp/route')
    const res = await GET()
    const body = await (res as Response).json()
    expect(body.data.enabled).toBe(true)
  })
})

// ─── PATCH ───────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/notifications/preferences/whatsapp', () => {
  function makeRequest(body: unknown) {
    return { json: async () => body, url: 'http://localhost/api/v1/notifications/preferences/whatsapp' } as never
  }

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null as never)
    const { PATCH } = await import('@/app/api/v1/notifications/preferences/whatsapp/route')
    const res = await PATCH(makeRequest({ enabled: false }))
    expect((res as { status: number }).status).toBe(401)
  })

  it('upserts preference and returns updated value', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u3' } } as never)
    mockDb.notificationPreference.upsert.mockResolvedValue({ whatsapp: false } as never)
    mockDb.auditLog.create.mockResolvedValue({} as never)

    const { PATCH } = await import('@/app/api/v1/notifications/preferences/whatsapp/route')
    const res = await PATCH(makeRequest({ enabled: false }))
    const body = await (res as Response).json()

    expect(mockDb.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { whatsapp: false } }),
    )
    expect(body.data.enabled).toBe(false)
  })

  it('returns 400 for invalid body', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u4' } } as never)
    const { PATCH } = await import('@/app/api/v1/notifications/preferences/whatsapp/route')
    const res = await PATCH(makeRequest({ enabled: 'yes' }))
    expect((res as { status: number }).status).toBe(400)
  })
})
