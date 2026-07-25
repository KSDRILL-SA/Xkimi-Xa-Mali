import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    goal: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    goalProgress: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    contribution: { aggregate: vi.fn() },
    goalPayment: { aggregate: vi.fn() },
    user: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/env', () => ({
  env: { ENABLE_GOAL_LOCKING: true },
}))

vi.mock('@/lib/cache', () => ({
  cache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  },
  CACHE_KEYS: {
    DASHBOARD_STATS: 'xxm:cache:stats',
    DASHBOARD_STATS_TTL: 300,
    goalsPage: (s: string, p: number, l: number) => `xxm:cache:goals:${s}:${p}:${l}`,
    GOALS_TTL: 120,
  },
}))

vi.mock('@/services/audit.service', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/inngest', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  InngestEvents: { GOAL_ACHIEVED: 'xxm/goal.achieved' },
}))

vi.mock('@/services/inbox.service', () => ({
  createInboxMessages: vi.fn().mockResolvedValue(0),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { writeAuditLog } from '@/services/audit.service'
import { GoalNotFoundError, GoalConflictError, ForbiddenError } from '@/lib/errors'
import {
  createGoal,
  updateGoal,
  deleteGoal,
  activateGoal,
  lockGoal,
  recordProgress,
  markExpiredGoalsFailed,
  setPrimaryGoal,
  syncPrimaryGoalProgress,
  syncAdditionalGoalProgress,
  celebrateGoalAchieved,
} from '@/services/goal.service'
import { createInboxMessages } from '@/services/inbox.service'

const GoalForbiddenError = ForbiddenError
const mockWriteAuditLog = writeAuditLog as ReturnType<typeof vi.fn>

// Every goal write is admin-only; callers pass the requester's roles so the
// service self-enforces authorization (defence-in-depth behind the route guard).
const ADMIN = ['ADMIN']
const MEMBER = ['MEMBER']

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DRAFT_GOAL = {
  id: 'goal-1',
  title: 'End-of-year fund',
  description: null,
  type: 'YEARLY',
  targetAmount: 50000,
  currentAmount: 0,
  deadline: new Date(Date.now() + 86_400_000 * 365),
  status: 'DRAFT',
  lockedAt: null,
  lockedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const ACTIVE_GOAL = { ...DRAFT_GOAL, status: 'ACTIVE', currentAmount: 10000, version: 1 }
const LOCKED_GOAL = { ...ACTIVE_GOAL, lockedAt: new Date(), lockedById: 'admin-1' }

function mockGoalTransaction(progress: { id: string; amount: number; recordedAt: Date }) {
  ;(db.$transaction as MockedFunction<typeof db.$transaction>).mockImplementation(async (fn) => {
    const tx = {
      goalProgress: {
        create: vi.fn().mockResolvedValue(progress),
      },
      goal: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    return fn(tx as never)
  })
}

// ---------------------------------------------------------------------------
// createGoal
// ---------------------------------------------------------------------------

describe('createGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a DRAFT goal and writes audit log', async () => {
    ;(db.goal.create as MockedFunction<typeof db.goal.create>).mockResolvedValue(DRAFT_GOAL as never)

    const result = await createGoal(
      { title: 'End-of-year fund', type: 'YEARLY', targetAmount: 50000, deadline: '2026-12-31' },
      'admin-1',
      ADMIN,
      '127.0.0.1',
    )

    expect(db.goal.create).toHaveBeenCalledOnce()
    expect(db.goal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', currentAmount: 0 }),
      }),
    )
    expect(mockWriteAuditLog).toHaveBeenCalledOnce()
    expect(result.status).toBe('DRAFT')
    expect(result.progressPct).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// updateGoal
// ---------------------------------------------------------------------------

describe('updateGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates a DRAFT goal title', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(DRAFT_GOAL as never)
    const updated = { ...DRAFT_GOAL, title: 'New title' }
    ;(db.goal.update as MockedFunction<typeof db.goal.update>).mockResolvedValue(updated as never)
    ;(db.auditLog.create as MockedFunction<typeof db.auditLog.create>).mockResolvedValue({} as never)

    const result = await updateGoal('goal-1', { title: 'New title' }, 'admin-1', ADMIN, '127.0.0.1')
    expect(result.title).toBe('New title')
  })

  it('throws GoalNotFoundError when goal does not exist', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(null)
    await expect(updateGoal('bad-id', {}, 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalNotFoundError)
  })

  it('throws GoalConflictError when goal is not DRAFT', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    await expect(updateGoal('goal-1', { title: 'X' }, 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })

  it('throws GoalForbiddenError when goal is locked', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue({
      ...DRAFT_GOAL,
      lockedAt: new Date(),
    } as never)
    await expect(updateGoal('goal-1', { title: 'X' }, 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
  })
})

// ---------------------------------------------------------------------------
// deleteGoal
// ---------------------------------------------------------------------------

describe('deleteGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a DRAFT goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(DRAFT_GOAL as never)
    ;(db.goal.delete as MockedFunction<typeof db.goal.delete>).mockResolvedValue({} as never)
    ;(db.auditLog.create as MockedFunction<typeof db.auditLog.create>).mockResolvedValue({} as never)

    await expect(deleteGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')).resolves.toBeUndefined()
    expect(db.goal.delete).toHaveBeenCalledWith({ where: { id: 'goal-1' } })
  })

  it('throws GoalConflictError when trying to delete an ACTIVE goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    await expect(deleteGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
    expect(db.goal.delete).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// activateGoal
// ---------------------------------------------------------------------------

describe('activateGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('transitions DRAFT to ACTIVE', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(DRAFT_GOAL as never)
    ;(db.goal.update as MockedFunction<typeof db.goal.update>).mockResolvedValue({
      ...DRAFT_GOAL,
      status: 'ACTIVE',
    } as never)
    ;(db.auditLog.create as MockedFunction<typeof db.auditLog.create>).mockResolvedValue({} as never)

    const result = await activateGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')
    expect(result.status).toBe('ACTIVE')
    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    )
  })

  it('throws GoalConflictError when already ACTIVE', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    await expect(activateGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })
})

// ---------------------------------------------------------------------------
// lockGoal
// ---------------------------------------------------------------------------

describe('lockGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('locks an ACTIVE goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    ;(db.goal.update as MockedFunction<typeof db.goal.update>).mockResolvedValue(LOCKED_GOAL as never)

    const result = await lockGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')
    expect(result.isLocked).toBe(true)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GOAL_LOCKED' }),
    )
  })

  it('throws GoalConflictError when already locked', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(LOCKED_GOAL as never)
    await expect(lockGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })

  it('throws GoalConflictError when locking a DRAFT goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(DRAFT_GOAL as never)
    await expect(lockGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })
})

// ---------------------------------------------------------------------------
// recordProgress
// ---------------------------------------------------------------------------

describe('recordProgress', () => {
  beforeEach(() => vi.clearAllMocks())

  it('records progress and updates currentAmount', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    const newProgress = { id: 'prog-1', amount: 5000, recordedAt: new Date() }
    mockGoalTransaction(newProgress)
    ;(db.auditLog.create as MockedFunction<typeof db.auditLog.create>).mockResolvedValue({} as never)

    const result = await recordProgress('goal-1', { amount: 5000 }, 'admin-1', ADMIN, '127.0.0.1')

    expect(db.$transaction).toHaveBeenCalledOnce()
    expect(result.amount).toBe(5000)
    expect(result.newTotal).toBe(15000) // 10000 existing + 5000 new
    expect(result.achieved).toBe(false) // 15000 < 50000 target
  })

  it('marks achieved when new total meets target', async () => {
    const nearlyDone = { ...ACTIVE_GOAL, currentAmount: 49500 }
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(nearlyDone as never)
    const newProgress = { id: 'prog-2', amount: 500, recordedAt: new Date() }
    mockGoalTransaction(newProgress)
    ;(db.auditLog.create as MockedFunction<typeof db.auditLog.create>).mockResolvedValue({} as never)

    const result = await recordProgress('goal-1', { amount: 500 }, 'admin-1', ADMIN, '127.0.0.1')
    expect(result.achieved).toBe(true)
    expect(result.newTotal).toBe(50000)
  })

  it('throws GoalConflictError on non-ACTIVE goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(DRAFT_GOAL as never)
    await expect(recordProgress('goal-1', { amount: 100 }, 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })

  it('throws GoalNotFoundError when goal does not exist', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(null)
    await expect(recordProgress('bad-id', { amount: 100 }, 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalNotFoundError)
  })
})

// ---------------------------------------------------------------------------
// Service-layer authorization (defence-in-depth behind the route guard)
// ---------------------------------------------------------------------------

describe('goal writes reject non-admin callers at the service layer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createGoal throws ForbiddenError and never writes for a non-admin', async () => {
    await expect(
      createGoal({ title: 'X', type: 'CUSTOM', targetAmount: 100, deadline: '2026-12-31' }, 'member-1', MEMBER, '127.0.0.1'),
    ).rejects.toThrow(GoalForbiddenError)
    expect(db.goal.create).not.toHaveBeenCalled()
  })

  it('updateGoal throws ForbiddenError and never reads or writes for a non-admin', async () => {
    await expect(updateGoal('goal-1', { title: 'X' }, 'member-1', MEMBER, '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
    expect(db.goal.findUnique).not.toHaveBeenCalled()
    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('deleteGoal throws ForbiddenError and never deletes for a non-admin', async () => {
    await expect(deleteGoal('goal-1', 'member-1', MEMBER, '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
    expect(db.goal.delete).not.toHaveBeenCalled()
  })

  it('activateGoal throws ForbiddenError for a non-admin', async () => {
    await expect(activateGoal('goal-1', 'member-1', MEMBER, '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('lockGoal throws ForbiddenError for a non-admin', async () => {
    await expect(lockGoal('goal-1', 'member-1', MEMBER, '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('recordProgress throws ForbiddenError and never opens a transaction for a non-admin', async () => {
    await expect(recordProgress('goal-1', { amount: 100 }, 'member-1', MEMBER, '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('empty roles are treated as non-admin', async () => {
    await expect(activateGoal('goal-1', 'nobody', [], '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
  })
})

// ---------------------------------------------------------------------------
// markExpiredGoalsFailed
// ---------------------------------------------------------------------------

describe('markExpiredGoalsFailed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('bulk-updates ACTIVE goals past deadline to FAILED', async () => {
    ;(db.goal.updateMany as MockedFunction<typeof db.goal.updateMany>).mockResolvedValue({ count: 3 } as never)

    const count = await markExpiredGoalsFailed()

    expect(count).toBe(3)
    expect(db.goal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
        data: { status: 'FAILED' },
      }),
    )
  })

  it('returns 0 when no goals are expired', async () => {
    ;(db.goal.updateMany as MockedFunction<typeof db.goal.updateMany>).mockResolvedValue({ count: 0 } as never)
    const count = await markExpiredGoalsFailed()
    expect(count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// progressPct computation
// ---------------------------------------------------------------------------

describe('progressPct', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 0 for a goal with no progress', async () => {
    const zeroGoal = { ...DRAFT_GOAL, currentAmount: 0, targetAmount: 10000 }
    ;(db.goal.create as MockedFunction<typeof db.goal.create>).mockResolvedValue(zeroGoal as never)
    ;(db.auditLog.create as MockedFunction<typeof db.auditLog.create>).mockResolvedValue({} as never)

    const result = await createGoal(
      { title: 'Test', type: 'CUSTOM', targetAmount: 10000, deadline: '2026-12-31' },
      'admin-1',
      ADMIN,
      '127.0.0.1',
    )
    expect(result.progressPct).toBe(0)
  })

  it('caps progressPct at 100 even if currentAmount exceeds target', async () => {
    const over = { ...DRAFT_GOAL, currentAmount: 60000, targetAmount: 50000 }
    ;(db.goal.create as MockedFunction<typeof db.goal.create>).mockResolvedValue(over as never)
    ;(db.auditLog.create as MockedFunction<typeof db.auditLog.create>).mockResolvedValue({} as never)

    const result = await createGoal(
      { title: 'Over', type: 'CUSTOM', targetAmount: 50000, deadline: '2026-12-31' },
      'admin-1',
      ADMIN,
      '127.0.0.1',
    )
    expect(result.progressPct).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// setPrimaryGoal
// ---------------------------------------------------------------------------

describe('setPrimaryGoal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('promotes an active goal to primary, demoting any current primary first', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue({ ...ACTIVE_GOAL, isPrimary: false } as never)
    ;(db.goal.updateMany as MockedFunction<typeof db.goal.updateMany>).mockResolvedValue({ count: 1 } as never)
    ;(db.$transaction as MockedFunction<typeof db.$transaction>).mockImplementation((async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)) as never)

    const result = await setPrimaryGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')

    expect(result.isPrimary).toBe(true)
    expect(db.goal.updateMany).toHaveBeenCalledWith({ where: { isPrimary: true }, data: { isPrimary: false } })
    expect(db.goal.updateMany).toHaveBeenCalledWith({ where: { id: 'goal-1' }, data: { isPrimary: true } })
  })

  it('is a no-op if the goal is already primary', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue({ ...ACTIVE_GOAL, isPrimary: true } as never)

    const result = await setPrimaryGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')

    expect(result.isPrimary).toBe(true)
    expect(db.goal.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a non-active goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue({ ...DRAFT_GOAL, isPrimary: false } as never)
    await expect(setPrimaryGoal('goal-1', 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
    expect(db.goal.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a non-admin before reading anything', async () => {
    await expect(setPrimaryGoal('goal-1', 'member-1', MEMBER, '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
    expect(db.goal.findUnique).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// syncPrimaryGoalProgress
// ---------------------------------------------------------------------------

describe('syncPrimaryGoalProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No directed extra payments by default — the derived total is just contributions.
    ;(db.goalPayment.aggregate as MockedFunction<typeof db.goalPayment.aggregate>).mockResolvedValue({ _sum: { amount: 0 } } as never)
  })

  const PRIMARY = { ...ACTIVE_GOAL, isPrimary: true, currentAmount: 5000, targetAmount: 120000, deadline: new Date('2026-12-31') }

  it('does nothing when no primary goal is designated', async () => {
    ;(db.goal.findMany as MockedFunction<typeof db.goal.findMany>).mockResolvedValue([] as never)

    await syncPrimaryGoalProgress()

    expect(db.contribution.aggregate).not.toHaveBeenCalled()
    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('re-derives the primary fund from contributions in its year', async () => {
    ;(db.goal.findMany as MockedFunction<typeof db.goal.findMany>).mockResolvedValue([PRIMARY] as never)
    ;(db.contribution.aggregate as MockedFunction<typeof db.contribution.aggregate>).mockResolvedValue({ _sum: { amountPaid: 48200 } } as never)
    ;(db.goal.update as MockedFunction<typeof db.goal.update>).mockResolvedValue({} as never)

    await syncPrimaryGoalProgress()

    expect(db.contribution.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodYear: 2026 }, _sum: { amountPaid: true } }),
    )
    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'goal-1' }, data: expect.objectContaining({ currentAmount: 48200 }) }),
    )
  })

  it('marks the fund ACHIEVED once contributions reach the target', async () => {
    ;(db.goal.findMany as MockedFunction<typeof db.goal.findMany>).mockResolvedValue([{ ...PRIMARY, targetAmount: 40000 }] as never)
    ;(db.contribution.aggregate as MockedFunction<typeof db.contribution.aggregate>).mockResolvedValue({ _sum: { amountPaid: 48200 } } as never)
    ;(db.goal.update as MockedFunction<typeof db.goal.update>).mockResolvedValue({} as never)

    await syncPrimaryGoalProgress()

    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentAmount: 48200, status: 'ACHIEVED' }) }),
    )
  })

  it('does not write when the figure has not moved', async () => {
    ;(db.goal.findMany as MockedFunction<typeof db.goal.findMany>).mockResolvedValue([{ ...PRIMARY, currentAmount: 48200 }] as never)
    ;(db.contribution.aggregate as MockedFunction<typeof db.contribution.aggregate>).mockResolvedValue({ _sum: { amountPaid: 48200 } } as never)

    await syncPrimaryGoalProgress()

    expect(db.goal.update).not.toHaveBeenCalled()
  })
})

describe('recordProgress on the primary fund', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is refused — the primary fills automatically', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue({ ...ACTIVE_GOAL, isPrimary: true } as never)

    await expect(recordProgress('goal-1', { amount: 500 }, 'admin-1', ADMIN, '127.0.0.1')).rejects.toThrow(GoalConflictError)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// celebrateGoalAchieved
// ---------------------------------------------------------------------------

describe('celebrateGoalAchieved', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes a celebration into every active member’s inbox', async () => {
    ;(db.user.findMany as MockedFunction<typeof db.user.findMany>).mockResolvedValue([{ id: 'u1' }, { id: 'u2' }] as never)
    ;(createInboxMessages as MockedFunction<typeof createInboxMessages>).mockResolvedValue(2 as never)

    const notified = await celebrateGoalAchieved('2026 Brotherhood Fund')

    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'ACTIVE' } }))
    expect(createInboxMessages).toHaveBeenCalledWith(
      ['u1', 'u2'],
      expect.objectContaining({ category: 'GOAL' }),
    )
    expect(createInboxMessages.mock.calls[0]![1].body).toContain('2026 Brotherhood Fund')
    expect(notified).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// syncAdditionalGoalProgress — the same derived, reversal-safe figure as the
// primary fund, for every other goal.
// ---------------------------------------------------------------------------

describe('syncAdditionalGoalProgress', () => {
  const agg = (amount: number | null) => ({ _sum: { amount } })
  const ADDITIONAL = { ...ACTIVE_GOAL, isPrimary: false, currentAmount: 600, targetAmount: 5000 }

  const mockProgressSum = (n: number | null) =>
    (db.goalProgress.aggregate as MockedFunction<typeof db.goalProgress.aggregate>).mockResolvedValue(agg(n) as never)
  const mockPaymentSum = (n: number | null) =>
    (db.goalPayment.aggregate as MockedFunction<typeof db.goalPayment.aggregate>).mockResolvedValue(agg(n) as never)
  const mockGoal = (goal: unknown) =>
    (db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(goal as never)

  beforeEach(() => {
    vi.clearAllMocks()
    ;(db.goal.update as MockedFunction<typeof db.goal.update>).mockResolvedValue({} as never)
  })

  it('derives the total from admin progress plus settled payments', async () => {
    mockGoal(ADDITIONAL)
    mockProgressSum(400)
    mockPaymentSum(1100)

    await syncAdditionalGoalProgress('goal-1')

    expect(db.goalPayment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { goalId: 'goal-1', status: 'SUCCESS' } }),
    )
    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'goal-1' }, data: expect.objectContaining({ currentAmount: 1500 }) }),
    )
  })

  it('comes back DOWN when a settled payment is reversed out of the sum', async () => {
    // The whole point: the reversed payment has left the SUCCESS sum, so the
    // goal total simply reflects the smaller figure. An increment could not.
    mockGoal({ ...ADDITIONAL, currentAmount: 1500 })
    mockProgressSum(400)
    mockPaymentSum(600)

    await syncAdditionalGoalProgress('goal-1')

    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentAmount: 1000 }) }),
    )
  })

  it('marks the goal ACHIEVED once the derived total reaches target', async () => {
    mockGoal({ ...ADDITIONAL, targetAmount: 1000 })
    mockProgressSum(400)
    mockPaymentSum(1100)

    await syncAdditionalGoalProgress('goal-1')

    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentAmount: 1500, status: 'ACHIEVED' }) }),
    )
  })

  it('leaves an ACHIEVED goal achieved when a reversal drops it below target', async () => {
    // A milestone the group already celebrated is not taken back.
    mockGoal({ ...ADDITIONAL, status: 'ACHIEVED', targetAmount: 1000, currentAmount: 1500 })
    mockProgressSum(0)
    mockPaymentSum(600)

    await syncAdditionalGoalProgress('goal-1')

    const call = (db.goal.update as MockedFunction<typeof db.goal.update>).mock.calls[0]![0] as { data: Record<string, unknown> }
    expect(call.data.currentAmount).toBe(600)
    expect(call.data).not.toHaveProperty('status')
  })

  it('does not write when the figure has not moved', async () => {
    mockGoal({ ...ADDITIONAL, currentAmount: 1500 })
    mockProgressSum(400)
    mockPaymentSum(1100)

    await syncAdditionalGoalProgress('goal-1')

    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('treats empty sums as zero rather than NaN', async () => {
    mockGoal({ ...ADDITIONAL, currentAmount: 600 })
    mockProgressSum(null)
    mockPaymentSum(null)

    await syncAdditionalGoalProgress('goal-1')

    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currentAmount: 0 }) }),
    )
  })

  it('refuses to touch the primary fund — that figure has its own sync', async () => {
    mockGoal({ ...ADDITIONAL, isPrimary: true })

    await syncAdditionalGoalProgress('goal-1')

    expect(db.goalProgress.aggregate).not.toHaveBeenCalled()
    expect(db.goal.update).not.toHaveBeenCalled()
  })

  it('is a no-op for a goal that no longer exists', async () => {
    mockGoal(null)

    await syncAdditionalGoalProgress('gone')

    expect(db.goal.update).not.toHaveBeenCalled()
  })
})
