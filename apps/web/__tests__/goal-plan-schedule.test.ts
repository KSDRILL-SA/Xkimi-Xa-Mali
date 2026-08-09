import { describe, it, expect } from 'vitest'
import {
  periodKey,
  collectionDayInMonth,
  isDueOn,
  instalmentFor,
} from '@/lib/goal-plan-schedule'

/**
 * A goal plan collects money on a schedule with nobody watching. The two ways
 * that goes wrong are a collection that silently never happens and a collection
 * that happens twice, so both are pinned down here before anything charges a
 * member.
 */

describe('which day of the month a plan collects', () => {
  it('uses the chosen day when the month has one', () => {
    expect(collectionDayInMonth(25, 2026, 8)).toBe(25)
  })

  it('falls back to the last day of a short month', () => {
    // The case that matters. A plan set to the 31st would otherwise never
    // collect in February, April, June, September or November — five months a
    // year, failing silently, with no error to notice.
    expect(collectionDayInMonth(31, 2026, 2)).toBe(28)
    expect(collectionDayInMonth(31, 2026, 4)).toBe(30)
    expect(collectionDayInMonth(31, 2026, 6)).toBe(30)
    expect(collectionDayInMonth(31, 2026, 9)).toBe(30)
    expect(collectionDayInMonth(31, 2026, 11)).toBe(30)
  })

  it('collects on 29 February in a leap year and on the 28th otherwise', () => {
    expect(collectionDayInMonth(29, 2028, 2)).toBe(29)
    expect(collectionDayInMonth(29, 2026, 2)).toBe(28)
  })
})

describe('whether a plan is due', () => {
  const plan = { debitDay: 25, lastCollectedPeriod: null }

  it('is due on its day', () => {
    expect(isDueOn(plan, new Date(2026, 7, 25))).toBe(true)
  })

  it('is not due on any other day', () => {
    expect(isDueOn(plan, new Date(2026, 7, 24))).toBe(false)
    expect(isDueOn(plan, new Date(2026, 7, 26))).toBe(false)
  })

  it('is not due again in a month it has already collected', () => {
    // The job runs daily and can be retried inside the same day, so "is it the
    // right day" stays true for 24 hours. Without the period guard a retry
    // charges the member a second time.
    const collected = { debitDay: 25, lastCollectedPeriod: '2026-08' }
    expect(isDueOn(collected, new Date(2026, 7, 25))).toBe(false)
  })

  it('is due again the following month', () => {
    const collected = { debitDay: 25, lastCollectedPeriod: '2026-08' }
    expect(isDueOn(collected, new Date(2026, 8, 25))).toBe(true)
  })

  it('collects on the last day of a short month for a late debit day', () => {
    const endOfMonth = { debitDay: 31, lastCollectedPeriod: null }
    expect(isDueOn(endOfMonth, new Date(2026, 1, 28))).toBe(true)
    expect(isDueOn(endOfMonth, new Date(2026, 1, 27))).toBe(false)
  })
})

describe('the period a collection belongs to', () => {
  it('pads single-digit months so the key sorts and compares as text', () => {
    expect(periodKey(new Date(2026, 0, 9))).toBe('2026-01')
    expect(periodKey(new Date(2026, 11, 31))).toBe('2026-12')
  })
})

describe('what a plan collects', () => {
  it('takes the full instalment while there is room', () => {
    expect(instalmentFor(750, 3000)).toBe(750)
  })

  it('trims the last instalment to what the goal still needs', () => {
    // Nobody is present to be asked, so the plan stops at the target rather
    // than overshooting it the way a member typing an amount may choose to.
    expect(instalmentFor(750, 200)).toBe(200)
  })

  it('collects nothing once the goal is met', () => {
    // null rather than 0: the caller completes the plan instead of submitting
    // a debit for nothing.
    expect(instalmentFor(750, 0)).toBeNull()
    expect(instalmentFor(750, -50)).toBeNull()
  })
})
