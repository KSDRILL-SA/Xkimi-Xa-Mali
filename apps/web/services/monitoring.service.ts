import { db } from '@/lib/db'

export type AnomalySeverity = 'warning' | 'critical'

export type FinancialAnomaly = {
  code: string
  severity: AnomalySeverity
  title: string
  detail: string
}

// Tunable thresholds — conservative defaults for a small collective.
const COLLECTION_RATE_FLOOR = 70        // % of this month's due that should be paid
const FAILED_DEBIT_SPIKE = 3            // failed debits in the current month
const OVERDUE_FLOOR = 2                 // overdue contributions this month

/**
 * Operational radar: scans current-month financial health and returns any
 * anomalies worth an admin's attention. Pure read — DB-aggregated, parallel.
 */
export async function detectFinancialAnomalies(): Promise<FinancialAnomaly[]> {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const monthStart = new Date(year, month - 1, 1)

  const [contribAgg, failedThisMonth, overdueCount] = await Promise.all([
    db.contribution.aggregate({
      where: { periodMonth: month, periodYear: year },
      _sum: { amountDue: true, amountPaid: true },
    }),
    db.transaction.count({ where: { status: 'FAILED', createdAt: { gte: monthStart } } }),
    db.contribution.count({ where: { periodMonth: month, periodYear: year, status: 'OVERDUE' } }),
  ])

  const due = Number(contribAgg._sum.amountDue ?? 0)
  const paid = Number(contribAgg._sum.amountPaid ?? 0)
  const rate = due > 0 ? Math.round((paid / due) * 100) : 100

  const anomalies: FinancialAnomaly[] = []

  if (due > 0 && rate < COLLECTION_RATE_FLOOR) {
    anomalies.push({
      code: 'LOW_COLLECTION_RATE', severity: 'critical',
      title: 'Collection rate is low',
      detail: `This month is at ${rate}% collected (floor ${COLLECTION_RATE_FLOOR}%).`,
    })
  }
  if (failedThisMonth >= FAILED_DEBIT_SPIKE) {
    anomalies.push({
      code: 'FAILED_DEBIT_SPIKE', severity: 'warning',
      title: 'Multiple failed debits',
      detail: `${failedThisMonth} debit${failedThisMonth === 1 ? '' : 's'} failed this month.`,
    })
  }
  if (overdueCount >= OVERDUE_FLOOR) {
    anomalies.push({
      code: 'OVERDUE_CONTRIBUTIONS', severity: 'warning',
      title: 'Overdue contributions',
      detail: `${overdueCount} contribution${overdueCount === 1 ? '' : 's'} are overdue this month.`,
    })
  }

  return anomalies
}
