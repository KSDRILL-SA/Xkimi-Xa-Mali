/**
 * The months a fund's total is built from.
 *
 * `syncPrimaryGoalProgress` derived the primary fund's total from every
 * contribution whose period fell in `deadline.getFullYear()`. That is right for
 * the ordinary case — a fund opened in January and due in December is the
 * year's fund, and the year is its window — and wrong in two ways as soon as a
 * fund does not line up with the calendar:
 *
 *   - A fund opened in September 2026 and due in June 2027 counted nothing paid
 *     during 2026. Members contributed for four months into a fund that showed
 *     R0 and stayed there.
 *   - The same fund counted July to December 2027 — six months that fall after
 *     its own deadline, and belong to whatever fund comes next.
 *
 * So the window is the fund's own span: the month it was created through the
 * month it is due. A January-to-December fund produces exactly the old
 * behaviour, which is what makes this safe to apply to funds already running.
 *
 * Expressed as a Prisma filter over (periodYear, periodMonth) rather than a
 * single comparable column, because that is how a contribution's period is
 * stored. Prisma cannot compare the pair directly, hence the two bounds.
 */
export type PeriodPoint = { year: number; month: number }

export function fundWindow(createdAt: Date, deadline: Date): { from: PeriodPoint; to: PeriodPoint } {
  return {
    from: { year: createdAt.getFullYear(), month: createdAt.getMonth() + 1 },
    to: { year: deadline.getFullYear(), month: deadline.getMonth() + 1 },
  }
}

/** A `where` fragment selecting contributions whose period lies in the window. */
export function periodsWithin(from: PeriodPoint, to: PeriodPoint) {
  return {
    AND: [
      { OR: [{ periodYear: { gt: from.year } }, { periodYear: from.year, periodMonth: { gte: from.month } }] },
      { OR: [{ periodYear: { lt: to.year } }, { periodYear: to.year, periodMonth: { lte: to.month } }] },
    ],
  }
}

/** Whether a single period falls inside the window — the same rule, readable. */
export function periodInWindow(p: PeriodPoint, from: PeriodPoint, to: PeriodPoint): boolean {
  const n = (x: PeriodPoint) => x.year * 12 + x.month
  return n(p) >= n(from) && n(p) <= n(to)
}
