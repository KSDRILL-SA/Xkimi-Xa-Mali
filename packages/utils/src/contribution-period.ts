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

export type PeriodRefusal =
  /** Not a month and a year at all — an empty field, or `parseInt` of nonsense. */
  | 'NOT_A_PERIOD'
  /** A month outside 1–12. */
  | 'MONTH_OUT_OF_RANGE'
  /** Further from today than a generated period has any business being. */
  | 'OUTSIDE_WINDOW'

export const PERIOD_REFUSAL_MESSAGE: Record<PeriodRefusal, string> = {
  NOT_A_PERIOD:
    'Choose a month and a year before generating.',
  MONTH_OUT_OF_RANGE:
    'That is not a month. Choose one between January and December.',
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
