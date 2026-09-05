import { roundZAR, subtractZAR, sumZAR } from '@/lib/money'

/**
 * Where a payment goes when it is larger than the month it was recorded against.
 *
 * ── The behaviour this replaces ────────────────────────────────────────────
 *
 * A member owing R450 who paid R1 000 used to leave the whole R1 000 sitting on
 * one month. The month read PAID with more against it than was due, an alert
 * went to leadership, and the R550 did nothing: the next month opened owing the
 * full amount again, and the member — who believed they had paid two months —
 * was shown as unpaid and chased for it.
 *
 * Nothing was lost. The pool held the money and the ledger was right. But the
 * member's own record disagreed with what they had done, and a savings circle
 * runs on members trusting that record.
 *
 * ── What it does instead ───────────────────────────────────────────────────
 *
 * The payment is SPLIT across the months it actually covers. The month the
 * administrator named is filled first, because that is what they were told the
 * money was for, and the remainder flows to whatever else is unsettled, oldest
 * first.
 *
 * Oldest first is the part worth defending. A member behind on July who pays
 * generously in September has, in their own account of it, caught up on July —
 * and arrears are what a member is chased about. Filling the future first would
 * leave the debt standing while the member watched their extra money go
 * somewhere they had not asked for.
 *
 * ── What it deliberately will not do ───────────────────────────────────────
 *
 * It never invents a period. Spilling into a month nobody has opened would mean
 * the system deciding what a member owes for a month leadership has not yet
 * declared — and `generateMonthlyContributions` is the only thing entitled to
 * say that. So money with nowhere to go stays where it was recorded, the month
 * reads over-paid, and the alert leadership already receives still fires. That
 * is the honest end state: the record says money arrived that nothing was owed
 * for, which is exactly what happened.
 *
 * It also never touches a WAIVED month — see the repository query — and never
 * moves money the member did not send. The allocations always sum to the amount
 * received, which is the property the tests hold it to.
 */

/** A period this money could be placed against. */
export type AllocatablePeriod = {
  id: string
  amountDue: unknown
  amountPaid: unknown
}

export type Allocation = {
  contributionId: string
  amount: number
}

/** What a period still needs before it is settled. Never negative. */
export function outstandingOn(period: Omit<AllocatablePeriod, 'id'>): number {
  const due = Number(period.amountDue)
  const paid = Number(period.amountPaid)
  return Math.max(0, roundZAR(subtractZAR(due, paid)))
}

/**
 * Split `received` across the named period and then the others.
 *
 * `others` must already be ordered oldest first. The first allocation is always
 * the named period, even when it needs nothing — a zero there would be a
 * transaction row for no money, so it is dropped, but the ORDER is what carries
 * the administrator's stated intent.
 *
 * Any remainder after every period is full stays on the named period, so the
 * total allocated always equals the amount received.
 */
export function allocatePayment(
  received: number,
  named: AllocatablePeriod,
  others: AllocatablePeriod[],
): Allocation[] {
  const total = roundZAR(received)
  let left = total

  const namedTakes = Math.min(left, outstandingOn(named))
  left = roundZAR(subtractZAR(left, namedTakes))

  const spill: Allocation[] = []
  for (const period of others) {
    if (left <= 0) break
    const takes = Math.min(left, outstandingOn(period))
    if (takes <= 0) continue
    spill.push({ contributionId: period.id, amount: roundZAR(takes) })
    left = roundZAR(subtractZAR(left, takes))
  }

  // Whatever nothing could absorb goes back to the month it was recorded
  // against. That is the over-payment case, and it stays visible as one.
  const namedTotal = sumZAR(namedTakes, left)

  const allocations = namedTotal > 0
    ? [{ contributionId: named.id, amount: namedTotal }, ...spill]
    : spill

  return allocations
}
