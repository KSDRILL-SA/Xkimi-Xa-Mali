import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// POST /api/v1/admin/transactions/[id]/reverse
//
// The service behind this route (`createReversal`) has been complete and tested
// since the ledger work. The route in front of it was not reachable by the only
// caller that exists.
//
// The admin console never holds a session cookie for the member app — it talks
// to it server-to-server through `internalAdminPost`, with the shared secret and
// a timestamp. This route called `auth()` and refused anything without a
// session, so every reversal the console could ever have issued came back 401,
// and the member app has no admin UI to issue one from. A capability the Founder
// Guide puts in a table with a "Yes" against leadership could not be performed
// by anyone.
//
// `broadcast/route.ts` already solved this with `isValidInternalRequest`. These
// tests hold this route to the same contract, and to the two things a reversal
// needs that a broadcast does not: a stated reason, and an audit entry naming
// the admin who acted rather than "system".
// ---------------------------------------------------------------------------

const { SECRET } = vi.hoisted(() => ({ SECRET: 'x'.repeat(40) }))

const mocks = vi.hoisted(() => ({
  findAdmin: vi.fn(),
  auth: vi.fn(),
  createReversal: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { ADMIN_API_SECRET: SECRET } }))
// The forwarded admin id is no longer taken on faith — it is looked up, and
// must name a live ADMIN. These tests forward a real admin, so the lookup
// finds one; `internal-admin-identity.test.ts` covers the cases where it does
// not.
vi.mock('@/lib/db', () => ({ db: { user: { findFirst: mocks.findAdmin } } }))
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/services/contribution.service', () => ({ createReversal: mocks.createReversal }))
vi.mock('@/lib/redis', () => ({
  apiRatelimit: { limit: vi.fn(async () => ({ success: true })) },
  // See ledger-reconcile.route.test.ts: the trusted channel claims a nonce.
  REDIS_CONFIGURED: true,
  redis: { set: vi.fn(async () => 'OK') },
}))

import { POST } from '@/app/api/v1/admin/transactions/[id]/reverse/route'

const REASON = 'Debited twice for June after a gateway redelivery'

function post(opts: {
  headers?: Record<string, string>
  body?: Record<string, unknown>
} = {}) {
  const req = new NextRequest('http://localhost/api/v1/admin/transactions/txn-1/reverse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: JSON.stringify(opts.body ?? { reason: REASON }),
  })
  return POST(req, { params: Promise.resolve({ id: 'txn-1' }) })
}

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

beforeEach(() => {
  vi.clearAllMocks()
  // The forwarded id names a real, current admin unless a test says otherwise.
  // Echoes back whichever id was looked up, so a test that forwards a specific
  // admin still sees that admin credited.
  mocks.findAdmin.mockImplementation(async (args: { where: { id: string } }) => ({ id: args.where.id }))
  mocks.auth.mockResolvedValue(null)
  mocks.createReversal.mockResolvedValue({ id: 'rev-1', amount: 500 })
})

describe('POST reverse — the trusted internal call from the admin console', () => {
  it('accepts a server-to-server call carrying the shared secret and no session', async () => {
    const res = await post({ headers: internalHeaders() })

    // Before the fix this was 401: the handler required a session cookie the
    // admin console never sends, so the reversal never reached the service.
    expect(res.status).toBe(201)
    expect(mocks.createReversal).toHaveBeenCalledOnce()
  })

  it('credits the reversal to the admin who acted, not to "system"', async () => {
    await post({ headers: internalHeaders('admin-7') })

    // The guide promises a permanent log of who did what. `getInternalAdminUserId`
    // exists precisely so the acting admin survives the hop between apps.
    expect(mocks.createReversal).toHaveBeenCalledWith(
      'txn-1',
      'admin-7',
      expect.arrayContaining(['ADMIN']),
      REASON,
      ADMIN_IP,
    )
  })

  it('records the admin\'s own address, not the admin app\'s', async () => {
    await post({ headers: internalHeaders() })

    // On a server-to-server hop the socket address belongs to our own
    // infrastructure. The audit trail promises "where"; the console forwards
    // the real client so that answer is about a person.
    expect(mocks.createReversal.mock.calls[0][4]).toBe(ADMIN_IP)
  })

  it('refuses a trusted call that does not name the acting admin', async () => {
    const { 'x-admin-user-id': _omitted, ...headers } = internalHeaders()
    const res = await post({ headers })

    expect(res.status).toBe(400)
    expect(mocks.createReversal).not.toHaveBeenCalled()
  })

  it('refuses a stale timestamp even with the right secret', async () => {
    const res = await post({
      headers: {
        'x-admin-secret': SECRET,
        'x-admin-timestamp': String(Date.now() - 6 * 60 * 1000),
        'x-admin-user-id': 'admin-1',
      },
    })

    expect(res.status).toBe(401)
    expect(mocks.createReversal).not.toHaveBeenCalled()
  })
})

describe('POST reverse — a reason is mandatory', () => {
  it('refuses a reversal with no reason', async () => {
    const res = await post({ headers: internalHeaders(), body: {} })

    expect(res.status).toBe(400)
    expect(mocks.createReversal).not.toHaveBeenCalled()
  })

  it('refuses a reason that is only whitespace', async () => {
    const res = await post({ headers: internalHeaders(), body: { reason: '     ' } })

    expect(res.status).toBe(400)
    expect(mocks.createReversal).not.toHaveBeenCalled()
  })

  it('refuses a reason too short to mean anything', async () => {
    const res = await post({ headers: internalHeaders(), body: { reason: 'oops' } })

    expect(res.status).toBe(400)
    expect(mocks.createReversal).not.toHaveBeenCalled()
  })

  it('passes the reason through trimmed', async () => {
    await post({ headers: internalHeaders(), body: { reason: `  ${REASON}  ` } })

    expect(mocks.createReversal).toHaveBeenCalledWith(
      'txn-1', 'admin-1', expect.anything(), REASON, ADMIN_IP,
    )
  })
})

describe('POST reverse — the session path still holds', () => {
  it('accepts an admin with a live session and no secret', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-2', roles: ['ADMIN'] } })

    const res = await post()

    expect(res.status).toBe(201)
    // No proxy header on this request, so there is no client address to record.
    // Undefined is the honest answer; a placeholder would not be.
    expect(mocks.createReversal).toHaveBeenCalledWith(
      'txn-1', 'admin-2', ['ADMIN'], REASON, undefined,
    )
  })

  it('refuses an unauthenticated caller with no secret', async () => {
    const res = await post()

    expect(res.status).toBe(401)
    expect(mocks.createReversal).not.toHaveBeenCalled()
  })

  it('refuses a signed-in member who is not an admin', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'member-1', roles: ['MEMBER'] } })

    const res = await post()

    expect(res.status).toBe(403)
    expect(mocks.createReversal).not.toHaveBeenCalled()
  })
})
