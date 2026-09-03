import { describe, it, expect, vi, beforeEach } from 'vitest'

const { models, auditCreate, transaction } = vi.hoisted(() => {
  const counter = () => ({ count: vi.fn(), deleteMany: vi.fn() })
  return {
    models: {
      user: { findUnique: vi.fn() },
      dataSubjectRequest: { findUnique: vi.fn() },
      loginHistory: counter(),
      notification: counter(),
      contribution: counter(),
      transaction: counter(),
      // Money a member directed at a specific goal. Its own table, so its own
      // counter — the financial tally used to be contributions plus
      // transactions, which left every rand given to a goal out of the answer a
      // data subject is entitled to.
      goalPayment: counter(),
      paymentMandate: counter(),
      bankAccount: counter(),
      auditLog: counter(),
      communityMessage: counter(),
      invitation: counter(),
    },
    auditCreate: vi.fn(),
    transaction: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({
  db: {
    ...models,
    auditLog: { ...models.auditLog, create: auditCreate },
    $transaction: (fn: unknown) => transaction(fn),
  },
  Prisma: {},
}))

import { assessErasure, eraseErasableData, RETENTION_DAYS } from '@/lib/services/erasure'
import { AdminConflictError, AdminNotFoundError } from '@/lib/services/shared'

const ADMIN = ['ADMIN']
const ADMIN_ID = 'admin-1'
const SUBJECT = 'user-1'

/** Every count returns 0 unless a test says otherwise. */
function allCountsZero() {
  for (const m of Object.values(models)) {
    if ('count' in m) (m.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
    if ('deleteMany' in m) (m.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
  }
}

function category(assessment: { categories: Array<{ key: string }> }, key: string) {
  const found = assessment.categories.find((c) => c.key === key)
  if (!found) throw new Error(`no category ${key}`)
  return found as unknown as {
    key: string; count: number; disposition: string; basis: string; erasableFrom: Date | null
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  allCountsZero()
  models.user.findUnique.mockResolvedValue({
    id: SUBJECT, firstName: 'Thandi', lastName: 'Mokoena', resignedAt: null, deletedAt: null,
  })
  auditCreate.mockResolvedValue({})
  // Run the transaction body against the same mocked models.
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(models))
})

describe('assessing what is held', () => {
  it('reports the member by name so the answer can be checked against a person', async () => {
    const a = await assessErasure(ADMIN, SUBJECT)
    expect(a.subjectName).toBe('Thandi Mokoena')
  })

  it('refuses to assess someone who does not exist', async () => {
    models.user.findUnique.mockResolvedValue(null)
    await expect(assessErasure(ADMIN, SUBJECT)).rejects.toBeInstanceOf(AdminNotFoundError)
  })

  it('counts transactions through the contribution, not a userId they do not have', async () => {
    // Transaction has no userId column. Counting on one would silently report
    // zero financial records for every member.
    await assessErasure(ADMIN, SUBJECT)
    expect(models.transaction.count).toHaveBeenCalledWith({
      where: { contribution: { userId: SUBJECT } },
    })
  })

  it('keeps identity while they are still a member', async () => {
    const a = await assessErasure(ADMIN, SUBJECT)
    const identity = category(a, 'identity')
    expect(identity.disposition).toBe('RETAINED')
    expect(identity.erasableFrom).toBeNull()
  })

  it('dates identity from when membership ended, not from the request', async () => {
    models.user.findUnique.mockResolvedValue({
      id: SUBJECT, firstName: 'T', lastName: 'M',
      resignedAt: new Date('2024-03-01T00:00:00Z'), deletedAt: null,
    })
    const a = await assessErasure(ADMIN, SUBJECT)
    expect(a.membershipEndedAt?.toISOString().slice(0, 10)).toBe('2024-03-01')
    expect(category(a, 'identity').erasableFrom?.toISOString().slice(0, 10)).toBe('2029-03-01')
  })

  it('never marks financial records erasable, however old', async () => {
    models.contribution.count.mockResolvedValue(60)
    models.transaction.count.mockResolvedValue(60)
    models.user.findUnique.mockResolvedValue({
      id: SUBJECT, firstName: 'T', lastName: 'M',
      resignedAt: new Date('2005-01-01T00:00:00Z'), deletedAt: null,
    })
    const a = await assessErasure(ADMIN, SUBJECT)
    expect(category(a, 'financial').disposition).toBe('RETAINED')
    expect(category(a, 'mandates').disposition).toBe('RETAINED')
  })

  it('never marks the audit log erasable', async () => {
    models.auditLog.count.mockResolvedValue(400)
    const a = await assessErasure(ADMIN, SUBJECT)
    expect(category(a, 'auditLog').disposition).toBe('PERMANENT')
  })

  it('marks sign-in records past their period as erasable', async () => {
    models.loginHistory.count.mockResolvedValue(12)
    const a = await assessErasure(ADMIN, SUBJECT)
    expect(category(a, 'loginHistory').disposition).toBe('ERASABLE_NOW')
    expect(a.erasableCount).toBe(12)
  })

  it('only counts sign-in records older than the period', async () => {
    await assessErasure(ADMIN, SUBJECT)
    const where = models.loginHistory.count.mock.calls[0]?.[0] as {
      where: { createdAt: { lt: Date } }
    }
    const ageDays = (Date.now() - where.where.createdAt.lt.getTime()) / 86_400_000
    expect(Math.round(ageDays)).toBe(RETENTION_DAYS.loginHistory)
  })

  it('gives a reason for everything it keeps', async () => {
    models.contribution.count.mockResolvedValue(5)
    const a = await assessErasure(ADMIN, SUBJECT)
    // Refusing part of a deletion request without recorded grounds is itself a
    // contravention, so every category must arrive with words to give back.
    for (const c of a.categories) {
      expect(c.basis.length).toBeGreaterThan(20)
    }
  })

  it('flags that the answer must be partial when anything is retained', async () => {
    models.contribution.count.mockResolvedValue(5)
    const a = await assessErasure(ADMIN, SUBJECT)
    expect(a.hasRetainedData).toBe(true)
  })
})

describe('erasing', () => {
  beforeEach(() => {
    models.dataSubjectRequest.findUnique.mockResolvedValue({
      id: 'dsr-1', kind: 'DELETION', status: 'IN_PROGRESS',
    })
  })

  it('refuses without a deletion request behind it', async () => {
    models.dataSubjectRequest.findUnique.mockResolvedValue({
      id: 'dsr-1', kind: 'ACCESS', status: 'IN_PROGRESS',
    })
    await expect(
      eraseErasableData(ADMIN, ADMIN_ID, { subjectId: SUBJECT, requestId: 'dsr-1' }),
    ).rejects.toBeInstanceOf(AdminConflictError)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('refuses when the request is already closed', async () => {
    models.dataSubjectRequest.findUnique.mockResolvedValue({
      id: 'dsr-1', kind: 'DELETION', status: 'COMPLETED',
    })
    await expect(
      eraseErasableData(ADMIN, ADMIN_ID, { subjectId: SUBJECT, requestId: 'dsr-1' }),
    ).rejects.toBeInstanceOf(AdminConflictError)
  })

  it('reports a missing request rather than erasing anyway', async () => {
    models.dataSubjectRequest.findUnique.mockResolvedValue(null)
    await expect(
      eraseErasableData(ADMIN, ADMIN_ID, { subjectId: SUBJECT, requestId: 'nope' }),
    ).rejects.toBeInstanceOf(AdminNotFoundError)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('deletes only what the assessment cleared', async () => {
    models.loginHistory.count.mockResolvedValue(9)
    models.loginHistory.deleteMany.mockResolvedValue({ count: 9 })
    // Notifications are all inside their period, so none are erasable.
    models.notification.count.mockResolvedValue(0)

    const { deleted } = await eraseErasableData(ADMIN, ADMIN_ID, {
      subjectId: SUBJECT, requestId: 'dsr-1',
    })

    expect(deleted).toEqual({ loginHistory: 9 })
    expect(models.notification.deleteMany).not.toHaveBeenCalled()
  })

  it('never touches financial records, mandates or the audit log', async () => {
    models.loginHistory.count.mockResolvedValue(3)
    models.loginHistory.deleteMany.mockResolvedValue({ count: 3 })
    models.contribution.count.mockResolvedValue(40)

    await eraseErasableData(ADMIN, ADMIN_ID, { subjectId: SUBJECT, requestId: 'dsr-1' })

    expect(models.contribution.deleteMany).not.toHaveBeenCalled()
    expect(models.transaction.deleteMany).not.toHaveBeenCalled()
    expect(models.goalPayment.deleteMany).not.toHaveBeenCalled()
    expect(models.paymentMandate.deleteMany).not.toHaveBeenCalled()
    expect(models.bankAccount.deleteMany).not.toHaveBeenCalled()
    expect(models.auditLog.deleteMany).not.toHaveBeenCalled()
  })

  it('does everything in one transaction', async () => {
    models.loginHistory.count.mockResolvedValue(2)
    models.loginHistory.deleteMany.mockResolvedValue({ count: 2 })
    await eraseErasableData(ADMIN, ADMIN_ID, { subjectId: SUBJECT, requestId: 'dsr-1' })
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  it('records what was removed and what was kept, with the reasons', async () => {
    models.loginHistory.count.mockResolvedValue(4)
    models.loginHistory.deleteMany.mockResolvedValue({ count: 4 })
    models.contribution.count.mockResolvedValue(30)

    await eraseErasableData(ADMIN, ADMIN_ID, { subjectId: SUBJECT, requestId: 'dsr-1' })

    const entry = auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(entry.data.action).toBe('DSR_ERASURE_EXECUTED')
    const payload = entry.data.payload as { deleted: unknown; retained: Array<{ key: string }> }
    expect(payload.deleted).toEqual({ loginHistory: 4 })
    expect(payload.retained.map((r) => r.key)).toContain('financial')
  })

  it('ties the erasure to the request that prompted it', async () => {
    await eraseErasableData(ADMIN, ADMIN_ID, { subjectId: SUBJECT, requestId: 'dsr-1' })
    const entry = auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect((entry.data.payload as { requestId: string }).requestId).toBe('dsr-1')
  })
})
