import { randomUUID } from 'node:crypto'
import { ContributionStatus, MandateStatus, UserStatus } from '@prisma/client'
import { refusePeriod, PERIOD_REFUSAL_MESSAGE } from '@xxm/utils/contribution-period'
import { db, Prisma } from '@/lib/db'
import {
  assertAdmin, writeAuditLog, notifyInbox, roundZAR,
  AdminConflictError, AdminNotFoundError,
} from './shared'

/** For telling a member which month, in the words they use. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

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
  /** Caller IP, for the audit trail. See `requireAdmin`. */
  ip?: string,
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
    ipAddress: ip,
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


// --- Releasing a month, and money that arrived another way -------------------
//
// Both were promised to members in writing and existed nowhere in the code.
// `WAIVED` was read by statements, member insights, the collection-rate report
// and badge scoring - and written by nothing, so a contribution could never
// reach it. Recording a payment that arrived as cash or a transfer had no path
// at all: a member could settle their own shortfall through the member app, but
// leadership could not enter money it had actually been handed.
//
// Everything downstream already handled a waived month correctly, which says
// this was designed and never finished rather than deliberately left out.

/**
 * Release a member from a month.
 *
 * Not a payment and not a deletion: the obligation stays on the record, marked
 * as released, with the name of whoever released it and why. The member's
 * statement shows a waiver rather than quietly reading as settled.
 */
export async function waiveContribution(
  adminId: string, adminRoles: string[], contributionId: string,
  /** Why. Told to the member, and kept in the audit trail. */
  reason?: string,
  /** Caller IP, for the audit trail. See `requireAdmin`. */
  ip?: string,
) {
  assertAdmin(adminRoles)

  const trimmed = reason?.trim() ?? ''
  if (trimmed.length < 10) {
    throw new AdminConflictError(
      'Give a reason of at least 10 characters - the member is told why, and it is recorded.',
    )
  }

  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    select: {
      id: true, userId: true, status: true, version: true,
      periodMonth: true, periodYear: true, amountDue: true, amountPaid: true,
    },
  })
  if (!c) throw new AdminNotFoundError('Contribution not found')

  if (c.status === ContributionStatus.WAIVED) {
    throw new AdminConflictError('That month has already been waived.')
  }
  if (c.status === ContributionStatus.PAID) {
    throw new AdminConflictError(
      'That month is settled in full - there is nothing to release. Reverse the payment instead if it was taken in error.',
    )
  }

  // Guarded on the version rather than written blind: the collection job can
  // settle a contribution between this read and this write, and waiving a month
  // that has just been paid would erase the payment from the member's standing.
  const { count } = await db.contribution.updateMany({
    where: { id: c.id, version: c.version },
    data: { status: ContributionStatus.WAIVED, version: { increment: 1 } },
  })
  if (count === 0) {
    throw new AdminConflictError('That contribution just changed - reload and look again before waiving it.')
  }

  const period = `${MONTH_NAMES[c.periodMonth - 1] ?? c.periodMonth} ${c.periodYear}`
  await notifyInbox({
    userId: c.userId,
    title: `${period} has been waived`,
    body:
      `Leadership has released you from your ${period} contribution. You do not need to pay it, ` +
      `and it will show on your statement as waived. Reason given: ${trimmed}`,
    category: 'PAYMENT',
    createdById: adminId,
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_CONTRIBUTION_WAIVED',
    entity: 'Contribution',
    entityId: c.id,
    payload: {
      memberId: c.userId,
      period: { month: c.periodMonth, year: c.periodYear },
      amountDue: Number(c.amountDue),
      amountPaid: Number(c.amountPaid),
      reason: trimmed,
    },
    ipAddress: ip,
  })

  return { id: c.id, status: 'WAIVED' as const, period }
}

/**
 * Money that reached the Foundation without passing through the debit order.
 *
 * Cash, or a transfer straight into the account. The member app can already
 * settle a shortfall on the member's own instruction; this is the other case,
 * where the money is already in hand and the record has to catch up.
 *
 * A `Transaction` row is written rather than the paid amount simply being
 * raised, so this money carries the same evidence as everything else: an
 * amount, a time, a type and a reference. It is typed `MANUAL` and attached to
 * the member's mandate, which is what the member app's own manual payments do -
 * the mandate is the account the member is known by, not a claim that this
 * money came through it.
 */
export async function recordPayment(
  adminId: string, adminRoles: string[], contributionId: string,
  amount: number,
  /** How it arrived - a deposit reference, cash at the meeting, and so on. */
  reference?: string,
  /** Caller IP, for the audit trail. See `requireAdmin`. */
  ip?: string,
) {
  assertAdmin(adminRoles)

  const note = reference?.trim() ?? ''
  if (note.length < 3) {
    throw new AdminConflictError(
      'Say how the money arrived - a deposit reference, or where the cash was handed over. It is the only record of that.',
    )
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AdminConflictError('Enter an amount greater than zero.')
  }

  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    select: {
      id: true, userId: true, status: true, version: true,
      periodMonth: true, periodYear: true, amountDue: true, amountPaid: true,
    },
  })
  if (!c) throw new AdminNotFoundError('Contribution not found')

  if (c.status === ContributionStatus.WAIVED) {
    throw new AdminConflictError('That month was waived - there is nothing owed to pay against.')
  }

  const outstanding = roundZAR(Number(c.amountDue) - Number(c.amountPaid))
  if (outstanding <= 0) {
    throw new AdminConflictError('That month is already settled in full.')
  }
  if (roundZAR(amount) > outstanding) {
    throw new AdminConflictError(
      `That is more than is outstanding. R${outstanding.toFixed(2)} is owed on this month.`,
    )
  }

  const mandate = await db.paymentMandate.findFirst({
    where: { userId: c.userId, status: MandateStatus.ACTIVE },
    select: { id: true },
  })
  if (!mandate) {
    throw new AdminConflictError(
      'This member has no active debit order, and a payment has to be recorded against one. Approve their mandate first.',
    )
  }

  const paid = roundZAR(Number(c.amountPaid) + amount)
  const settled = paid >= Number(c.amountDue)

  // The transaction and the contribution move together, or neither does. A
  // recorded payment with no matching row on the contribution is money the
  // member cannot see; a raised balance with no transaction behind it is a
  // figure nobody can trace.
  await db.$transaction(async (tx) => {
    const { count } = await tx.contribution.updateMany({
      where: { id: c.id, version: c.version },
      data: {
        amountPaid: paid,
        status: settled ? ContributionStatus.PAID : ContributionStatus.PARTIAL,
        version: { increment: 1 },
      },
    })
    if (count === 0) {
      throw new AdminConflictError(
        'That contribution just changed - reload and check what is outstanding before recording again.',
      )
    }

    await tx.transaction.create({
      data: {
        contributionId: c.id,
        mandateId: mandate.id,
        amount,
        type: 'MANUAL',
        status: 'SUCCESS',
        // Unique per recording. Two genuine cash payments in one month are a
        // real thing, so this deliberately does not collapse them.
        idempotencyKey: `admin-manual:${c.id}:${randomUUID()}`,
        processedAt: new Date(),
        gatewayResponse: { recordedBy: adminId, reference: note, channel: 'OUTSIDE_GATEWAY' },
      },
    })
  })

  const period = `${MONTH_NAMES[c.periodMonth - 1] ?? c.periodMonth} ${c.periodYear}`
  await notifyInbox({
    userId: c.userId,
    title: `R${amount.toFixed(2)} recorded against ${period}`,
    body:
      `Leadership has recorded a payment of R${amount.toFixed(2)} towards your ${period} contribution. ` +
      (settled
        ? 'That month is now settled in full.'
        : `R${roundZAR(outstanding - amount).toFixed(2)} is still outstanding.`) +
      ` Reference: ${note}`,
    category: 'PAYMENT',
    createdById: adminId,
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_PAYMENT_RECORDED',
    entity: 'Contribution',
    entityId: c.id,
    payload: {
      memberId: c.userId,
      period: { month: c.periodMonth, year: c.periodYear },
      amount,
      reference: note,
      outstandingBefore: outstanding,
      status: settled ? 'PAID' : 'PARTIAL',
    },
    ipAddress: ip,
  })

  return { id: c.id, amount, settled, period }
}
