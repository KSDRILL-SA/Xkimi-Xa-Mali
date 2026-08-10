import { describe, it, expect } from 'vitest'
import { refusePeriod, isPastPeriod } from '../contribution-period'

/**
 * Generating is the widest action on the console: one press writes a money
 * obligation for every active member with an active mandate, and there is no
 * undo. The console reached it through `parseInt` on a form field with no check
 * at all, while the member app's equivalent had validated all along — the same
 * operation guarded on one side and open on the other.
 */

const NOW = new Date(2026, 7, 15) // 15 August 2026

describe('a period that can be generated', () => {
  it('accepts the month we are in', () => {
    expect(refusePeriod({ month: 8, year: 2026 }, NOW)).toBeNull()
  })

  it('accepts a year either side', () => {
    expect(refusePeriod({ month: 8, year: 2025 }, NOW)).toBeNull()
    expect(refusePeriod({ month: 8, year: 2027 }, NOW)).toBeNull()
  })

  it('accepts a recent month that was missed', () => {
    // Catching up is a real thing leadership does. The obligations are overdue
    // on arrival, which the confirmation says rather than the guard forbidding.
    expect(refusePeriod({ month: 6, year: 2026 }, NOW)).toBeNull()
  })
})

describe('a period that cannot', () => {
  it('refuses one more than a year away', () => {
    expect(refusePeriod({ month: 7, year: 2025 }, NOW)).toBe('OUTSIDE_WINDOW')
    expect(refusePeriod({ month: 9, year: 2027 }, NOW)).toBe('OUTSIDE_WINDOW')
  })

  it('refuses a year the database would happily accept', () => {
    // `chk_contribution_year` allows 2020 to 2100, and the member app's schema
    // allowed anything from 2024 up. Both would have taken this.
    expect(refusePeriod({ month: 1, year: 2099 }, NOW)).toBe('OUTSIDE_WINDOW')
    expect(refusePeriod({ month: 1, year: 2021 }, NOW)).toBe('OUTSIDE_WINDOW')
  })

  it('refuses a month that is not one', () => {
    expect(refusePeriod({ month: 13, year: 2026 }, NOW)).toBe('MONTH_OUT_OF_RANGE')
    expect(refusePeriod({ month: 0, year: 2026 }, NOW)).toBe('MONTH_OUT_OF_RANGE')
  })

  it('refuses what parseInt makes of an empty field', () => {
    // The console read the period with `parseInt(fd.get('month'))`. An absent
    // or unparseable field is NaN, which reached `new Date(year, NaN, day)`.
    expect(refusePeriod({ month: NaN, year: 2026 }, NOW)).toBe('NOT_A_PERIOD')
    expect(refusePeriod({ month: 8, year: NaN }, NOW)).toBe('NOT_A_PERIOD')
  })

  it('refuses a fractional period', () => {
    expect(refusePeriod({ month: 8.5, year: 2026 }, NOW)).toBe('NOT_A_PERIOD')
  })
})

describe('whether a period has passed', () => {
  it('is false for the month we are in', () => {
    // The current month is not overdue, so the confirmation must not say it is.
    expect(isPastPeriod({ month: 8, year: 2026 }, NOW)).toBe(false)
  })

  it('is true for a month behind us, across a year boundary too', () => {
    expect(isPastPeriod({ month: 7, year: 2026 }, NOW)).toBe(true)
    expect(isPastPeriod({ month: 12, year: 2025 }, NOW)).toBe(true)
  })

  it('is false for a month ahead', () => {
    expect(isPastPeriod({ month: 9, year: 2026 }, NOW)).toBe(false)
    expect(isPastPeriod({ month: 1, year: 2027 }, NOW)).toBe(false)
  })
})
