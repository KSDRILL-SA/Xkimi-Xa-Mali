import { ContributionStatus, MandateStatus, UserStatus } from '@prisma/client'
import { refusePeriod, PERIOD_REFUSAL_MESSAGE } from '@xxm/utils/contribution-period'
import { db, Prisma } from '@/lib/db'
import { assertAdmin, writeAuditLog, AdminConflictError } from './shared'

// ─── Contributions ────────────────────────────────────────────────────────────

export async function listAllContributions(
  adminRoles: string[],
  params: { month: number; year: number; status?: string; page?: number; limit?: number },
) {
  assertAdmin(adminRoles)
  const { month, year, status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where: Prisma.ContributionWhereInput = {
    periodMonth: month, periodYear: year,
    ...(status && { status: status as ContributionStatus }),
  }

  const [items, total] = await Promise.all([
    db.contribution.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, periodMonth: true, periodYear: true,
        amountDue: true, amountPaid: true, status: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    db.contribution.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * The transactions behind a set of contributions, for the reversal action.
 *
 * A reversal acts on a Transaction, but this console lists Contributions — so
 * without this there is nothing for leadership to point at. Loaded for the
 * page's current rows only, in one query rather than one per row.
 *
 * `reversal` comes back so the UI can show that a payment has already been
 * corrected and refuse to offer it twice; the service enforces that too, but an
 * action a screen should never have offered is a worse experience than one that
 * was never shown.
 */
export async function listTransactionsForContributions(
  adminRoles: string[],
  contributionIds: string[],
) {
  assertAdmin(adminRoles)
  if (contributionIds.length === 0) return []

  return db.transaction.findMany({
    where: { contributionId: { in: contributionIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, contributionId: true, amount: true, type: true, status: true,
      gatewayRef: true, reversalReason: true, createdAt: true,
      reversal: { select: { id: true } },
    },
  })
}

export async function generateContributions(
  adminId: string, adminRoles: string[],
  month: number, year: number,
) {
  assertAdmin(adminRoles)

  // The month and year arrive from `parseInt` on a form field. The database
  // refuses an impossible period, but it does so with a constraint violation
  // after the press — and it considers every month from 2020 to 2100 possible.
  const refusal = refusePeriod({ month, year })
  if (refusal) throw new AdminConflictError(PERIOD_REFUSAL_MESSAGE[refusal])

  const mandates = await db.paymentMandate.findMany({
    where: { status: MandateStatus.ACTIVE, user: { status: UserStatus.ACTIVE } },
    select: { userId: true, debitDay: true, amount: true },
  })

  const existing = await db.contribution.findMany({
    where: {
      userId: { in: mandates.map((m) => m.userId) },
      periodMonth: month, periodYear: year,
    },
    select: { userId: true },
  })
  const alreadyHas = new Set(existing.map((c) => c.userId))
  const toCreate = mandates.filter((m) => !alreadyHas.has(m.userId))

  if (toCreate.length > 0) {
    await db.contribution.createMany({
      data: toCreate.map((m) => ({
        userId: m.userId,
        periodMonth: month,
        periodYear: year,
        amountDue: m.amount,
        amountPaid: 0,
        dueDate: new Date(year, month - 1, m.debitDay),
        status: ContributionStatus.PENDING,
      })),
      skipDuplicates: true,
    })
  }

  const created = toCreate.length
  const skipped = mandates.length - toCreate.length

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_CONTRIBUTIONS_GENERATED',
    entity: 'Contribution',
    entityId: `${year}-${month}`,
    payload: { month, year, created, skipped, total: mandates.length },
  })

  return { created, skipped, total: mandates.length }
}

/**
 * What generating this period would do, without doing it.
 *
 * The console offered no confirmation on the widest action it has, while
 * reversing a single transaction — one member, one amount, and undoable in the
 * sense that the entry stays visible — asks the admin to confirm in a dialog
 * that spells out the consequence. The proportion was backwards.
 *
 * Cheap enough to run on every render of the page: two counts, both indexed.
 */
export async function previewGeneration(
  adminRoles: string[], month: number, year: number,
): Promise<{ eligible: number; alreadyHave: number; toCreate: number }> {
  assertAdmin(adminRoles)
  if (refusePeriod({ month, year })) return { eligible: 0, alreadyHave: 0, toCreate: 0 }

  const mandates = await db.paymentMandate.findMany({
    where: { status: MandateStatus.ACTIVE, user: { status: UserStatus.ACTIVE } },
    select: { userId: true },
  })
  if (mandates.length === 0) return { eligible: 0, alreadyHave: 0, toCreate: 0 }

  const alreadyHave = await db.contribution.count({
    where: {
      userId: { in: mandates.map((m) => m.userId) },
      periodMonth: month, periodYear: year,
    },
  })

  return {
    eligible: mandates.length,
    alreadyHave,
    toCreate: mandates.length - alreadyHave,
  }
}
