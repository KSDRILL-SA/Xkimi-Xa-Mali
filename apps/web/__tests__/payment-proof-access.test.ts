import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OfflineContributionSchema } from '@xxm/utils'

/**
 * Who may open a proof of payment, and what a payment is allowed to rest on.
 *
 * A proof of payment carries a bank account number, a name and often a
 * balance. The admin console serves these too, and there the question is only
 * "does any row claim this object" — an admin is entitled to all of them,
 * because reconciling against the bank statement is the job.
 *
 * Here the question has to be narrower, and the difference is the entire
 * security boundary: **does a transaction on THIS member's own contribution
 * claim it**. The same lookup with the ownership clause dropped would turn any
 * signed-in member into a reader of every other member's banking details, and
 * nothing about the response would look wrong.
 */

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findFirst: vi.fn(), get: vi.fn() }))

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }))
vi.mock('@/lib/db', () => ({ db: { transaction: { findFirst: mocks.findFirst } } }))
vi.mock('@vercel/blob', () => ({ get: mocks.get }))

import { GET } from '@/app/api/media/proof/route'

const req = (ref?: string) =>
  new Request(
    `https://member.test/api/media/proof${ref === undefined ? '' : `?ref=${encodeURIComponent(ref)}`}`,
  ) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: 'member-1' } })
  mocks.findFirst.mockResolvedValue({ id: 'tx-1' })
  mocks.get.mockResolvedValue({
    statusCode: 200,
    stream: new ReadableStream(),
    blob: { contentType: 'application/pdf' },
  })
})

describe('who may open a proof of payment', () => {
  it('scopes the lookup to the signed-in member, not just to the reference', async () => {
    // The clause that is the whole point. Asserted on the query rather than
    // only on the response, because a later "simplification" that drops it
    // would still pass a test that only checked a 200 came back.
    await GET(req('payment-proofs/proof-abc.pdf'))

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          proofUrl: 'payment-proofs/proof-abc.pdf',
          contribution: { userId: 'member-1' },
        },
      }),
    )
  })

  it('serves the member their own proof', async () => {
    const res = await GET(req('payment-proofs/proof-abc.pdf'))

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it("says 404, not 403, for somebody else's proof", async () => {
    // A distinct "forbidden" would confirm the object exists, which turns this
    // route into a way to test guesses about other members' records.
    mocks.findFirst.mockResolvedValue(null)

    const res = await GET(req('payment-proofs/someone-elses.pdf'))

    expect(res.status).toBe(404)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('refuses a caller with no session', async () => {
    mocks.auth.mockResolvedValue(null)

    expect((await GET(req('payment-proofs/proof-abc.pdf'))).status).toBe(401)
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  it('refuses a reference that is really a URL', async () => {
    // Without this the route would fetch whatever it was pointed at, on the
    // server, with the server's network position.
    for (const bad of ['https://evil.test/x', 'http://169.254.169.254/latest/meta-data/']) {
      expect((await GET(req(bad))).status).toBe(400)
    }
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  it('refuses a data: reference rather than proxying it', async () => {
    // Local development stores objects as self-contained data URLs, which
    // render directly and never reach here. One arriving means something
    // upstream is confused.
    expect((await GET(req('data:application/pdf;base64,AAAA'))).status).toBe(400)
  })

  it('does not let a proxy keep the document', async () => {
    const res = await GET(req('payment-proofs/proof-abc.pdf'))

    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('reports a missing object rather than streaming a non-200 from the store', async () => {
    // `get` resolves to a 304 variant with a null stream on a conditional
    // request. That is not bytes.
    mocks.get.mockResolvedValue({ statusCode: 304, stream: null, blob: {} })

    expect((await GET(req('payment-proofs/proof-abc.pdf'))).status).toBe(404)
  })
})

describe('what a payment is allowed to rest on', () => {
  const base = {
    userId: 'member-1',
    amount: 200,
    periodMonth: 6,
    periodYear: 2026,
    receivedAt: new Date('2026-06-15'),
    reference: 'EFT 8231',
  }

  it('refuses a payment with no evidence at all', async () => {
    // The whole reason the field exists. Without it an offline row is one
    // person's word that money arrived, and nothing lets anybody else check.
    const res = OfflineContributionSchema.safeParse(base)

    expect(res.success).toBe(false)
  })

  it('accepts a stored document', () => {
    expect(
      OfflineContributionSchema.safeParse({ ...base, proofUrl: 'payment-proofs/proof-abc.pdf' }).success,
    ).toBe(true)
  })

  it('accepts a witness note instead, for cash', () => {
    // The honest exception. Money handed over at a meeting has no proof of
    // payment, and a hard file requirement would mean either the cash goes
    // unrecorded — the exact failure the offline path exists to prevent — or
    // somebody attaches something irrelevant to get past the gate.
    expect(
      OfflineContributionSchema.safeParse({
        ...base,
        proofWitness: 'Counted by Kurhula and Thandi at the August meeting',
      }).success,
    ).toBe(true)
  })

  it('refuses a witness note too short to name anybody', () => {
    expect(OfflineContributionSchema.safeParse({ ...base, proofWitness: 'cash' }).success).toBe(false)
  })

  it('refuses both at once', () => {
    // Not pedantry. With both set, a later reader cannot tell which one the
    // payment actually rests on — and the witness note would read as
    // corroboration of a document nobody witnessed.
    expect(
      OfflineContributionSchema.safeParse({
        ...base,
        proofUrl: 'payment-proofs/proof-abc.pdf',
        proofWitness: 'Counted by Kurhula and Thandi at the August meeting',
      }).success,
    ).toBe(false)
  })
})
