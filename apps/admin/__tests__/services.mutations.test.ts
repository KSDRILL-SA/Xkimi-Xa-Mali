import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// The mandate service hands rejection to the member app, and that client
// reads validated env at import time — which a test process does not have.
const apiMocks = vi.hoisted(() => ({ internalAdminPost: vi.fn().mockResolvedValue({ ok: true, status: 200, data: null }) }))
vi.mock('@/lib/api', () => ({ internalAdminPost: apiMocks.internalAdminPost }))

vi.mock('@/lib/db', () => ({
  db: {
    user:            { findUnique: vi.fn(), update: vi.fn(), count: vi.fn()},
    role:            { findUnique: vi.fn() },
    // `count` is how a revocation establishes there is another admin to fall
    // back on. Left off, the policy refuses rather than guessing.
    userRole:        { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    paymentMandate:  { findMany: vi.fn() },
    contribution:    { findMany: vi.fn(), createMany: vi.fn() },
    invitation:      { findUnique: vi.fn(), update: vi.fn() },
    adminSignature:  { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    adminSignatureHistory: { create: vi.fn() },
    inboxMessage:    { create: vi.fn().mockResolvedValue({}) },
    auditLog:        { create: vi.fn().mockResolvedValue({}) },
    $transaction:    vi.fn(),
  },
  Prisma: {},
}))
vi.mock('@/lib/signature-storage', () => ({
  storeSignaturePng: vi.fn().mockResolvedValue('https://blob/sig.png'),
}))
vi.mock('@/lib/role-version', () => ({
  publishRoleVersion: vi.fn().mockResolvedValue(undefined),
}))

import { db } from '@/lib/db'
import { publishRoleVersion } from '@/lib/role-version'
import {
  setMemberStatus,
  setMemberRole,
  generateContributions,
  createSignature,
  updateSignature,
  AdminConflictError,
  AdminNotFoundError,
  SignatureLockError,
} from '@/lib/services'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>
const ADMIN = ['ADMIN']

beforeEach(() => {
  vi.clearAllMocks()
  mock(db.inboxMessage.create).mockResolvedValue({} as never)
  mock(db.auditLog.create).mockResolvedValue({} as never)
  mock(publishRoleVersion).mockResolvedValue(undefined)
})

// ---------------------------------------------------------------------------
// Member status — the security-relevant part is roleVersion.
// ---------------------------------------------------------------------------

describe('setMemberStatus', () => {
  it('refuses a status the console does not offer', async () => {
    // The value comes from a form field. RESIGNED is a real enum member meaning
    // the member chose to leave — an admin writing it would put words in
    // somebody's mouth, and leave `resignedAt` null so the row disagrees with
    // itself.
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roles: [] } as never)

    await expect(setMemberStatus('a1', ADMIN, 'm1', 'RESIGNED', undefined, 'they asked to go'))
      .rejects.toThrow(/not a status leadership can set/i)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('refuses an admin suspending their own account', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'a1', status: 'ACTIVE', roles: [] } as never)

    await expect(setMemberStatus('a1', ADMIN, 'a1', 'SUSPENDED', undefined, 'stepping back for a while'))
      .rejects.toThrow(/cannot suspend your own account/i)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('refuses suspending the last admin who can sign in', async () => {
    // The circle would be left with a console nobody can open.
    mock(db.user.findUnique).mockResolvedValue({
      id: 'm1', status: 'ACTIVE', roles: [{ role: { name: 'ADMIN' } }],
    } as never)
    mock(db.user.count).mockResolvedValue(1 as never)

    await expect(setMemberStatus('a1', ADMIN, 'm1', 'SUSPENDED', undefined, 'handing over to new leadership'))
      .rejects.toThrow(/last admin/i)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('requires a reason before taking access away', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roles: [] } as never)

    await expect(setMemberStatus('a1', ADMIN, 'm1', 'SUSPENDED', undefined, 'bad'))
      .rejects.toThrow(/at least 10 characters/i)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('records the reason with the transition', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roles: [] } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', status: 'SUSPENDED', roleVersion: 2 } as never)

    await setMemberStatus('a1', ADMIN, 'm1', 'SUSPENDED', '41.0.0.1', '  Repeated failed collections  ')

    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'ADMIN_MEMBER_STATUS_CHANGED',
        payload: expect.objectContaining({
          from: 'ACTIVE', to: 'SUSPENDED', reason: 'Repeated failed collections',
        }),
      }),
    }))
  })

  it('asks for no reason when giving access back', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'SUSPENDED', roles: [] } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roleVersion: 3 } as never)

    await expect(setMemberStatus('a1', ADMIN, 'm1', 'ACTIVE')).resolves.toBeDefined()
  })

  it('bumps roleVersion, which is what forces the member back through login', async () => {
    // Suspending someone whose session stays valid suspends nothing. The version
    // bump is what invalidates the token they are already holding.
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roles: [] } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', status: 'SUSPENDED', roleVersion: 2 } as never)

    await setMemberStatus('a1', ADMIN, 'm1', 'SUSPENDED', '41.0.0.1', 'Repeated failed collections, agreed with the member')

    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUSPENDED', roleVersion: { increment: 1 } }),
      }),
    )
    expect(publishRoleVersion).toHaveBeenCalledWith('m1', 2)
  })

  it('refuses a change that changes nothing', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roles: [] } as never)
    await expect(setMemberStatus('a1', ADMIN, 'm1', 'ACTIVE')).rejects.toBeInstanceOf(AdminConflictError)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('throws not-found rather than creating anything', async () => {
    mock(db.user.findUnique).mockResolvedValue(null as never)
    await expect(setMemberStatus('a1', ADMIN, 'ghost', 'ACTIVE')).rejects.toBeInstanceOf(AdminNotFoundError)
  })

  it('welcomes a member on activation', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'PENDING', roles: [] } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roleVersion: 3 } as never)

    await setMemberStatus('a1', ADMIN, 'm1', 'ACTIVE')

    expect(db.inboxMessage.create).toHaveBeenCalled()
    expect(publishRoleVersion).toHaveBeenCalledWith('m1', 3)
  })

  it('does not welcome anyone on suspension', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roles: [] } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', status: 'SUSPENDED', roleVersion: 2 } as never)

    await setMemberStatus('a1', ADMIN, 'm1', 'SUSPENDED', undefined, 'Repeated failed collections, agreed with the member')

    expect(db.inboxMessage.create).not.toHaveBeenCalled()
  })

  it('records the transition it made, both ends of it', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', status: 'PENDING', roles: [] } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', status: 'ACTIVE', roleVersion: 3 } as never)

    await setMemberStatus('a1', ADMIN, 'm1', 'ACTIVE', '41.0.0.1')

    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ADMIN_MEMBER_STATUS_CHANGED',
          payload: { from: 'PENDING', to: 'ACTIVE' },
          ipAddress: '41.0.0.1',
        }),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

describe('setMemberRole', () => {
  beforeEach(() => {
    mock(db.role.findUnique).mockResolvedValue({ id: 'role-admin', name: 'ADMIN' } as never)
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1' } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', roleVersion: 2 } as never)
    mock(db.userRole.upsert).mockResolvedValue({} as never)
    mock(db.userRole.deleteMany).mockResolvedValue({ count: 1 } as never)
    // Three admins, so the revocations below are ordinary ones rather than the
    // last-admin case. Without this the count reads as undefined, which the
    // policy treats as "cannot establish there is another admin" and refuses —
    // deliberately, because a failed count must not read as plenty.
    // The refusals themselves are covered in role-change-guards.test.ts.
    mock(db.userRole.count).mockResolvedValue(3 as never)
  })

  it('granting admin is idempotent — a second grant does not duplicate the role', async () => {
    await setMemberRole('a1', ADMIN, 'm1', 'ADMIN', true)
    expect(db.userRole.upsert).toHaveBeenCalled()
    expect(db.userRole.deleteMany).not.toHaveBeenCalled()
  })

  it('removing admin deletes the link', async () => {
    await setMemberRole('a1', ADMIN, 'm1', 'ADMIN', false)
    expect(db.userRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'm1', roleId: 'role-admin' } })
    expect(db.userRole.upsert).not.toHaveBeenCalled()
  })

  it('bumps roleVersion either way, so the old session cannot keep the old rights', async () => {
    await setMemberRole('a1', ADMIN, 'm1', 'ADMIN', false)
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roleVersion: { increment: 1 } } }),
    )
    expect(publishRoleVersion).toHaveBeenCalledWith('m1', 2)
  })

  it('publishes the new version when assigning admin', async () => {
    mock(db.user.update).mockResolvedValue({ id: 'm1', roleVersion: 3 } as never)

    await setMemberRole('a1', ADMIN, 'm1', 'ADMIN', true)

    expect(publishRoleVersion).toHaveBeenCalledWith('m1', 3)
  })

  it('throws when the role does not exist, before touching the member', async () => {
    mock(db.role.findUnique).mockResolvedValue(null as never)
    await expect(setMemberRole('a1', ADMIN, 'm1', 'ADMIN', true)).rejects.toBeInstanceOf(AdminNotFoundError)
    expect(db.userRole.upsert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Bulk contribution generation — running this twice must not bill anyone twice.
// ---------------------------------------------------------------------------

describe('generateContributions — the period it is given', () => {
  it('refuses a period nobody could mean, before touching anything', async () => {
    // The database would refuse 2099 only via `chk_contribution_year`'s upper
    // bound of 2100 — which is to say, it would accept it. Eighty years of
    // "valid" periods, on the one action that writes to every member at once.
    await expect(generateContributions('a1', ADMIN, 1, 2099))
      .rejects.toThrow(/more than a year away/i)
    expect(db.contribution.createMany).not.toHaveBeenCalled()
  })

  it('refuses what parseInt makes of an empty field', async () => {
    // The console read the period with `parseInt(fd.get('month'))`.
    await expect(generateContributions('a1', ADMIN, NaN, 2026))
      .rejects.toThrow(/choose a month and a year/i)
    expect(db.paymentMandate.findMany).not.toHaveBeenCalled()
  })

  it('refuses a month that is not one', async () => {
    await expect(generateContributions('a1', ADMIN, 13, 2026))
      .rejects.toThrow(/not a month/i)
  })

  it('still allows catching up on a month that was missed', async () => {
    // Overdue on arrival, which the confirmation says — not something to forbid.
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    mock(db.paymentMandate.findMany).mockResolvedValue([] as never)
    mock(db.contribution.findMany).mockResolvedValue([] as never)

    await expect(
      generateContributions('a1', ADMIN, lastMonth.getMonth() + 1, lastMonth.getFullYear()),
    ).resolves.toMatchObject({ created: 0 })
  })
})

describe('generateContributions', () => {
  const mandates = [
    { userId: 'u1', debitDay: 25, amount: 100 },
    { userId: 'u2', debitDay: 1,  amount: 250 },
  ]

  it('skips members who already have a contribution for the period', async () => {
    mock(db.paymentMandate.findMany).mockResolvedValue(mandates as never)
    mock(db.contribution.findMany).mockResolvedValue([{ userId: 'u1' }] as never)
    mock(db.contribution.createMany).mockResolvedValue({ count: 1 } as never)

    const res = await generateContributions('a1', ADMIN, 8, 2026)

    expect(res).toEqual({ created: 1, skipped: 1, total: 2 })
    const [{ data }] = mock(db.contribution.createMany).mock.calls[0] as unknown as [{ data: Array<{ userId: string }> }]
    expect(data.map((d) => d.userId)).toEqual(['u2'])
  })

  it('writes nothing at all when everyone is already covered', async () => {
    mock(db.paymentMandate.findMany).mockResolvedValue(mandates as never)
    mock(db.contribution.findMany).mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }] as never)

    const res = await generateContributions('a1', ADMIN, 8, 2026)

    expect(res).toEqual({ created: 0, skipped: 2, total: 2 })
    expect(db.contribution.createMany).not.toHaveBeenCalled()
  })

  it('takes the amount and the due day from each mandate, not a shared default', async () => {
    mock(db.paymentMandate.findMany).mockResolvedValue(mandates as never)
    mock(db.contribution.findMany).mockResolvedValue([] as never)
    mock(db.contribution.createMany).mockResolvedValue({ count: 2 } as never)

    await generateContributions('a1', ADMIN, 8, 2026)

    const [{ data }] = mock(db.contribution.createMany).mock.calls[0] as unknown as [{ data: Array<Record<string, unknown>> }]
    expect(data[0]).toMatchObject({ userId: 'u1', amountDue: 100, amountPaid: 0, status: 'PENDING' })
    expect((data[0]!.dueDate as Date).getDate()).toBe(25)
    expect(data[1]).toMatchObject({ userId: 'u2', amountDue: 250 })
    expect((data[1]!.dueDate as Date).getDate()).toBe(1)
  })

  it('only bills members whose mandate and account are both active', async () => {
    mock(db.paymentMandate.findMany).mockResolvedValue([] as never)
    mock(db.contribution.findMany).mockResolvedValue([] as never)

    await generateContributions('a1', ADMIN, 8, 2026)

    expect(db.paymentMandate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', user: { status: 'ACTIVE' } },
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Signatures — a 90-day lock stands behind every signed statement.
// ---------------------------------------------------------------------------

describe('admin signature', () => {
  it('refuses a second signature rather than silently replacing the first', async () => {
    mock(db.adminSignature.findUnique).mockResolvedValue({ id: 's1' } as never)
    await expect(createSignature('a1', ADMIN, Buffer.from('png'), 'K M'))
      .rejects.toBeInstanceOf(AdminConflictError)
  })

  it('locks the new signature for the change window', async () => {
    mock(db.adminSignature.findUnique).mockResolvedValue(null as never)
    mock(db.adminSignature.create).mockResolvedValue({
      id: 's1', signatureUrl: 'u', signatureHash: 'h', displayName: 'K M',
      isActive: true, nextChangeAllowedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    } as never)

    await createSignature('a1', ADMIN, Buffer.from('png'), 'K M')

    const [{ data }] = mock(db.adminSignature.create).mock.calls[0] as unknown as [{ data: { nextChangeAllowedAt: Date } }]
    expect(data.nextChangeAllowedAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('refuses a replacement inside the lock, and says when it lifts', async () => {
    const lifts = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    mock(db.adminSignature.findUnique).mockResolvedValue({
      id: 's1', signatureUrl: 'u', signatureHash: 'h', nextChangeAllowedAt: lifts,
    } as never)

    await expect(updateSignature('a1', ADMIN, Buffer.from('png'), 'K M'))
      .rejects.toMatchObject({ nextChangeAllowedAt: lifts.toISOString() })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('allows a replacement once the lock has lifted, keeping the old one on record', async () => {
    const lifted = new Date(Date.now() - 1000)
    mock(db.adminSignature.findUnique).mockResolvedValue({
      id: 's1', signatureUrl: 'old-url', signatureHash: 'old-hash', nextChangeAllowedAt: lifted,
    } as never)
    const tx = {
      adminSignatureHistory: { create: vi.fn().mockResolvedValue({}) },
      adminSignature: { update: vi.fn().mockResolvedValue({
        id: 's1', signatureUrl: 'u', signatureHash: 'h', displayName: 'K M',
        isActive: true, nextChangeAllowedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      }) },
    }
    mock(db.$transaction).mockImplementation((async (fn: (c: typeof tx) => unknown) => fn(tx)) as never)

    await updateSignature('a1', ADMIN, Buffer.from('png'), 'K M')

    // The superseded signature is archived, not overwritten — signed statements
    // must stay verifiable against the signature that actually signed them.
    expect(tx.adminSignatureHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ signatureUrl: 'old-url', signatureHash: 'old-hash' }),
      }),
    )
  })

  it('throws not-found when replacing a signature that was never uploaded', async () => {
    mock(db.adminSignature.findUnique).mockResolvedValue(null as never)
    await expect(updateSignature('a1', ADMIN, Buffer.from('png'), 'K M'))
      .rejects.toBeInstanceOf(AdminNotFoundError)
  })
})

// Keeps the import used and documents the type in play.
describe('SignatureLockError', () => {
  it('carries the date the lock lifts', () => {
    const at = new Date('2026-12-01T00:00:00.000Z')
    expect(new SignatureLockError(at).nextChangeAllowedAt).toBe(at.toISOString())
  })
})
