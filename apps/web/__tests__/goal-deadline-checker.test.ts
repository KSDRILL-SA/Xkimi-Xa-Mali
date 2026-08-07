import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// goal-deadline-checker
//
// The job marked expired goals Failed and returned a count. It sent nothing.
// A Goal the circle had pledged toward went Failed overnight in silence, while
// `goal-achieved.ts` announced the happy ending — the wrong way round, and
// against the guide twice over ("You are told when … a Goal you care about has
// news").
//
// The step stub MEMOISES. A runner that executes every step on every pass will
// pass these tests with a counter-inside-step bug still in place, which is
// exactly how the ledger-reconciliation defect survived its first test.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  markExpiredGoalsFailed: vi.fn(),
  queueNotification: vi.fn(),
  createInboxMessages: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { NEXTAUTH_URL: 'https://app.test' } }))
vi.mock('@/lib/inngest', () => ({
  inngest: { createFunction: vi.fn(() => ({})) },
  InngestEvents: {},
}))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/goal.service', () => ({ markExpiredGoalsFailed: mocks.markExpiredGoalsFailed }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@/services/inbox.service', () => ({ createInboxMessages: mocks.createInboxMessages }))

import { executeGoalDeadlineCheck } from '@/inngest/functions/goal-deadline-checker'

/**
 * A step runner that behaves like Inngest on re-entry: a step that has already
 * completed is not executed again, its recorded value is returned.
 */
function memoisingStep() {
  const completed = new Map<string, unknown>()
  const executions: string[] = []
  return {
    executions,
    completed,
    runner: {
      async run<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
        if (completed.has(id)) return completed.get(id) as T
        executions.push(id)
        const value = await fn()
        completed.set(id, value)
        return value
      },
    },
  }
}

const GOAL = {
  id: 'g1',
  title: 'Equipment for a family catering business',
  pledgerIds: ['u1', 'u2'],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.markExpiredGoalsFailed.mockResolvedValue([GOAL])
  mocks.queueNotification.mockResolvedValue(undefined)
  mocks.createInboxMessages.mockResolvedValue(2)
})

describe('goal-deadline-checker — the circle is told', () => {
  it('tells every member who pledged, in-app and by SMS', async () => {
    const { runner } = memoisingStep()

    const result = await executeGoalDeadlineCheck(runner)

    expect(mocks.createInboxMessages).toHaveBeenCalledWith(
      ['u1', 'u2'],
      expect.objectContaining({ category: 'GOAL' }),
    )
    expect(mocks.queueNotification.mock.calls.map((c) => c[0].userId)).toEqual(['u1', 'u2'])
    expect(mocks.queueNotification.mock.calls.every((c) => c[0].templateSlug === 'goal-failed')).toBe(true)
    expect(result).toEqual({ expiredGoalsMarkedFailed: 1, membersNotified: 2 })
  })

  it('says plainly that no money left the pool', async () => {
    const { runner } = memoisingStep()

    await executeGoalDeadlineCheck(runner)

    // The guide's promise is "no funds are released". A member watching a goal
    // they backed fail should not have to wonder where their money went.
    const body = mocks.createInboxMessages.mock.calls[0][1].body as string
    expect(body).toMatch(/no funds have been released/i)
    expect(body).toContain(GOAL.title)
  })

  it('counts outside the step, so a re-entry does not report having done nothing', async () => {
    const first = memoisingStep()
    await executeGoalDeadlineCheck(first.runner)

    // Inngest re-enters the function; every step is already recorded, so none
    // of them execute again. A counter incremented inside a step would come
    // back as zero here while the work had in fact been done.
    const replay = await executeGoalDeadlineCheck({
      async run<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
        if (first.completed.has(id)) return first.completed.get(id) as T
        return fn()
      },
    })

    expect(replay).toEqual({ expiredGoalsMarkedFailed: 1, membersNotified: 2 })
    // Nothing was sent a second time.
    expect(mocks.createInboxMessages).toHaveBeenCalledTimes(1)
    expect(mocks.queueNotification).toHaveBeenCalledTimes(2)
  })

  it('gives each goal its own step, so one failure cannot lose the others', async () => {
    mocks.markExpiredGoalsFailed.mockResolvedValue([
      GOAL,
      { id: 'g2', title: 'Second goal', pledgerIds: ['u3'] },
    ])
    const { runner, executions } = memoisingStep()

    const result = await executeGoalDeadlineCheck(runner)

    expect(executions).toEqual([
      'mark-expired-goals-failed',
      'notify-failed-g1',
      'notify-failed-g2',
    ])
    expect(result.membersNotified).toBe(3)
  })

  it('sends nothing when a lapsed goal had no pledges', async () => {
    mocks.markExpiredGoalsFailed.mockResolvedValue([{ id: 'g9', title: 'Unbacked', pledgerIds: [] }])
    const { runner } = memoisingStep()

    const result = await executeGoalDeadlineCheck(runner)

    expect(mocks.createInboxMessages).not.toHaveBeenCalled()
    expect(mocks.queueNotification).not.toHaveBeenCalled()
    expect(result).toEqual({ expiredGoalsMarkedFailed: 1, membersNotified: 0 })
  })

  it('does nothing at all when no goal has lapsed', async () => {
    mocks.markExpiredGoalsFailed.mockResolvedValue([])
    const { runner, executions } = memoisingStep()

    const result = await executeGoalDeadlineCheck(runner)

    expect(executions).toEqual(['mark-expired-goals-failed'])
    expect(result).toEqual({ expiredGoalsMarkedFailed: 0, membersNotified: 0 })
  })
})
