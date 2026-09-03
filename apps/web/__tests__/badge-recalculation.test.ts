import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Which contribution changes make a badge recalculate.
 *
 * The job had no test at all, and the gap it left was found by a member rather
 * than by this suite: their badge rose when a R100 payment landed, and did not
 * move when that payment was reversed. The payment had come from a stand-in
 * gateway that never contacted a bank, so the badge was crediting them for
 * money the Foundation had never received and no longer claimed to have.
 *
 * The cause was a filter. The handler listened for
 * `contribution.status.changed` and returned early unless the new status was
 * PAID or OVERDUE — reasoning about the two ways a badge moves when somebody
 * pays or falls behind, and forgetting that money can be taken back out. A
 * reversal moves a contribution from PAID to PENDING, which was neither.
 */

const mocks = vi.hoisted(() => ({
  recalculateOne: vi.fn(),
  recalculateAll: vi.fn(),
}))

/**
 * Capture the handler as the module registers it.
 *
 * `createFunction` is where the job is declared, so stubbing it to keep the
 * third argument is what makes the handler reachable from a test at all —
 * otherwise the only thing importable from this module is an opaque object and
 * the decision below cannot be exercised.
 */
let handler: (arg: { event?: { name: string; data: Record<string, unknown> }; step: { run: (n: string, f: () => unknown) => unknown } }) => Promise<Record<string, unknown>>

vi.mock('@/lib/inngest', () => ({
  inngest: {
    createFunction: (_config: unknown, _triggers: unknown, fn: typeof handler) => {
      handler = fn
      return {}
    },
  },
  InngestEvents: {},
}))

vi.mock('@/services/badge.service', () => ({
  recalculateOne: mocks.recalculateOne,
  recalculateAll: mocks.recalculateAll,
}))

await import('@/inngest/functions/badge-recalculation')

/** Runs the step body inline, so what the handler asked for actually happens. */
const step = { run: (_name: string, fn: () => unknown) => fn() }

const fire = (status: string) =>
  handler({
    event: { name: 'xxm/contribution.status.changed', data: { userId: 'member-1', status } },
    step,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.recalculateOne.mockResolvedValue({ currentBadge: 'AMATEUR' })
  mocks.recalculateAll.mockResolvedValue(0)
})

describe('a contribution status change', () => {
  it('recalculates when money is taken back out', async () => {
    // The defect, stated directly. A reversal lands the contribution on
    // PENDING, and PENDING used to be filtered away — so the badge kept a score
    // earned from a payment that no longer existed.
    await fire('PENDING')

    expect(mocks.recalculateOne).toHaveBeenCalledWith('member-1', expect.any(String))
  })

  it('recalculates on every status a contribution can reach', async () => {
    // Not an enumeration for its own sake. Every input to the score is derived
    // from contribution status and amountPaid — paid months, on-time months,
    // the overdue count, the streak walk, the average contribution — so there
    // is no transition that leaves all of them unchanged, and none worth
    // filtering out.
    for (const status of ['PAID', 'PARTIAL', 'PENDING', 'OVERDUE', 'WAIVED']) {
      mocks.recalculateOne.mockClear()
      await fire(status)
      expect(mocks.recalculateOne, `status ${status} must recalculate`).toHaveBeenCalledTimes(1)
    }
  })

  it('never reports work it skipped', async () => {
    // The old handler returned `{ skipped: true }` and the run looked healthy.
    // A job that succeeds while doing nothing is worse than one that fails.
    const result = await fire('PENDING')

    expect(result).not.toHaveProperty('skipped')
    expect(result).toMatchObject({ recalculated: 1 })
  })

  it('names the trigger after the status, so badge history says why', async () => {
    // The trigger is written into the badge history row on a promotion. A
    // reversal that promoted or held a tier should be traceable to a reversal.
    await fire('PAID')
    expect(mocks.recalculateOne).toHaveBeenCalledWith('member-1', 'contribution_paid')

    mocks.recalculateOne.mockClear()
    await fire('OVERDUE')
    expect(mocks.recalculateOne).toHaveBeenCalledWith('member-1', 'contribution_overdue')

    mocks.recalculateOne.mockClear()
    await fire('PENDING')
    expect(mocks.recalculateOne).toHaveBeenCalledWith('member-1', 'contribution_pending')
  })

  it('recalculates one member, not everybody', async () => {
    // The monthly sweep is a separate trigger. Doing the whole membership on
    // every payment would turn one member's reversal into a full recalculation.
    await fire('PENDING')

    expect(mocks.recalculateAll).not.toHaveBeenCalled()
  })
})

describe('the monthly sweep', () => {
  it('recalculates everybody when no event named a member', async () => {
    mocks.recalculateAll.mockResolvedValue(7)

    const result = await handler({ step })

    expect(mocks.recalculateAll).toHaveBeenCalledWith('monthly_recalc')
    expect(result).toMatchObject({ recalculated: 7 })
    expect(mocks.recalculateOne).not.toHaveBeenCalled()
  })
})
