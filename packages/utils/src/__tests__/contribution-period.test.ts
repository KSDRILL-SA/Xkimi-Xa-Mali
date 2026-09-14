import { describe, it, expect } from 'vitest'
import { refusePeriod, isPastPeriod, endOfMonth } from '../contribution-period'

/**
 * Generating is the widest action on the console: one press writes a money
 * obligation for every active member with an active mandate, and there is no
 * undo. The console reached it through `parseInt` on a form field with no check
 * at all, while the member app's equivalent had validated all along — the same
 * operation guarded on one side and open on the other.
 */

const NOW = new Date(2026, 7, 15) // 15 August 2026 — a couple of months after founding

describe('a period that can be generated', () => {
  it('accepts the month we are in', () => {
    expect(refusePeriod({ month: 8, year: 2026 }, NOW)).toBeNull()
  })

  it('accepts the founding month itself', () => {
    expect(refusePeriod({ month: 6, year: 2026 }, NOW)).toBeNull()
  })

  it('accepts a year ahead, within the window', () => {
    expect(refusePeriod({ month: 8, year: 2027 }, NOW)).toBeNull()
  })

  it('accepts a recent month that was missed', () => {
    // Catching up is a real thing leadership does. The obligations are overdue
    // on arrival, which the confirmation says rather than the guard forbidding.
    expect(refusePeriod({ month: 7, year: 2026 }, NOW)).toBeNull()
  })
})

describe('the founding floor', () => {
  // Members have paid by EFT since June 2026 — nothing earlier is a period
  // anybody could have owed. This used to be unenforced: only the relative
  // ±12-month window stood between "a year ago" and a period this Foundation
  // never had.
  it('refuses anything before contributions began', () => {
    expect(refusePeriod({ month: 5, year: 2026 }, NOW)).toBe('BEFORE_FOUNDING')
    expect(refusePeriod({ month: 12, year: 2025 }, NOW)).toBe('BEFORE_FOUNDING')
  })

  it('refuses a year the database would happily accept', () => {
    // `chk_contribution_year` allows 2020 to 2100, and the member app's schema
    // allowed anything from 2024 up. Both would have taken this.
    expect(refusePeriod({ month: 1, year: 2099 }, NOW)).toBe('OUTSIDE_WINDOW')
    expect(refusePeriod({ month: 1, year: 2021 }, NOW)).toBe('BEFORE_FOUNDING')
  })

  it('takes priority over the outside-window refusal', () => {
    // Long enough after founding that a pre-founding period is also more than
    // a year behind "now" — BEFORE_FOUNDING is still the answer, because it
    // is the more specific and more useful thing to tell somebody.
    const muchLater = new Date(2028, 0, 1)
    expect(refusePeriod({ month: 1, year: 2020 }, muchLater)).toBe('BEFORE_FOUNDING')
  })

  it('stops applying once a real period is old enough to fall outside the window instead', () => {
    // Founding was June 2026; two years later, June 2026 itself is legitimately
    // stale — more than a year behind "now" — and OUTSIDE_WINDOW is now the
    // operative refusal rather than BEFORE_FOUNDING.
    const muchLater = new Date(2028, 7, 15) // August 2028
    expect(refusePeriod({ month: 6, year: 2026 }, muchLater)).toBe('OUTSIDE_WINDOW')
  })
})

describe('a period that cannot', () => {
  it('refuses one more than a year away in the future', () => {
    expect(refusePeriod({ month: 9, year: 2027 }, NOW)).toBe('OUTSIDE_WINDOW')
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

describe('when a period is due', () => {
  // Every contribution used to fall due on whichever day of the month a
  // member's mandate happened to specify — a debit-order scheduling choice
  // wearing the costume of a payment deadline, for a system with no automatic
  // collection running at all. The real deadline is the same for everybody:
  // the end of the month itself.
  it('is the last day of the month, not the 1st of the next one', () => {
    const due = endOfMonth(2026, 6)
    expect(due.getFullYear()).toBe(2026)
    expect(due.getMonth()).toBe(5) // June, 0-indexed
    expect(due.getDate()).toBe(30)
  })

  it('gets February right in both a common and a leap year', () => {
    expect(endOfMonth(2026, 2).getDate()).toBe(28)
    expect(endOfMonth(2028, 2).getDate()).toBe(29)
  })

  it('is the last instant of the day, so nobody is overdue before their month is over', () => {
    const due = endOfMonth(2026, 6)
    expect(due.getHours()).toBe(23)
    expect(due.getMinutes()).toBe(59)
    expect(due.getSeconds()).toBe(59)
  })
})
