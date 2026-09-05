/**
 * When a goal plan collects, and what that collection is called.
 *
 * Both rules are pure and live away from the service because both are ways a
 * scheduled debit goes wrong quietly: one skips months without telling anyone,
 * the other charges the same month twice.
 */

/** The period a collection belongs to, as YYYY-MM. */
export function periodKey(when: Date): string {
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`
}

/**
 * The day this month a plan set to `debitDay` should actually collect.
 *
 * A member who picks the 31st means "the end of the month", not "only the
 * seven months that have a 31st". Left unclamped, such a plan would never
 * collect in February, April, June, September or November — it would simply
 * appear not to work, five months a year, with nothing logged and no error
 * raised. February is the case that matters most: a plan set to the 29th, 30th
 * or 31st misses it in three years out of four.
 */
export function collectionDayInMonth(debitDay: number, year: number, month1: number): number {
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(year, month1, 0).getDate()
  return Math.min(debitDay, lastDay)
}

/**
 * Whether a plan should be acted on this date.
 *
 * The stamps are the guard against acting twice. The job runs daily and may be
 * retried within the same day, so "is it the right day" cannot be the only
 * question — the answer stays true for the whole of that day.
 *
 * Two stamps, either of which means this month is done:
 *
 *   - `lastCollectedPeriod` — money moved for this period, whether a collection
 *     took it or an administrator recorded a payment the member made.
 *   - `lastRequestedPeriod` — the member was asked for it, because nothing can
 *     collect. Asking twice in a month is not a money defect, but it is the
 *     kind of nagging that teaches people to ignore the message that matters.
 *
 * Reading both also covers the day a provider is finally appointed: a plan
 * already asked for this month is not then also charged for it.
 */
export function isDueOn(
  plan: {
    debitDay: number
    lastCollectedPeriod: string | null
    lastRequestedPeriod?: string | null
  },
  when: Date,
): boolean {
  const period = periodKey(when)
  if (plan.lastCollectedPeriod === period) return false
  if (plan.lastRequestedPeriod === period) return false
  return when.getDate() === collectionDayInMonth(plan.debitDay, when.getFullYear(), when.getMonth() + 1)
}

/**
 * What to collect this month, given what the goal still needs.
 *
 * The last instalment is trimmed to what is left rather than taking the full
 * amount and overshooting. A plan is a commitment to reach a target, not to
 * keep paying past it — and unlike a member typing an amount by hand, nobody is
 * present to be asked.
 *
 * Returns null when there is nothing left to collect, which is the signal to
 * complete the plan rather than charge zero.
 */
export function instalmentFor(amount: number, remaining: number): number | null {
  if (remaining <= 0) return null
  return Math.min(amount, remaining)
}
