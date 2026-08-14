import { DsrStatus } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Watching the thirty days that POPIA gives the Foundation to answer a request.
 *
 * `DataSubjectRequest` stores `dueAt` and the admin table sorts by it, which
 * makes a looming deadline visible to anyone who opens that page. Nobody opens
 * that page. It is a compliance screen in a savings app — it is looked at when
 * someone is already thinking about data requests, which is exactly not the
 * moment the reminder is needed.
 *
 * So the deadline needs to come and find a person, the way the debit run and the
 * ledger reconciliation already do.
 *
 * **Deliberately not a `WATCHED_JOBS` heartbeat.** That registry states its
 * admission rule plainly — the jobs whose silence costs money — and this one
 * costs a statutory deadline instead. Widening the rule to fit would dilute a
 * list whose value is that everything on it is worth waking up for.
 */

/**
 * How close to the deadline the first warning goes out.
 *
 * Nine days before, so it lands with more than a week left. An answer to an
 * access request may need a member's whole record assembled and checked, and a
 * warning that arrives with two days left is not a warning, it is a countdown.
 */
export const WARN_WITHIN_DAYS = 9

const OPEN: DsrStatus[] = [DsrStatus.RECEIVED, DsrStatus.IN_PROGRESS]

export type DeadlineFinding = {
  id: string
  kind: string
  status: DsrStatus
  /**
   * The deadline as `YYYY-MM-DD`, not a `Date`.
   *
   * This survey is called inside an Inngest `step.run`, which round-trips its
   * result through JSON — a `Date` goes in and a string comes out, while the
   * type still claims `Date`. Returning the formatted day makes the boundary
   * honest rather than leaving a lie for the first caller who calls a method on
   * it. The retention survey does the same for the same reason.
   */
  dueOn: string
  /** Negative once the statutory period has already been missed. */
  daysLeft: number
}

export type DeadlineSurvey = {
  breached: DeadlineFinding[]
  approaching: DeadlineFinding[]
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * Find every open request that is past its deadline or close to it.
 *
 * Reads only. Requesters' names, emails and their own description of what they
 * want are deliberately not selected: the caller turns this into an alert that
 * travels by email and inbox to every administrator, and none of that is needed
 * to say "three requests need answering, here is where to read them".
 */
export async function surveyDsrDeadlines(now: Date = new Date()): Promise<DeadlineSurvey> {
  const horizon = new Date(now.getTime() + WARN_WITHIN_DAYS * 86_400_000)

  const rows = await db.dataSubjectRequest.findMany({
    where: { status: { in: OPEN }, dueAt: { lt: horizon } },
    orderBy: { dueAt: 'asc' },
    select: { id: true, kind: true, status: true, dueAt: true },
  })

  const findings: DeadlineFinding[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    dueOn: r.dueAt.toISOString().slice(0, 10),
    daysLeft: daysBetween(now, r.dueAt),
  }))

  return {
    breached: findings.filter((f) => f.daysLeft < 0),
    approaching: findings.filter((f) => f.daysLeft >= 0),
  }
}
