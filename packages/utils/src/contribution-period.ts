/**
 * Which period an admin may generate contributions for.
 *
 * Generating is the widest action on the console: one press writes a money
 * obligation for every active member with an active mandate, and there is no
 * undo. So the period it applies to is worth being certain about.
 *
 * The console had no check at all — month and year came from `parseInt` on a
 * form field and went straight to the query. The member app's equivalent has
 * always validated (month 1–12, year 2024 or later), so the same operation was
 * guarded on one side and open on the other. The rule lives here now so that
 * cannot drift, which is the third time in this codebase a money rule existed
 * in two places and only one of them was right.
 *
 * The database is the backstop, not the guard: `chk_contribution_month` and
 * `chk_contribution_year` refuse anything outside 1–12 and 2020–2100. They
 * protect the data, and they do it by throwing a constraint violation at
 * whoever pressed the button. A refusal should be a sentence, not a stack
 * trace — and 2020 to 2100 is eighty years of periods that are all "valid".
 */

/** How far from the current month a generated period may sit, in months. */
const WINDOW_MONTHS = 12

export type ContributionPeriod = { month: number; year: number }

/**
 * The first month real contributions exist for.
 *
 * Members have been paying by EFT since June 2026 (see `OfflineContributionSchema`'s
 * own doc comment) — the platform simply had nowhere to record it until the
 * offline path shipped. Before that, this Foundation did not exist as a going
 * concern with monthly obligations. A period earlier than this is not a month
 * anybody could have owed, so nothing — an admin backdating a recording, a
 * bulk month-open, a stray `parseInt` — should ever be able to create a
 * Contribution row for one.
 */
export const FOUNDING_PERIOD: ContributionPeriod = { month: 6, year: 2026 }

export type PeriodRefusal =
  /** Not a month and a year at all — an empty field, or `parseInt` of nonsense. */
  | 'NOT_A_PERIOD'
  /** A month outside 1–12. */
  | 'MONTH_OUT_OF_RANGE'
  /** Earlier than the Foundation had any contributions to speak of. */
  | 'BEFORE_FOUNDING'
  /** Further from today than a generated period has any business being. */
  | 'OUTSIDE_WINDOW'

export const PERIOD_REFUSAL_MESSAGE: Record<PeriodRefusal, string> = {
  NOT_A_PERIOD:
    'Choose a month and a year before generating.',
  MONTH_OUT_OF_RANGE:
    'That is not a month. Choose one between January and December.',
  BEFORE_FOUNDING:
    'Contributions began in June 2026 — there is no earlier period to generate or record.',
  OUTSIDE_WINDOW:
    'That period is more than a year away. Generating contributions for it would bill every member for a month nobody is in — pick a period within a year of today.',
}

/**
 * Whether contributions may be generated for this period. Null means allowed.
 *
 * The window is a year either side of today, which is what the console's own
 * year dropdown offers. A server that accepts what its UI does not offer is
 * trusting the client, and this is the operation where that costs the most.
 *
 * A period in the recent past is deliberately still allowed. Catching up on a
 * month that was missed is a real thing leadership does; the obligations it
 * writes are simply overdue on arrival, which is true and is what the
 * confirmation says before anybody presses it.
 */
export function refusePeriod(
  period: { month: number; year: number },
  now = new Date(),
): PeriodRefusal | null {
  const { month, year } = period

  if (!Number.isInteger(month) || !Number.isInteger(year)) return 'NOT_A_PERIOD'
  if (month < 1 || month > 12) return 'MONTH_OUT_OF_RANGE'

  const asMonths = year * 12 + month

  const foundingMonths = FOUNDING_PERIOD.year * 12 + FOUNDING_PERIOD.month
  if (asMonths < foundingMonths) return 'BEFORE_FOUNDING'

  const nowMonths = now.getFullYear() * 12 + (now.getMonth() + 1)
  if (Math.abs(asMonths - nowMonths) > WINDOW_MONTHS) return 'OUTSIDE_WINDOW'

  return null
}

/** Whether this period is already behind us — true for the month we are in. */
export function isPastPeriod(period: ContributionPeriod, now = new Date()): boolean {
  const asMonths = period.year * 12 + period.month
  const nowMonths = now.getFullYear() * 12 + (now.getMonth() + 1)
  return asMonths < nowMonths
}

/**
 * The instant a contribution period's due date falls — the last moment of its
 * last day, not midnight at the start of it.
 *
 * Every contribution used to fall due on whichever day of the month the
 * member's mandate happened to specify (`debitDay`, 1–28) — a scheduling
 * choice for a debit order that has not run a single collection yet, wearing
 * the costume of a payment deadline it was never meant to be. A member with
 * `debitDay: 5` was marked OVERDUE on the 6th of the month for a system with
 * no automatic collection at all, while one with `debitDay: 28` had three and
 * a half weeks nobody else got. There being no debit order yet is exactly why
 * everybody's real deadline is the same: the end of the month itself.
 *
 * `new Date(year, month, 0)` is the day before the 1st of `month` — JavaScript
 * rolls day 0 back into the previous month, which is `month` in this function's
 * 1-indexed calling convention (`month: 6` means June, and day 0 of the `Date`
 * constructor's 0-indexed month 6 is 30 June). The time is set to the last
 * millisecond of that day, not midnight, so a member is not OVERDUE for even
 * an instant before their month has actually finished.
 */
export function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999)
}
