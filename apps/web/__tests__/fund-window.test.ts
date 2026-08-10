import { describe, it, expect } from 'vitest'
import { fundWindow, periodInWindow, periodsWithin } from '@/lib/fund-window'

/**
 * The primary fund's total was derived from every contribution whose period fell
 * in `deadline.getFullYear()`. Right for a fund that runs January to December,
 * wrong the moment one does not.
 */

const p = (year: number, month: number) => ({ year, month })

describe('a fund that runs the calendar year', () => {
  const { from, to } = fundWindow(new Date(2026, 0, 5), new Date(2026, 11, 31))

  it('counts every month of that year', () => {
    expect(periodInWindow(p(2026, 1), from, to)).toBe(true)
    expect(periodInWindow(p(2026, 6), from, to)).toBe(true)
    expect(periodInWindow(p(2026, 12), from, to)).toBe(true)
  })

  it('counts nothing outside it', () => {
    // This is what makes the change safe for funds already running: for the
    // ordinary case the window and the calendar year are the same set.
    expect(periodInWindow(p(2025, 12), from, to)).toBe(false)
    expect(periodInWindow(p(2027, 1), from, to)).toBe(false)
  })
})

describe('a fund that crosses a year boundary', () => {
  // Opened September 2026, due June 2027 — the case the calendar year got wrong
  // in both directions.
  const { from, to } = fundWindow(new Date(2026, 8, 1), new Date(2027, 5, 30))

  it('counts the months before the deadline year', () => {
    // Previously R0: members contributed for four months into a fund whose
    // total never moved, because none of those periods fell in 2027.
    expect(periodInWindow(p(2026, 9), from, to)).toBe(true)
    expect(periodInWindow(p(2026, 12), from, to)).toBe(true)
  })

  it('counts the months in the deadline year up to the deadline', () => {
    expect(periodInWindow(p(2027, 1), from, to)).toBe(true)
    expect(periodInWindow(p(2027, 6), from, to)).toBe(true)
  })

  it('stops at the deadline', () => {
    // The other half of the bug, and the quieter one: the calendar year swept
    // in July to December 2027 — six months after this fund was due, which
    // belong to whatever fund comes next.
    expect(periodInWindow(p(2027, 7), from, to)).toBe(false)
    expect(periodInWindow(p(2027, 12), from, to)).toBe(false)
  })

  it('ignores anything before the fund existed', () => {
    expect(periodInWindow(p(2026, 8), from, to)).toBe(false)
  })
})

describe('the filter handed to the database', () => {
  it('bounds both ends on the year and the month together', () => {
    // A period is stored as two columns, so neither bound can be a single
    // comparison — 2027-01 is later than 2026-09 despite the smaller month.
    const { from, to } = fundWindow(new Date(2026, 8, 1), new Date(2027, 5, 30))
    const where = periodsWithin(from, to)

    expect(where.AND).toHaveLength(2)
    expect(where.AND[0]).toEqual({
      OR: [{ periodYear: { gt: 2026 } }, { periodYear: 2026, periodMonth: { gte: 9 } }],
    })
    expect(where.AND[1]).toEqual({
      OR: [{ periodYear: { lt: 2027 } }, { periodYear: 2027, periodMonth: { lte: 6 } }],
    })
  })
})

describe('a fund that opens and closes in one month', () => {
  it('counts that month and nothing else', () => {
    const { from, to } = fundWindow(new Date(2026, 3, 2), new Date(2026, 3, 28))
    expect(periodInWindow(p(2026, 4), from, to)).toBe(true)
    expect(periodInWindow(p(2026, 3), from, to)).toBe(false)
    expect(periodInWindow(p(2026, 5), from, to)).toBe(false)
  })
})
