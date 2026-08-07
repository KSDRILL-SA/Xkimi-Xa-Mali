import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const tx = {
  goal: { updateMany: vi.fn(), update: vi.fn() },
}

vi.mock('@/lib/db', () => ({
  db: {
    goal: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    goalProgress: { create: vi.fn() },
    contribution: { aggregate: vi.fn() },
    goalPayment: { aggregate: vi.fn() },
    inboxMessage: { create: vi.fn().mockResolvedValue({}), createMany: vi.fn().mockResolvedValue({}) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(),
  },
  Prisma: {},
}))
vi.mock('@/lib/signature-storage', () => ({ storeSignaturePng: vi.fn() }))
vi.mock('@/lib/env', () => ({
  env: { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
}))

import { db } from '@/lib/db'
import {
  setPrimaryGoal,
  recordGoalProgress,
  activateGoal,
  rejectGoal,
  AdminForbiddenError,
  AdminNotFoundError,
  AdminConflictError,
} from '@/lib/services'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>
const ADMIN = ['ADMIN']
const NOT_ADMIN = ['MEMBER']

/** An ACTIVE, non-primary goal with a deadline inside 2026. */
const activeGoal = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  title: '2026 Fund',
  status: 'ACTIVE',
  isPrimary: false,
  targetAmount: 120_000,
  currentAmount: 0,
  deadline: new Date('2026-12-01T00:00:00.000Z'),
  version: 0,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  tx.goal.updateMany.mockResolvedValue({ count: 0 })
  // The transaction callback runs against the tx client.
  mock(db.$transaction).mockImplementation((async (fn: (c: typeof tx) => unknown) => fn(tx)) as never)
  mock(db.contribution.aggregate).mockResolvedValue({ _sum: { amountPaid: null } } as never)
  mock(db.goalPayment.aggregate).mockResolvedValue({ _sum: { amount: null } } as never)
})

describe('setPrimaryGoal', () => {
  it('rejects a non-admin caller before any data access', async () => {
    await expect(setPrimaryGoal('a1', NOT_ADMIN, 'g1')).rejects.toBeInstanceOf(AdminForbiddenError)
    expect(db.goal.findUnique).not.toHaveBeenCalled()
  })

  it('throws not-found for an unknown goal', async () => {
    mock(db.goal.findUnique).mockResolvedValue(null as never)
    await expect(setPrimaryGoal('a1', ADMIN, 'nope')).rejects.toBeInstanceOf(AdminNotFoundError)
  })

  it('refuses a goal that is not ACTIVE', async () => {
    mock(db.goal.findUnique).mockResolvedValue(activeGoal({ status: 'DRAFT' }) as never)
    await expect(setPrimaryGoal('a1', ADMIN, 'g1')).rejects.toBeInstanceOf(AdminConflictError)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('is a no-op when the goal is already the primary fund', async () => {
    mock(db.goal.findUnique).mockResolvedValue(activeGoal({ isPrimary: true }) as never)

    const res = await setPrimaryGoal('a1', ADMIN, 'g1')

    expect(res.isPrimary).toBe(true)
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })

  it('demotes the incumbent and promotes the new fund in one transaction', async () => {
    mock(db.goal.findUnique).mockResolvedValue(activeGoal() as never)
    tx.goal.update.mockResolvedValue(activeGoal({ isPrimary: true }) as never)

    await setPrimaryGoal('a1', ADMIN, 'g1')

    // Demotion must happen inside the same transaction as the promotion —
    // the partial unique index permits only one primary row at a time.
    expect(tx.goal.updateMany).toHaveBeenCalledWith({ where: { isPrimary: true }, data: { isPrimary: false } })
    expect(tx.goal.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { isPrimary: true } })
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'GOAL_SET_PRIMARY', entityId: 'g1' }) }),
    )
  })

  it('fills the new fund from contributions already paid in its deadline-year', async () => {
    mock(db.goal.findUnique).mockResolvedValue(activeGoal() as never)
    tx.goal.update.mockResolvedValue(activeGoal({ isPrimary: true }) as never)
    mock(db.contribution.aggregate).mockResolvedValue({ _sum: { amountPaid: 4200.5 } } as never)
    mock(db.goalPayment.aggregate).mockResolvedValue({ _sum: { amount: 300.25 } } as never)

    await setPrimaryGoal('a1', ADMIN, 'g1')

    expect(db.contribution.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodYear: 2026 } }),
    )
    expect(db.goalPayment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { goalId: 'g1', status: 'SUCCESS' } }),
    )
    expect(db.goal.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { currentAmount: 4500.75 } })
  })

  it('leaves the status alone even when the derived total already covers the target', async () => {
    // The member app owns the ACTIVE→ACHIEVED transition because it also fires
    // the group celebration; flipping it here would skip that celebration.
    mock(db.goal.findUnique).mockResolvedValue(activeGoal({ targetAmount: 1000 }) as never)
    tx.goal.update.mockResolvedValue(activeGoal({ targetAmount: 1000, isPrimary: true }) as never)
    mock(db.contribution.aggregate).mockResolvedValue({ _sum: { amountPaid: 5000 } } as never)

    await setPrimaryGoal('a1', ADMIN, 'g1')

    expect(db.goal.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { currentAmount: 5000 } })
  })

  it('skips the write when the derived total already matches', async () => {
    mock(db.goal.findUnique).mockResolvedValue(activeGoal({ currentAmount: 2000 }) as never)
    tx.goal.update.mockResolvedValue(activeGoal({ currentAmount: 2000, isPrimary: true }) as never)
    mock(db.contribution.aggregate).mockResolvedValue({ _sum: { amountPaid: 2000 } } as never)

    await setPrimaryGoal('a1', ADMIN, 'g1')

    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('still reports success when the initial fill fails — the designation is what matters', async () => {
    mock(db.goal.findUnique).mockResolvedValue(activeGoal() as never)
    tx.goal.update.mockResolvedValue(activeGoal({ isPrimary: true }) as never)
    mock(db.contribution.aggregate).mockRejectedValue(new Error('db down') as never)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await setPrimaryGoal('a1', ADMIN, 'g1')

    expect(res.isPrimary).toBe(true)
    consoleError.mockRestore()
  })
})

describe('recordGoalProgress — primary fund guard', () => {
  it('refuses a manual top-up on the primary fund', async () => {
    // Its total is derived from real money; a typed-in figure would be wiped by
    // the next sync and leave a phantom progress row behind.
    mock(db.goal.findUnique).mockResolvedValue(activeGoal({ isPrimary: true }) as never)

    await expect(recordGoalProgress('a1', ADMIN, 'g1', 500)).rejects.toBeInstanceOf(AdminConflictError)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('still records progress on an ordinary active goal', async () => {
    mock(db.goal.findUnique).mockResolvedValue(activeGoal({ currentAmount: 100 }) as never)
    tx.goal.updateMany.mockResolvedValue({ count: 1 })
    mock(db.$transaction).mockImplementation((async (fn: (c: unknown) => unknown) => fn({
      goalProgress: { create: vi.fn().mockResolvedValue({ id: 'p1', amount: 500 }) },
      goal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    })) as never)

    const res = await recordGoalProgress('a1', ADMIN, 'g1', 500)

    expect(res.newTotal).toBe(600)
    expect(res.achieved).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Reviewing a member's proposal — the two answers to step 2 of the guide's flow
// ---------------------------------------------------------------------------

describe('reviewing a proposal', () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    id: 'g1',
    title: 'Catering equipment',
    status: 'DRAFT',
    createdById: 'member-1',
    ...over,
  })

  const REASON = 'Not affordable alongside the year-end fund'

  it('rejectGoal refuses a non-admin before reading anything', async () => {
    await expect(rejectGoal('m1', NOT_ADMIN, 'g1', REASON)).rejects.toBeInstanceOf(AdminForbiddenError)
    expect(db.goal.findUnique).not.toHaveBeenCalled()
  })

  it('keeps the proposal as REJECTED rather than deleting it', async () => {
    mock(db.goal.findUnique).mockResolvedValue(draft() as never)
    mock(db.goal.update).mockResolvedValue({} as never)

    await rejectGoal('admin-1', ADMIN, 'g1', REASON)

    // The founders' decision, on the guide's own principle that nothing is
    // quietly removed: the member can see it was considered, and read why.
    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          rejectionReason: REASON,
          reviewedById: 'admin-1',
        }),
      }),
    )
  })

  it('requires a reason before declining', async () => {
    mock(db.goal.findUnique).mockResolvedValue(draft() as never)

    await expect(rejectGoal('admin-1', ADMIN, 'g1', '   ')).rejects.toBeInstanceOf(AdminConflictError)
    await expect(rejectGoal('admin-1', ADMIN, 'g1', 'no')).rejects.toBeInstanceOf(AdminConflictError)
    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('tells the member who proposed it, with the reason', async () => {
    mock(db.goal.findUnique).mockResolvedValue(draft() as never)
    mock(db.goal.update).mockResolvedValue({} as never)

    await rejectGoal('admin-1', ADMIN, 'g1', REASON)

    expect(db.inboxMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'member-1', category: 'GOAL' }),
      }),
    )
    const body = mock(db.inboxMessage.create).mock.calls[0]![0] as unknown as { data: { body: string } }
    expect(body.data.body).toContain(REASON)
  })

  it('tells the member when their proposal is approved', async () => {
    mock(db.goal.findUnique).mockResolvedValue(draft() as never)
    mock(db.goal.update).mockResolvedValue({} as never)

    await activateGoal('admin-1', ADMIN, 'g1')

    // A review nobody hears the result of is not a review.
    expect(db.inboxMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'member-1' }),
      }),
    )
    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE', reviewedById: 'admin-1' }),
      }),
    )
  })

  it('does not send a leader an inbox message about their own draft', async () => {
    mock(db.goal.findUnique).mockResolvedValue(draft({ createdById: 'admin-1' }) as never)
    mock(db.goal.update).mockResolvedValue({} as never)

    await activateGoal('admin-1', ADMIN, 'g1')

    expect(db.inboxMessage.create).not.toHaveBeenCalled()
  })

  it('refuses to decline a goal that is no longer a draft', async () => {
    mock(db.goal.findUnique).mockResolvedValue(draft({ status: 'ACTIVE' }) as never)

    await expect(rejectGoal('admin-1', ADMIN, 'g1', REASON)).rejects.toBeInstanceOf(AdminConflictError)
    expect(db.goal.update).not.toHaveBeenCalled()
  })
})
