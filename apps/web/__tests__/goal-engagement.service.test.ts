import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    goalPledge:  { upsert: vi.fn(), deleteMany: vi.fn(), aggregate: vi.fn(), findUnique: vi.fn() },
    goalCheer:   { create: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    goalComment: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/repositories/goal.repository', () => ({ goalRepo: { findById: vi.fn() } }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

import { db } from '@/lib/db'
import { goalRepo } from '@/repositories/goal.repository'
import { writeAuditLog } from '@/services/audit.service'
import {
  setGoalPledge,
  cancelGoalPledge,
  toggleGoalCheer,
  addGoalComment,
  deleteGoalComment,
} from '@/services/goal-engagement.service'
import { GoalNotFoundError, ValidationError, ForbiddenError, NotFoundError } from '@/lib/errors'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

const AUTHOR = 'u1'
const OTHER = 'u2'
const MEMBER = ['MEMBER']
const ADMIN = ['ADMIN']

const activeGoal = { id: 'g1', status: 'ACTIVE', title: 'Braai Fund' }

const author = { id: AUTHOR, firstName: 'Ku', lastName: 'Ma', badgeScore: { currentBadge: 'PRO' } }

beforeEach(() => {
  vi.clearAllMocks()
  mock(goalRepo.findById).mockResolvedValue(activeGoal as never)
  mock(db.goalPledge.aggregate).mockResolvedValue({ _sum: { amount: 0 }, _count: 0 } as never)
  mock(db.goalPledge.findUnique).mockResolvedValue(null as never)
  mock(db.goalPledge.upsert).mockResolvedValue({} as never)
  mock(db.goalPledge.deleteMany).mockResolvedValue({ count: 1 } as never)
  mock(db.goalCheer.count).mockResolvedValue(0 as never)
})

// ---------------------------------------------------------------------------
// Pledges
// ---------------------------------------------------------------------------

describe('setGoalPledge', () => {
  it('records a pledge against an active goal', async () => {
    await setGoalPledge('g1', AUTHOR, 500, MEMBER)
    expect(db.goalPledge.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { goalId: 'g1', userId: AUTHOR, amount: 500 } }),
    )
  })

  it('updates rather than duplicating when the member pledges again', async () => {
    await setGoalPledge('g1', AUTHOR, 750, MEMBER)
    const [arg] = mock(db.goalPledge.upsert).mock.calls[0] as unknown as [{ where: unknown; update: unknown }]
    expect(arg.where).toEqual({ goalId_userId: { goalId: 'g1', userId: AUTHOR } })
    expect(arg.update).toEqual({ amount: 750 })
  })

  it('rounds to the cent rather than storing float dust', async () => {
    await setGoalPledge('g1', AUTHOR, 100.005, MEMBER)
    const [arg] = mock(db.goalPledge.upsert).mock.calls[0] as unknown as [{ update: { amount: number } }]
    expect(arg.update.amount).toBe(100.01)
  })

  it('refuses a goal that does not exist', async () => {
    mock(goalRepo.findById).mockResolvedValue(null as never)
    await expect(setGoalPledge('gone', AUTHOR, 500, MEMBER)).rejects.toBeInstanceOf(GoalNotFoundError)
  })

  it('hides a draft goal from a member, rather than admitting it exists', async () => {
    mock(goalRepo.findById).mockResolvedValue({ ...activeGoal, status: 'DRAFT' } as never)
    await expect(setGoalPledge('g1', AUTHOR, 500, MEMBER)).rejects.toBeInstanceOf(GoalNotFoundError)
  })

  it('refuses a goal that is no longer active', async () => {
    mock(goalRepo.findById).mockResolvedValue({ ...activeGoal, status: 'ACHIEVED' } as never)
    await expect(setGoalPledge('g1', AUTHOR, 500, MEMBER)).rejects.toBeInstanceOf(ValidationError)
    expect(db.goalPledge.upsert).not.toHaveBeenCalled()
  })

  it('refuses an amount that is not a finite number', async () => {
    await expect(setGoalPledge('g1', AUTHOR, Number.NaN, MEMBER)).rejects.toBeInstanceOf(ValidationError)
    await expect(setGoalPledge('g1', AUTHOR, Infinity, MEMBER)).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses an amount below the minimum or above the ceiling', async () => {
    await expect(setGoalPledge('g1', AUTHOR, 0, MEMBER)).rejects.toBeInstanceOf(ValidationError)
    await expect(setGoalPledge('g1', AUTHOR, -100, MEMBER)).rejects.toBeInstanceOf(ValidationError)
    await expect(setGoalPledge('g1', AUTHOR, 10_000_000, MEMBER)).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('cancelGoalPledge', () => {
  it('withdraws only the calling member’s pledge', async () => {
    await cancelGoalPledge('g1', AUTHOR)
    expect(db.goalPledge.deleteMany).toHaveBeenCalledWith({ where: { goalId: 'g1', userId: AUTHOR } })
  })
})

// ---------------------------------------------------------------------------
// Cheers — the interesting part is the double-click
// ---------------------------------------------------------------------------

describe('toggleGoalCheer', () => {
  it('adds a cheer when none was there', async () => {
    mock(db.goalCheer.deleteMany).mockResolvedValue({ count: 0 } as never)
    mock(db.goalCheer.create).mockResolvedValue({} as never)
    mock(db.goalCheer.count).mockResolvedValue(1 as never)

    expect(await toggleGoalCheer('g1', AUTHOR, MEMBER)).toEqual({ cheered: true, cheerCount: 1 })
  })

  it('removes the cheer when one was already there', async () => {
    mock(db.goalCheer.deleteMany).mockResolvedValue({ count: 1 } as never)
    mock(db.goalCheer.count).mockResolvedValue(0 as never)

    expect(await toggleGoalCheer('g1', AUTHOR, MEMBER)).toEqual({ cheered: false, cheerCount: 0 })
    expect(db.goalCheer.create).not.toHaveBeenCalled()
  })

  it('survives a concurrent request winning the race', async () => {
    // Two rapid clicks both find nothing to delete and both try to insert. The
    // unique constraint rejects the loser, which must read as cheered rather
    // than surfacing a 500 for pressing a button twice.
    mock(db.goalCheer.deleteMany).mockResolvedValue({ count: 0 } as never)
    mock(db.goalCheer.create).mockRejectedValue({ code: 'P2002' } as never)
    mock(db.goalCheer.count).mockResolvedValue(1 as never)

    expect(await toggleGoalCheer('g1', AUTHOR, MEMBER)).toEqual({ cheered: true, cheerCount: 1 })
  })

  it('still surfaces a real database failure', async () => {
    mock(db.goalCheer.deleteMany).mockResolvedValue({ count: 0 } as never)
    mock(db.goalCheer.create).mockRejectedValue({ code: 'P1001' } as never)

    await expect(toggleGoalCheer('g1', AUTHOR, MEMBER)).rejects.toMatchObject({ code: 'P1001' })
  })

  it('refuses a draft goal for a member', async () => {
    mock(goalRepo.findById).mockResolvedValue({ ...activeGoal, status: 'DRAFT' } as never)
    await expect(toggleGoalCheer('g1', AUTHOR, MEMBER)).rejects.toBeInstanceOf(GoalNotFoundError)
    expect(db.goalCheer.deleteMany).not.toHaveBeenCalled()
  })

  it('allows an admin to see and cheer a draft goal', async () => {
    mock(goalRepo.findById).mockResolvedValue({ ...activeGoal, status: 'DRAFT' } as never)
    mock(db.goalCheer.deleteMany).mockResolvedValue({ count: 0 } as never)
    mock(db.goalCheer.create).mockResolvedValue({} as never)
    mock(db.goalCheer.count).mockResolvedValue(1 as never)

    await expect(toggleGoalCheer('g1', 'admin-1', ADMIN)).resolves.toEqual({ cheered: true, cheerCount: 1 })
  })
})

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

describe('addGoalComment', () => {
  const created = {
    id: 'c1', content: 'lets go', isDeleted: false, createdAt: new Date(), user: author, userId: AUTHOR,
  }

  it('posts a trimmed comment', async () => {
    mock(db.goalComment.create).mockResolvedValue(created as never)
    await addGoalComment('g1', AUTHOR, '  lets go  ', MEMBER)
    expect(db.goalComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { goalId: 'g1', userId: AUTHOR, content: 'lets go' } }),
    )
  })

  it('refuses an empty comment', async () => {
    await expect(addGoalComment('g1', AUTHOR, '   ', MEMBER)).rejects.toBeInstanceOf(ValidationError)
    expect(db.goalComment.create).not.toHaveBeenCalled()
  })

  it('refuses one past the length limit', async () => {
    await expect(addGoalComment('g1', AUTHOR, 'a'.repeat(1001), MEMBER)).rejects.toBeInstanceOf(ValidationError)
  })

  it('checks the goal is visible before validating the text', async () => {
    mock(goalRepo.findById).mockResolvedValue(null as never)
    await expect(addGoalComment('gone', AUTHOR, 'lets go', MEMBER)).rejects.toBeInstanceOf(GoalNotFoundError)
  })
})

describe('deleteGoalComment', () => {
  const comment = (over: Record<string, unknown> = {}) => ({
    id: 'c1', goalId: 'g1', userId: AUTHOR, isDeleted: false, ...over,
  })

  beforeEach(() => {
    mock(db.goalComment.update).mockResolvedValue({} as never)
  })

  it('lets the author remove their own', async () => {
    mock(db.goalComment.findUnique).mockResolvedValue(comment() as never)
    await deleteGoalComment('g1', 'c1', AUTHOR, MEMBER)
    expect(db.goalComment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDeleted: true, deletedById: AUTHOR }) }),
    )
  })

  it('does not audit a member tidying up after themselves', async () => {
    mock(db.goalComment.findUnique).mockResolvedValue(comment() as never)
    await deleteGoalComment('g1', 'c1', AUTHOR, MEMBER)
    expect(writeAuditLog).not.toHaveBeenCalled()
  })

  it('audits an admin moderating somebody else', async () => {
    mock(db.goalComment.findUnique).mockResolvedValue(comment() as never)
    await deleteGoalComment('g1', 'c1', 'admin-1', ADMIN)
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GOAL_COMMENT_MODERATED' }),
    )
  })

  it('refuses another member', async () => {
    mock(db.goalComment.findUnique).mockResolvedValue(comment() as never)
    await expect(deleteGoalComment('g1', 'c1', OTHER, MEMBER)).rejects.toBeInstanceOf(ForbiddenError)
    expect(db.goalComment.update).not.toHaveBeenCalled()
  })

  it('refuses a comment belonging to a different goal', async () => {
    // Guards against deleting by id alone from the wrong goal's endpoint.
    mock(db.goalComment.findUnique).mockResolvedValue(comment({ goalId: 'other-goal' }) as never)
    await expect(deleteGoalComment('g1', 'c1', AUTHOR, MEMBER)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('refuses one already deleted', async () => {
    mock(db.goalComment.findUnique).mockResolvedValue(comment({ isDeleted: true }) as never)
    await expect(deleteGoalComment('g1', 'c1', AUTHOR, MEMBER)).rejects.toBeInstanceOf(NotFoundError)
  })
})
