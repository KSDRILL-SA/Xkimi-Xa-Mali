import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import type { ContributionStatus, TransactionStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { writeAuditLog } from './audit.service'
import { logger } from '@/lib/logger'
import {
  ForbiddenError,
  ContributionNotFoundError,
  ContributionConflictError,
  MandateConflictError,
} from '@/lib/errors'
import { submitOnceOffDebit, mapNetcashTransactionStatus } from '@/lib/netcash'
import type { ManualContributionInput, GenerateContributionsInput } from '@/lib/validation/contribution'
import type { NetcashTransactionEvent } from '@/lib/netcash'

// ─── Access control ────────────────────────────────────────────────────────

function assertCanAccess(targetUserId: string, requesterId: string, roles: string[]) {
  if (targetUserId !== requesterId && !roles.includes('ADMIN')) {
    throw new ForbiddenError('Access denied')
  }
}

// ─── Queries ───────────────────────────────────────────────────────────────

export async function getContributions(
  userId: string,
  requesterId: string,
  roles: string[],
  page = 1,
  limit = 12,
) {
  assertCanAccess(userId, requesterId, roles)

  const [items, total] = await Promise.all([
    db.contribution.findMany({
      where: { userId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    }),
    db.contribution.count({ where: { userId } }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getContribution(id: string, requesterId: string, roles: string[]) {
  const contribution = await db.contribution.findUnique({
    where: { id },
    include: { transactions: { orderBy: { createdAt: 'desc' } } },
  })
  if (!contribution) throw new ContributionNotFoundError()
  assertCanAccess(contribution.userId, requesterId, roles)
  return contribution
}

// DB-aggregated summary — does NOT load all contributions into memory.
export async function getContributionSummary(
  userId: string,
  requesterId: string,
  roles: string[],
) {
  assertCanAccess(userId, requesterId, roles)

  const currentYear = new Date().getFullYear()

  const [byStatus, totals, yearTotals] = await Promise.all([
    db.contribution.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    }),
    db.contribution.aggregate({
      where: { userId },
      _sum: { amountPaid: true },
      _count: { id: true },
    }),
    db.contribution.aggregate({
      where: { userId, periodYear: currentYear },
      _sum: { amountPaid: true },
    }),
  ])

  const statusCounts = Object.fromEntries(
    byStatus.map((r) => [r.status, r._count.status]),
  )

  return {
    totalPaid: Number(totals._sum.amountPaid ?? 0),
    yearlyPaid: Number(yearTotals._sum.amountPaid ?? 0),
    totalContributions: totals._count.id,
    paid:    statusCounts['PAID']    ?? 0,
    partial: statusCounts['PARTIAL'] ?? 0,
    pending: statusCounts['PENDING'] ?? 0,
    overdue: statusCounts['OVERDUE'] ?? 0,
  }
}

// ─── Manual payment ────────────────────────────────────────────────────────

export async function submitManualPayment(
  userId: string,
  data: ManualContributionInput,
  requesterId: string,
  roles: string[],
  ip?: string,
) {
  assertCanAccess(userId, requesterId, roles)

  const mandate = await db.paymentMandate.findFirst({
    where: { userId, status: 'ACTIVE' },
  })
  if (!mandate?.netcashMandateId) {
    throw new MandateConflictError(
      'An active payment mandate is required to make a manual payment',
      'CTR_002',
    )
  }

  const dueDate = new Date(data.periodYear, data.periodMonth - 1, mandate.debitDay)
  let contribution = await db.contribution.findUnique({
    where: {
      userId_periodMonth_periodYear: {
        userId,
        periodMonth: data.periodMonth,
        periodYear: data.periodYear,
      },
    },
  })

  if (!contribution) {
    contribution = await db.contribution.create({
      data: {
        userId,
        periodMonth: data.periodMonth,
        periodYear: data.periodYear,
        amountDue: Number(mandate.amount),
        amountPaid: 0,
        dueDate,
        status: 'PENDING',
      },
    })
  }

  if (contribution.status === 'PAID') {
    throw new ContributionConflictError('This period is already fully paid', 'CTR_003')
  }

  const remaining = Number(contribution.amountDue) - Number(contribution.amountPaid)
  if (data.amount > remaining + 0.01) {
    throw new ContributionConflictError(
      `Amount exceeds remaining balance of R${remaining.toFixed(2)}`,
      'CTR_004',
    )
  }

  const idempotencyKey = `manual:${userId}:${data.periodYear}-${data.periodMonth}:${randomUUID()}`

  const gatewayRes = await submitOnceOffDebit({
    mandateId: mandate.netcashMandateId,
    amount: data.amount,
    reference: `XXM-${data.periodYear}-${String(data.periodMonth).padStart(2, '0')}`,
    idempotencyKey,
  })

  const txStatus: TransactionStatus =
    gatewayRes.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING'

  const transaction = await db.transaction.create({
    data: {
      contributionId: contribution.id,
      mandateId: mandate.id,
      amount: data.amount,
      type: 'MANUAL',
      status: txStatus,
      gatewayRef: gatewayRes.transactionRef ?? null,
      gatewayResponse: gatewayRes as unknown as Prisma.InputJsonValue,
      idempotencyKey,
      processedAt: txStatus === 'SUCCESS' ? new Date() : null,
    },
  })

  if (txStatus === 'SUCCESS') {
    await recalculateContributionStatus(contribution.id)
  }

  await writeAuditLog({
    userId,
    action: 'MANUAL_PAYMENT_SUBMITTED',
    entity: 'Transaction',
    entityId: transaction.id,
    payload: {
      contributionId: contribution.id,
      periodMonth: data.periodMonth,
      periodYear: data.periodYear,
      amount: data.amount,
      gatewayStatus: gatewayRes.status,
    } as Prisma.InputJsonValue,
    ipAddress: ip,
  })

  logger.info('Manual payment submitted', {
    userId,
    contributionId: contribution.id,
    amount: data.amount,
    gatewayStatus: gatewayRes.status,
  })

  return { contribution, transaction }
}

// ─── Status engine ─────────────────────────────────────────────────────────

// Derives contribution status from the sum of all SUCCESS transactions.
// Always called after a transaction status change so the ledger stays consistent.
export async function recalculateContributionStatus(contributionId: string) {
  const [contribution, aggr] = await Promise.all([
    db.contribution.findUnique({ where: { id: contributionId } }),
    db.transaction.aggregate({
      where: { contributionId, status: 'SUCCESS' },
      _sum: { amount: true },
    }),
  ])

  if (!contribution) return

  const newAmountPaid = Number(aggr._sum.amount ?? 0)
  const amountDue = Number(contribution.amountDue)
  const now = new Date()

  let status: ContributionStatus
  if (newAmountPaid >= amountDue) {
    status = 'PAID'
  } else if (newAmountPaid > 0) {
    status = 'PARTIAL'
  } else if (now > contribution.dueDate) {
    status = 'OVERDUE'
  } else {
    status = 'PENDING'
  }

  await db.contribution.update({
    where: { id: contributionId },
    data: { amountPaid: newAmountPaid, status },
  })
}

// ─── Webhook: transaction settlement ──────────────────────────────────────

export async function processTransactionWebhook(event: NetcashTransactionEvent) {
  const transaction = await db.transaction.findFirst({
    where: { gatewayRef: event.transactionRef },
  })

  if (!transaction) return

  const newStatus = mapNetcashTransactionStatus(event.status)
  if (!newStatus) return

  const terminal: TransactionStatus[] = ['SUCCESS', 'REVERSED']
  if (terminal.includes(transaction.status as TransactionStatus)) return
  if (transaction.status === newStatus) return

  await db.transaction.update({
    where: { id: transaction.id },
    data: {
      status: newStatus,
      processedAt: newStatus === 'SUCCESS' ? new Date() : null,
      gatewayResponse: event as unknown as Prisma.InputJsonValue,
    },
  })

  await recalculateContributionStatus(transaction.contributionId)

  logger.info('Transaction webhook processed', {
    transactionId: transaction.id,
    transactionRef: event.transactionRef,
    previousStatus: transaction.status,
    newStatus,
  })

  await writeAuditLog({
    action: 'TRANSACTION_WEBHOOK_RECEIVED',
    entity: 'Transaction',
    entityId: transaction.id,
    payload: {
      transactionRef: event.transactionRef,
      previousStatus: transaction.status,
      newStatus,
      reason: event.reason ?? null,
    } as Prisma.InputJsonValue,
  })
}

// ─── Admin: generate monthly contribution records ──────────────────────────

export async function generateMonthlyContributions(
  data: GenerateContributionsInput,
  adminId: string | undefined,
  adminRoles: string[],
) {
  if (!adminRoles.includes('ADMIN')) throw new ForbiddenError('Admin access required')

  const mandates = await db.paymentMandate.findMany({
    where: { status: 'ACTIVE' },
    include: { user: { select: { id: true, status: true } } },
  })

  const eligible = mandates.filter((m) => m.user.status === 'ACTIVE')

  let created = 0
  let skipped = 0

  for (const mandate of eligible) {
    const existing = await db.contribution.findUnique({
      where: {
        userId_periodMonth_periodYear: {
          userId: mandate.userId,
          periodMonth: data.month,
          periodYear: data.year,
        },
      },
    })

    if (existing) { skipped++; continue }

    const dueDate = new Date(data.year, data.month - 1, mandate.debitDay)
    await db.contribution.create({
      data: {
        userId: mandate.userId,
        periodMonth: data.month,
        periodYear: data.year,
        amountDue: mandate.amount,
        amountPaid: 0,
        dueDate,
        status: 'PENDING',
      },
    })
    created++
  }

  logger.info('Monthly contributions generated', { month: data.month, year: data.year, created, skipped })

  await writeAuditLog({
    userId: adminId,
    action: 'CONTRIBUTIONS_GENERATED',
    entity: 'Contribution',
    entityId: `${data.year}-${data.month}`,
    payload: {
      month: data.month,
      year: data.year,
      created,
      skipped,
      total: eligible.length,
    } as Prisma.InputJsonValue,
  })

  return { created, skipped, total: eligible.length }
}
