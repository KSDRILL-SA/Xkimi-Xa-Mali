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
    },
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
} from '@/services/goal.service'

const GoalForbiddenError = ForbiddenError
const mockWriteAuditLog = writeAuditLog as ReturnType<typeof vi.fn>

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

    const result = await updateGoal('goal-1', { title: 'New title' }, 'admin-1', '127.0.0.1')
    expect(result.title).toBe('New title')
  })

  it('throws GoalNotFoundError when goal does not exist', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(null)
    await expect(updateGoal('bad-id', {}, 'admin-1', '127.0.0.1')).rejects.toThrow(GoalNotFoundError)
  })

  it('throws GoalConflictError when goal is not DRAFT', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    await expect(updateGoal('goal-1', { title: 'X' }, 'admin-1', '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })

  it('throws GoalForbiddenError when goal is locked', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue({
      ...DRAFT_GOAL,
      lockedAt: new Date(),
    } as never)
    await expect(updateGoal('goal-1', { title: 'X' }, 'admin-1', '127.0.0.1')).rejects.toThrow(GoalForbiddenError)
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

    await expect(deleteGoal('goal-1', 'admin-1', '127.0.0.1')).resolves.toBeUndefined()
    expect(db.goal.delete).toHaveBeenCalledWith({ where: { id: 'goal-1' } })
  })

  it('throws GoalConflictError when trying to delete an ACTIVE goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    await expect(deleteGoal('goal-1', 'admin-1', '127.0.0.1')).rejects.toThrow(GoalConflictError)
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

    const result = await activateGoal('goal-1', 'admin-1', '127.0.0.1')
    expect(result.status).toBe('ACTIVE')
    expect(db.goal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE' } }),
    )
  })

  it('throws GoalConflictError when already ACTIVE', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(ACTIVE_GOAL as never)
    await expect(activateGoal('goal-1', 'admin-1', '127.0.0.1')).rejects.toThrow(GoalConflictError)
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

    const result = await lockGoal('goal-1', 'admin-1', '127.0.0.1')
    expect(result.isLocked).toBe(true)
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GOAL_LOCKED' }),
    )
  })

  it('throws GoalConflictError when already locked', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(LOCKED_GOAL as never)
    await expect(lockGoal('goal-1', 'admin-1', '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })

  it('throws GoalConflictError when locking a DRAFT goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(DRAFT_GOAL as never)
    await expect(lockGoal('goal-1', 'admin-1', '127.0.0.1')).rejects.toThrow(GoalConflictError)
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

    const result = await recordProgress('goal-1', { amount: 5000 }, 'admin-1', '127.0.0.1')

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

    const result = await recordProgress('goal-1', { amount: 500 }, 'admin-1', '127.0.0.1')
    expect(result.achieved).toBe(true)
    expect(result.newTotal).toBe(50000)
  })

  it('throws GoalConflictError on non-ACTIVE goal', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(DRAFT_GOAL as never)
    await expect(recordProgress('goal-1', { amount: 100 }, 'admin-1', '127.0.0.1')).rejects.toThrow(GoalConflictError)
  })

  it('throws GoalNotFoundError when goal does not exist', async () => {
    ;(db.goal.findUnique as MockedFunction<typeof db.goal.findUnique>).mockResolvedValue(null)
    await expect(recordProgress('bad-id', { amount: 100 }, 'admin-1', '127.0.0.1')).rejects.toThrow(GoalNotFoundError)
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
      '127.0.0.1',
    )
    expect(result.progressPct).toBe(100)
  })
})
