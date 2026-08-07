import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// monthly-statement-notice
//
// The job wrote straight into `inboxMessage` and stopped. The guide offers four
// ways to hear from the Foundation — "SMS, email, WhatsApp and in-app messages.
// You choose which channels you want" — and lists a ready statement among the
// things you are told. A member who had chosen SMS or email was never told; the
// message sat in an inbox they had no reason to open.
//
// The step stub memoises, as Inngest does on re-entry.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createInboxMessages: vi.fn(),
  queueNotification: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { NEXTAUTH_URL: 'https://app.test' } }))
vi.mock('@/lib/db', () => ({ db: { user: { findMany: mocks.findMany } } }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: vi.fn(() => ({})) }, InngestEvents: {} }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/services/inbox.service', () => ({ createInboxMessages: mocks.createInboxMessages }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))

import { executeMonthlyStatementNotice } from '@/inngest/functions/monthly-statement-notice'

function memoisingStep() {
  const completed = new Map<string, unknown>()
  const executions: string[] = []
  return {
    completed,
    executions,
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

const MEMBERS = [
  { id: 'u1', firstName: 'Thabo' },
  { id: 'u2', firstName: 'Naledi' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue(MEMBERS)
  mocks.createInboxMessages.mockResolvedValue(2)
  mocks.queueNotification.mockResolvedValue(undefined)
})

describe('monthly-statement-notice — every channel the member chose', () => {
  it('queues SMS and email as well as writing the inbox message', async () => {
    const { runner } = memoisingStep()

    const result = await executeMonthlyStatementNotice(runner)

    // The inbox write is the channel nobody opts out of, and it was the only
    // thing this job ever did.
    expect(mocks.createInboxMessages).toHaveBeenCalledWith(
      ['u1', 'u2'],
      expect.objectContaining({ category: 'SYSTEM' }),
    )

    // These two are the gap: a member who chose SMS or email heard nothing.
    const slugs = mocks.queueNotification.mock.calls.map((c) => c[0].templateSlug)
    expect(slugs).toEqual([
      'statement-ready-sms', 'statement-ready-email',
      'statement-ready-sms', 'statement-ready-email',
    ])
    expect(result).toMatchObject({ notified: 2, queued: 4 })
  })

  it('addresses the member by name and links to the page that has the statement', async () => {
    const { runner } = memoisingStep()

    await executeMonthlyStatementNotice(runner)

    // An unsupplied placeholder is not dropped — `interpolate` sends it to the
    // member as literal braces.
    expect(mocks.queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        payload: expect.objectContaining({
          firstName: 'Thabo',
          url: 'https://app.test/dashboard/statements',
          period: expect.any(String),
        }),
      }),
    )
  })

  it('counts outside the step, so a re-entry does not report zero', async () => {
    const first = memoisingStep()
    await executeMonthlyStatementNotice(first.runner)

    const replay = await executeMonthlyStatementNotice({
      async run<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
        if (first.completed.has(id)) return first.completed.get(id) as T
        return fn()
      },
    })

    expect(replay).toMatchObject({ notified: 2, queued: 4 })
    // And nobody was told twice.
    expect(mocks.queueNotification).toHaveBeenCalledTimes(4)
    expect(mocks.createInboxMessages).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there are no active members', async () => {
    mocks.findMany.mockResolvedValue([])
    const { runner, executions } = memoisingStep()

    const result = await executeMonthlyStatementNotice(runner)

    expect(executions).toEqual(['fetch-active-members'])
    expect(mocks.createInboxMessages).not.toHaveBeenCalled()
    expect(mocks.queueNotification).not.toHaveBeenCalled()
    expect(result).toMatchObject({ notified: 0, queued: 0 })
  })

  it('names the period it is telling members about', async () => {
    const { runner } = memoisingStep()

    const result = await executeMonthlyStatementNotice(runner)

    // The previous month, not this one — the job runs on the 3rd, after
    // month-end debits have settled.
    const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    expect(result.period).toBe(prev.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' }))
  })
})
