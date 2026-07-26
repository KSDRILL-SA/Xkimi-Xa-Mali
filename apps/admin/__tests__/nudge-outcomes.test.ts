import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { $queryRaw: vi.fn() }, Prisma: {} }))
vi.mock('@/lib/signature-storage', () => ({ storeSignaturePng: vi.fn() }))

import { db } from '@/lib/db'
import { getNudgeOutcomes, AdminForbiddenError } from '@/lib/services'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>
const ADMIN = ['ADMIN']

/** The two grouped queries resolve in the order they are listed in the service. */
const given = (early: [number, number], debit: [number, number]) =>
  mock(db.$queryRaw)
    .mockResolvedValueOnce([{ sent: BigInt(early[0]), reached: BigInt(early[1]) }] as never)
    .mockResolvedValueOnce([{ sent: BigInt(debit[0]), reached: BigInt(debit[1]) }] as never)

beforeEach(() => vi.clearAllMocks())

describe('getNudgeOutcomes', () => {
  it('refuses a non-admin before touching the database', async () => {
    await expect(getNudgeOutcomes(['MEMBER'], 6, 2026)).rejects.toBeInstanceOf(AdminForbiddenError)
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('reports a rate per nudge', async () => {
    given([10, 7], [12, 9])

    const outcomes = await getNudgeOutcomes(ADMIN, 6, 2026)

    expect(outcomes).toEqual([
      expect.objectContaining({ slug: 'contribution-due-reminder', sent: 10, reached: 7, rate: 70 }),
      expect.objectContaining({ slug: 'debit-morning-warning', sent: 12, reached: 9, rate: 75 }),
    ])
  })

  it('says nothing rather than zero when no reminder was sent', async () => {
    // A rate of 0% reads as "the message failed"; a period with no messages is
    // a different statement and should not be mistaken for a bad one.
    given([0, 0], [0, 0])

    const outcomes = await getNudgeOutcomes(ADMIN, 6, 2026)

    expect(outcomes.every((o) => o.rate === null)).toBe(true)
  })

  it('reports 0% when messages went out and none landed', async () => {
    given([8, 0], [8, 0])
    expect((await getNudgeOutcomes(ADMIN, 6, 2026))[0]!.rate).toBe(0)
  })

  it('rounds to whole percent', async () => {
    given([3, 1], [3, 2])
    const outcomes = await getNudgeOutcomes(ADMIN, 6, 2026)
    expect(outcomes[0]!.rate).toBe(33)
    expect(outcomes[1]!.rate).toBe(67)
  })

  it('carries counts across as numbers, not the driver’s bigints', async () => {
    given([5, 5], [5, 5])
    const [first] = await getNudgeOutcomes(ADMIN, 6, 2026)
    expect(typeof first!.sent).toBe('number')
    expect(typeof first!.reached).toBe('number')
  })

  it('states what each message was asking for, so a rate can be read', async () => {
    given([1, 1], [1, 1])
    const outcomes = await getNudgeOutcomes(ADMIN, 6, 2026)
    expect(outcomes[0]!.intent).toBe('Paid on or before the due date')
    expect(outcomes[1]!.intent).toBe('Contribution settled this month')
  })

  it('asks the database twice, whatever the period', async () => {
    given([1, 1], [1, 1])
    await getNudgeOutcomes(ADMIN, 6, 2026)
    expect(db.$queryRaw).toHaveBeenCalledTimes(2)
  })

  it('survives a period the database answers with no rows at all', async () => {
    mock(db.$queryRaw).mockResolvedValue([] as never)
    const outcomes = await getNudgeOutcomes(ADMIN, 6, 2026)
    expect(outcomes.every((o) => o.sent === 0 && o.rate === null)).toBe(true)
  })
})
