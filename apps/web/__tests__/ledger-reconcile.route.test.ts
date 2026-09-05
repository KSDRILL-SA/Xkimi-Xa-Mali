import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// POST /api/v1/admin/ledger/reconcile
//
// `reconcileLedger` ran nightly at 05:00 SAST and nothing else could reach it.
// That is fine while nothing is wrong and useless the moment something is:
// every ledger post in the system is best-effort on purpose — so a hiccup can
// never unwind a payment already recorded — which means a failed post leaves
// the fund figures members see short until the small hours, with no way for
// leadership to close the gap or to confirm it closed.
//
// The admin console holds no session cookie for the member app; it calls
// server-to-server through `internalAdminPost`. So this route has to accept the
// trusted internal call, and must still refuse everyone else.
// ---------------------------------------------------------------------------

const { SECRET } = vi.hoisted(() => ({ SECRET: 'x'.repeat(40) }))

const mocks = vi.hoisted(() => ({
  findAdmin: vi.fn(),
  auth: vi.fn(),
  reconcileLedger: vi.fn(),
  getPoolBalance: vi.fn(),
  writeAuditLog: vi.fn(),
  limit: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { ADMIN_API_SECRET: SECRET } }))
vi.mock('@/lib/db', () => ({ db: { user: { findFirst: mocks.findAdmin } } }))
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/services/ledger.service', () => ({
  reconcileLedger: mocks.reconcileLedger,
  getPoolBalance: mocks.getPoolBalance,
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/redis', () => ({
  adminBulkRatelimit: { limit: mocks.limit },
  apiRatelimit: { limit: vi.fn(async () => ({ success: true })) },
  // The trusted channel claims a nonce so a captured request cannot be sent
  // twice. SET NX returns 'OK' for a new key and null for one already held.
  REDIS_CONFIGURED: true,
  redis: { set: vi.fn(async () => 'OK') },
}))

import { POST } from '@/app/api/v1/admin/ledger/reconcile/route'

const ADMIN_IP = '41.0.0.9'

/** The headers `internalAdminPost` actually sends. No cookie, so no session. */
function internalHeaders(adminUserId = 'admin-1') {
  return {
    'x-admin-secret': SECRET,
    'x-admin-timestamp': String(Date.now()),
    'x-admin-nonce': `n-${Math.random().toString(36).slice(2)}-aaaaaaaa`,
    'x-admin-user-id': adminUserId,
    'x-admin-ip': ADMIN_IP,
  }
}

function post(headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost/api/v1/admin/ledger/reconcile', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findAdmin.mockImplementation(async (args: { where: { id: string } }) => ({
    id: args.where.id,
  }))
  mocks.auth.mockResolvedValue(null)
  mocks.reconcileLedger.mockResolvedValue({ creditsPosted: 3, debitsPosted: 1 })
  mocks.getPoolBalance.mockResolvedValue({ balance: 8000, credited: 8500, debited: 500, entries: 42 })
  mocks.limit.mockResolvedValue({ success: true })
})

describe('who may run it', () => {
  it('accepts the trusted server-to-server call with no session', async () => {
    const res = await post(internalHeaders())

    expect(res.status).toBe(200)
    expect(mocks.reconcileLedger).toHaveBeenCalledOnce()
  })

  it('refuses an anonymous caller', async () => {
    const res = await post()

    expect(res.status).toBe(401)
    expect(mocks.reconcileLedger).not.toHaveBeenCalled()
  })

  it('refuses a signed-in member who is not an admin', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'member-1', roles: ['MEMBER'] } })

    const res = await post()

    expect(res.status).toBe(403)
    expect(mocks.reconcileLedger).not.toHaveBeenCalled()
  })

  it('refuses a trusted call that names nobody', async () => {
    // A write to the immutable ledger has to be attributable.
    mocks.findAdmin.mockResolvedValue(null)

    const res = await post(internalHeaders('ghost'))

    expect(res.status).toBe(400)
    expect(mocks.reconcileLedger).not.toHaveBeenCalled()
  })
})

describe('what it reports', () => {
  it('returns what it wrote and the balance afterwards', async () => {
    // Afterwards, not before: the figure leadership wants is what the pool
    // holds now the gaps are filled.
    const res = await post(internalHeaders())
    const body = await res.json()

    expect(body.data).toMatchObject({
      creditsPosted: 3,
      debitsPosted: 1,
      balance: 8000,
      entries: 42,
    })
  })

  it('reports zero when nothing was missing', async () => {
    // The ordinary case, and the one a second press produces.
    mocks.reconcileLedger.mockResolvedValue({ creditsPosted: 0, debitsPosted: 0 })

    const res = await post(internalHeaders())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.creditsPosted).toBe(0)
    expect(body.data.debitsPosted).toBe(0)
  })
})

describe('the record it leaves', () => {
  it('credits the admin who asked, not "system"', async () => {
    await post(internalHeaders('admin-7'))

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-7',
        action: 'LEDGER_RECONCILIATION_REQUESTED',
      }),
    )
  })

  it('records what the run found', async () => {
    // A balance is only checkable if what changed it is written down.
    await post(internalHeaders())

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ creditsPosted: 3, debitsPosted: 1, balance: 8000 }),
      }),
    )
  })

  it("records the admin's own address, not the admin app's", async () => {
    await post(internalHeaders())

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ ipAddress: ADMIN_IP }),
    )
  })
})

describe('rate limiting', () => {
  it('shares the bulk bucket, because it reads every settled payment', async () => {
    await post(internalHeaders('admin-3'))

    expect(mocks.limit).toHaveBeenCalledWith('admin-3')
  })

  it('refuses once the bucket is empty, without touching the ledger', async () => {
    mocks.limit.mockResolvedValue({ success: false })

    const res = await post(internalHeaders())

    expect(res.status).toBe(429)
    expect(mocks.reconcileLedger).not.toHaveBeenCalled()
  })
})
