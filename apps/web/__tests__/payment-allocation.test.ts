import { describe, it, expect } from 'vitest'
import { allocatePayment, outstandingOn } from '@/lib/payment-allocation'

// ---------------------------------------------------------------------------
// Where money goes when it is more than the month it was recorded against.
//
// The old behaviour left the whole amount on one month: it read PAID with more
// against it than was due, leadership got an alert, and the surplus did nothing.
// A member who paid two months at once was shown as unpaid for the second and
// chased for it.
//
// The property every test below is really checking is one sentence: **the
// allocations sum to what arrived.** A split that loses a cent invents a
// shortfall in somebody's record, and one that gains a cent credits the pool
// with money nobody sent. Both are worse than the behaviour being replaced.
// ---------------------------------------------------------------------------

const period = (id: string, due: number, paid = 0) => ({
  id,
  amountDue: due,
  amountPaid: paid,
})

/** The invariant, asserted everywhere rather than described once. */
const totalOf = (allocations: { amount: number }[]) =>
  allocations.reduce((sum, a) => sum + a.amount, 0)

describe('what a period still needs', () => {
  it('is the gap between due and paid', () => {
    expect(outstandingOn(period('c', 450, 100))).toBe(350)
  })

  it('is never negative, however overpaid the period already is', () => {
    // An already-overpaid month must not present itself as a place that can
    // absorb more — it would swallow the surplus and report a negative need,
    // which then subtracts from what is left to allocate.
    expect(outstandingOn(period('c', 450, 900))).toBe(0)
  })

  it('handles the amounts as decimals, not floats', () => {
    expect(outstandingOn(period('c', 450.15, 100.05))).toBe(350.1)
  })
})

describe('a payment that fits the month it was recorded against', () => {
  it('produces exactly one allocation and changes nothing', () => {
    const allocations = allocatePayment(450, period('sep', 450), [period('jul', 450)])

    expect(allocations).toEqual([{ contributionId: 'sep', amount: 450 }])
  })

  it('leaves older months alone when it only part-pays its own', () => {
    // The commonest case there is: somebody paying what they can. It must not
    // reach for another month to be "helpful" — there is nothing spare.
    const allocations = allocatePayment(200, period('sep', 450), [period('jul', 450)])

    expect(allocations).toEqual([{ contributionId: 'sep', amount: 200 }])
  })
})

describe('a payment larger than the month it was recorded against', () => {
  it('fills the named month first, then the oldest arrears', () => {
    // The member owed R450 for July and R450 for September, and paid R1000
    // saying it was for September.
    const allocations = allocatePayment(1000, period('sep', 450), [period('jul', 450)])

    expect(allocations).toEqual([
      // R450 settles September, R100 has nowhere else to go and stays here —
      // so this month is the one that reads over-paid, which is right: it is
      // the month the administrator said the money was for.
      { contributionId: 'sep', amount: 550 },
      { contributionId: 'jul', amount: 450 },
    ])
    expect(totalOf(allocations)).toBe(1000)
  })

  it('takes the named month first even when an older one is further behind', () => {
    // The administrator was told what this money was for. Arrears order decides
    // the SURPLUS, never the stated month — otherwise recording a payment for
    // September could leave September unpaid, which is not something anybody
    // would predict from having typed "September".
    const allocations = allocatePayment(500, period('sep', 450), [period('jun', 450)])

    expect(allocations[0]).toEqual({ contributionId: 'sep', amount: 450 })
    expect(allocations[1]).toEqual({ contributionId: 'jun', amount: 50 })
  })

  it('walks several months in the order it was given', () => {
    const allocations = allocatePayment(
      1000,
      period('sep', 450),
      [period('jun', 200), period('jul', 200), period('aug', 200)],
    )

    expect(allocations.map((a) => a.contributionId)).toEqual(['sep', 'jun', 'jul', 'aug'])
    expect(totalOf(allocations)).toBe(1000)
  })

  it('stops as soon as the money runs out', () => {
    const allocations = allocatePayment(
      600,
      period('sep', 450),
      [period('jun', 200), period('jul', 200)],
    )

    expect(allocations).toEqual([
      { contributionId: 'sep', amount: 450 },
      { contributionId: 'jun', amount: 150 },
    ])
    expect(allocations.some((a) => a.contributionId === 'jul')).toBe(false)
  })

  it('part-fills the last month it reaches rather than skipping it', () => {
    const allocations = allocatePayment(500, period('sep', 450), [period('jul', 450)])

    expect(allocations[1]).toEqual({ contributionId: 'jul', amount: 50 })
  })

  it('skips a month that needs nothing without consuming any of the payment', () => {
    const allocations = allocatePayment(
      900,
      period('sep', 450),
      [period('jul', 450, 450), period('aug', 450)],
    )

    expect(allocations).toEqual([
      { contributionId: 'sep', amount: 450 },
      { contributionId: 'aug', amount: 450 },
    ])
  })
})

describe('money with nowhere to go', () => {
  it('stays on the month it was recorded against', () => {
    // The overpayment case, unchanged and deliberately so. Leadership is still
    // alerted by `recalculateContributionStatus`, and the record still says
    // money arrived that nothing was owed for — because that is what happened.
    const allocations = allocatePayment(1000, period('sep', 450), [])

    expect(allocations).toEqual([{ contributionId: 'sep', amount: 1000 }])
  })

  it('stays there even when every other month is already settled', () => {
    const allocations = allocatePayment(1000, period('sep', 450), [period('jul', 450, 450)])

    expect(allocations).toEqual([{ contributionId: 'sep', amount: 1000 }])
  })

  it('goes entirely to arrears when the named month owes nothing', () => {
    // A period already settled by an earlier payment. Nothing about it is owed,
    // so a further payment against it is free to settle what is.
    const allocations = allocatePayment(450, period('sep', 450, 450), [period('jul', 450)])

    expect(allocations).toEqual([{ contributionId: 'jul', amount: 450 }])
  })
})

describe('the invariant, stated as its own test', () => {
  const cases: [string, number, ReturnType<typeof period>, ReturnType<typeof period>[]][] = [
    ['exact', 450, period('sep', 450), [period('jul', 450)]],
    ['under', 12.34, period('sep', 450), [period('jul', 450)]],
    ['over, absorbed', 900, period('sep', 450), [period('jul', 450)]],
    ['over, unabsorbed', 1000, period('sep', 450), []],
    ['awkward decimals', 733.33, period('sep', 450.15), [period('jul', 200.10)]],
    ['many months', 5000, period('sep', 450), [
      period('apr', 450), period('may', 450), period('jun', 450), period('jul', 450),
    ]],
  ]

  it.each(cases)('allocates exactly what arrived: %s', (_label, received, named, others) => {
    const allocations = allocatePayment(received, named, others)

    expect(totalOf(allocations)).toBeCloseTo(received, 2)
  })

  it.each(cases)('never allocates a zero or negative row: %s', (_l, received, named, others) => {
    for (const allocation of allocatePayment(received, named, others)) {
      expect(allocation.amount).toBeGreaterThan(0)
    }
  })

  it.each(cases)('never places money twice on one period: %s', (_l, received, named, others) => {
    const ids = allocatePayment(received, named, others).map((a) => a.contributionId)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
