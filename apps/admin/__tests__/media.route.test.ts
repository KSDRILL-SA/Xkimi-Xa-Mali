import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

/**
 * The route that serves the console's private objects.
 *
 * Signatures and Goal outcome proofs were stored with `access: 'public'` and
 * rendered straight from a blob URL, so no route like this existed. A
 * signature sat at `signatures/<adminId>/<timestamp>.png` with no random
 * suffix — permanent, unauthenticated, and derivable from an admin's id. A
 * proof is a receipt for money the collective spent.
 *
 * The cases below are mostly about the second half of the fix. Making the
 * objects private is easy; the risk is that the route added to read them back
 * becomes a worse hole than the one it closed, because an obvious
 * implementation takes a pathname and streams it — which hands any admin
 * session the whole blob store, including objects belonging to features that
 * have nothing to do with this console.
 */

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    NextResponse: class extends Response {},
  }
})

const auth = vi.fn()
const blobGet = vi.fn()
const findSignature = vi.fn()
const findGoal = vi.fn()
const findProof = vi.fn()
const findGoalProof = vi.fn()

async function loadRoute() {
  vi.resetModules()
  vi.doMock('@/lib/auth', () => ({ auth }))
  vi.doMock('@vercel/blob', () => ({ get: blobGet }))
  vi.doMock('@/lib/db', () => ({
    db: {
      adminSignature: { findFirst: findSignature },
      goal: { findFirst: findGoal },
      // The third and fourth kinds of private object this route serves: the
      // proof of payment on an offline contribution, and the same document on
      // a payment toward a goal. Two tables, so two lookups — one covering
      // only the first would have refused every goal payment's proof while
      // looking correct.
      transaction: { findFirst: findProof },
      goalPayment: { findFirst: findGoalProof },
    },
  }))
  const { GET } = await import('@/app/api/media/route')
  return GET
}

/** One throwaway load, so no assertion pays the module graph's cold transform. */
beforeAll(async () => {
  await loadRoute()
}, 120_000)

const ADMIN = { user: { id: 'admin-1', roles: ['ADMIN'] } }

const ok200 = () => ({
  statusCode: 200 as const,
  stream: new Response('bytes').body,
  blob: { contentType: 'image/png' },
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue(ADMIN)
  findSignature.mockResolvedValue(null)
  findGoal.mockResolvedValue(null)
  findProof.mockResolvedValue(null)
  findGoalProof.mockResolvedValue(null)
  blobGet.mockResolvedValue(ok200())
})

afterEach(() => {
  vi.doUnmock('@/lib/auth')
  vi.doUnmock('@vercel/blob')
  vi.doUnmock('@/lib/db')
  vi.resetModules()
})

const req = (ref?: string) =>
  new Request(
    `http://admin.test/api/media${ref === undefined ? '' : `?ref=${encodeURIComponent(ref)}`}`,
  ) as never

describe('who may ask', () => {
  it('refuses a caller with no session', async () => {
    auth.mockResolvedValue(null)
    const GET = await loadRoute()

    expect((await GET(req('signatures/a/1.png'))).status).toBe(403)
  })

  it('refuses a signed-in non-admin', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', roles: ['MEMBER'] } })
    const GET = await loadRoute()

    expect((await GET(req('signatures/a/1.png'))).status).toBe(403)
  })

  it('never reads storage for a caller it refused', async () => {
    auth.mockResolvedValue(null)
    const GET = await loadRoute()
    await GET(req('signatures/a/1.png'))

    expect(blobGet).not.toHaveBeenCalled()
  })
})

describe('what may be asked for — the part that matters', () => {
  it('refuses a reference no row claims, even for an admin', async () => {
    // The whole point. Without this the route is "authenticated admin may read
    // any object in the store", which is a bigger hole than the public URLs.
    const GET = await loadRoute()
    const res = await GET(req('some/other/feature/secret.pdf'))

    expect(res.status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })

  it('serves a reference an AdminSignature row holds', async () => {
    findSignature.mockResolvedValue({ id: 'sig-1' })
    const GET = await loadRoute()
    const res = await GET(req('signatures/admin-1/123.png'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('serves a reference a Goal outcome row holds', async () => {
    findGoal.mockResolvedValue({ id: 'goal-1' })
    const GET = await loadRoute()

    expect((await GET(req('goal-outcomes/goal-1-abc.jpg'))).status).toBe(200)
  })

  it('looks the reference up exactly as given, not by prefix', async () => {
    findSignature.mockResolvedValue({ id: 'sig-1' })
    const GET = await loadRoute()
    await GET(req('signatures/admin-1/123.png'))

    // A `startsWith` or `contains` match would let one recorded object unlock a
    // family of neighbouring paths.
    expect(findSignature).toHaveBeenCalledWith(
      expect.objectContaining({ where: { signatureUrl: 'signatures/admin-1/123.png' } }),
    )
  })
})

describe('references that should never arrive here', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['a data: URL the page already holds', 'data:image/png;base64,AAAA'],
    ['an absolute URL, which would make this an open proxy', 'https://example.invalid/x.png'],
  ])('refuses %s', async (_name, ref) => {
    const GET = await loadRoute()
    const res = await GET(req(ref))

    expect(res.status).toBe(400)
    expect(blobGet).not.toHaveBeenCalled()
  })
})

describe('how the bytes come back', () => {
  it('is never stored by a shared cache', async () => {
    findGoal.mockResolvedValue({ id: 'goal-1' })
    const GET = await loadRoute()
    const res = await GET(req('goal-outcomes/x.jpg'))

    // Without this a proxy could hold a receipt and hand it to the next person.
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('is not sniffable into another content type', async () => {
    findGoal.mockResolvedValue({ id: 'goal-1' })
    const GET = await loadRoute()
    const res = await GET(req('goal-outcomes/x.jpg'))

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('does not put the stored pathname in a download filename', async () => {
    findSignature.mockResolvedValue({ id: 'sig-1' })
    const GET = await loadRoute()
    const res = await GET(req('signatures/admin-1/123.png'))

    // The pathname carries an admin id. A filename= is a needless place to
    // repeat it.
    expect(res.headers.get('content-disposition')).toBe('inline')
  })

  it('reports a missing object as 404 rather than an empty 200', async () => {
    findSignature.mockResolvedValue({ id: 'sig-1' })
    blobGet.mockResolvedValue(null)
    const GET = await loadRoute()

    expect((await GET(req('signatures/admin-1/123.png'))).status).toBe(404)
  })

  it('survives storage throwing, without leaking the reason', async () => {
    findSignature.mockResolvedValue({ id: 'sig-1' })
    blobGet.mockRejectedValue(new Error('BLOB_READ_WRITE_TOKEN is invalid'))
    const GET = await loadRoute()
    const res = await GET(req('signatures/admin-1/123.png'))

    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('TOKEN')
  })
})

describe('a proof of payment', () => {
  it('is served when a transaction row claims it', async () => {
    // The third kind of object here, and the one that carries somebody's bank
    // account number. Admins may open every member's, because reconciling them
    // against the bank statement is the job — the member's own narrower view of
    // the same file is a separate route in the member app.
    findProof.mockResolvedValue({ id: 'tx-1' })
    blobGet.mockResolvedValue(ok200())

    const GET = await loadRoute()
    auth.mockResolvedValue(ADMIN)

    const res = await GET(req('payment-proofs/proof-abc.pdf'))

    expect(res.status).toBe(200)
    expect(findProof).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proofUrl: 'payment-proofs/proof-abc.pdf' } }),
    )
  })

  it('is refused when no row claims it, like every other reference', async () => {
    // The rule that keeps an admin session from being a way to read the whole
    // blob store, including objects belonging to features that have nothing to
    // do with this console.
    const GET = await loadRoute()
    auth.mockResolvedValue(ADMIN)

    const res = await GET(req('payment-proofs/never-recorded.pdf'))

    expect(res.status).toBe(404)
    expect(blobGet).not.toHaveBeenCalled()
  })
})

describe('a proof attached to a goal payment', () => {
  it('is served when a goal payment row claims it', async () => {
    // Its own table, so its own question. Without this lookup the console would
    // refuse to open a document it had just stored itself.
    findGoalProof.mockResolvedValue({ id: 'gp-1' })
    blobGet.mockResolvedValue(ok200())

    const GET = await loadRoute()
    auth.mockResolvedValue(ADMIN)

    const res = await GET(req('payment-proofs/proof-goal.pdf'))

    expect(res.status).toBe(200)
  })
})
