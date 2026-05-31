import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import type { ContributionStatus, TransactionStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { contributionRepo, runTransaction, type TxClient } from '@/repositories/contribution.repository'
import { transactionRepo } from '@/repositories/transaction.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { writeAuditLog } from './audit.service'
import { logger } from '@/lib/logger'
import { cache, CACHE_KEYS } from '@/lib/cache'
import {
  ContributionNotFoundError,
  ContributionConflictError,
  MandateConflictError,
  TransactionNotFoundError,
} from '@/lib/errors'
import { assertCanAccess, assertAdmin } from '@/lib/authorization'
import { paymentGateway, type TransactionEvent } from '@/integrations/payment'
import type { ManualContributionInput, GenerateContributionsInput } from '@/lib/validation/contribution'

const MAX_OPTIMISTIC_RETRIES = 3

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
    contributionRepo.findMany(
      { userId },
      {
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      },
    ),
    contributionRepo.count({ userId }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getContribution(id: string, requesterId: string, roles: string[]) {
  const contribution = await contributionRepo.findById(id, {
    transactions: { orderBy: { createdAt: 'desc' } },
  })
  if (!contribution) throw new ContributionNotFoundError()
  assertCanAccess(contribution.userId, requesterId, roles)
  return contribution
}

export async function getContributionSummary(
  userId: string,
  requesterId: string,
  roles: string[],
) {
  assertCanAccess(userId, requesterId, roles)

  const cacheKey = userSummaryCacheKey(userId)
  const cached = await cache.get<ReturnType<typeof buildSummary>>(cacheKey)
  if (cached) return cached

  const currentYear = new Date().getFullYear()

  const [byStatus, totals, yearTotals] = await Promise.all([
    contributionRepo.groupBy({ userId }),
    contributionRepo.aggregate({ userId }, {
      _sum: { amountPaid: true },
      _count: { id: true },
    }),
    contributionRepo.aggregate({ userId, periodYear: currentYear }, {
      _sum: { amountPaid: true },
    }),
  ])

  const statusCounts = Object.fromEntries(
    byStatus.map((r) => [r.status, r._count.status]),
  )

  const summary = buildSummary(totals, yearTotals, statusCounts)
  await cache.set(cacheKey, summary, 180)
  return summary
}

function buildSummary(
  totals: { _sum: { amountPaid: unknown }; _count: { id: number } },
  yearTotals: { _sum: { amountPaid: unknown } },
  statusCounts: Record<string, number>,
) {
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

  const mandate = await mandateRepo.findActiveByUser(userId)
  if (!mandate?.netcashMandateId) {
    throw new MandateConflictError(
      'An active payment mandate is required to make a manual payment',
      'CTR_002',
    )
  }

  const dueDate = new Date(data.periodYear, data.periodMonth - 1, mandate.debitDay)
  let contribution = await contributionRepo.findByPeriod(
    userId,
    data.periodMonth,
    data.periodYear,
  )

  if (!contribution) {
    contribution = await contributionRepo.create({
      userId,
      periodMonth: data.periodMonth,
      periodYear: data.periodYear,
      amountDue: Number(mandate.amount),
      amountPaid: 0,
      dueDate,
      status: 'PENDING',
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

  if (data.amount < 0) {
    throw new ContributionConflictError('Payment amount must be positive', 'CTR_005')
  }

  const idempotencyKey = `manual:${userId}:${data.periodYear}-${data.periodMonth}:${randomUUID()}`

  const gatewayRes = await paymentGateway.submitOnceOffDebit({
    mandateId: mandate.netcashMandateId,
    amount: data.amount,
    reference: `XXM-${data.periodYear}-${String(data.periodMonth).padStart(2, '0')}`,
    idempotencyKey,
  })

  const txStatus: TransactionStatus =
    gatewayRes.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING'

  const transaction = await runTransaction(async (tx) => {
    const created = await transactionRepo.create(
      {
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
      tx,
    )

    if (txStatus === 'SUCCESS') {
      await recalculateContributionStatus(contribution.id, tx)
    }

    return created
  })

  await Promise.all([
    cache.del(CACHE_KEYS.DASHBOARD_STATS),
    invalidateContributionSummaryCache(userId),
  ])

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

  const receiptRef = `XXM-${transaction.id.slice(-8).toUpperCase()}`

  logger.info('Manual payment submitted', {
    userId,
    contributionId: contribution.id,
    amount: data.amount,
    gatewayStatus: gatewayRes.status,
    receiptRef,
  })

  return { contribution, transaction, receiptRef }
}

// ─── Status engine ─────────────────────────────────────────────────────────

function deriveContributionStatus(
  amountPaid: number,
  amountDue: number,
  dueDate: Date,
): ContributionStatus {
  if (amountPaid >= amountDue) return 'PAID'
  if (amountPaid > 0) return 'PARTIAL'
  if (new Date() > dueDate) return 'OVERDUE'
  return 'PENDING'
}

export async function recalculateContributionStatus(
  contributionId: string,
  tx: TxClient = db as unknown as TxClient,
) {
  for (let attempt = 1; attempt <= MAX_OPTIMISTIC_RETRIES; attempt++) {
    const [contribution, aggr] = await Promise.all([
      contributionRepo.findUniqueWithVersion(contributionId, tx),
      transactionRepo.aggregate({ contributionId, status: 'SUCCESS' }, tx),
    ])

    if (!contribution) return

    const newAmountPaid = Number(aggr._sum.amount ?? 0)
    const status = deriveContributionStatus(
      newAmountPaid,
      Number(contribution.amountDue),
      contribution.dueDate,
    )

    const updated = await contributionRepo.updateByVersion(
      contributionId,
      contribution.version,
      { amountPaid: newAmountPaid, status, version: contribution.version + 1 },
      tx,
    )

    if (updated.count > 0) return

    if (attempt < MAX_OPTIMISTIC_RETRIES) {
      logger.warn('Optimistic lock conflict on contribution, retrying', {
        contributionId,
        attempt,
      })
      continue
    }

    logger.error('Optimistic lock conflict exhausted retries', { contributionId })
    throw new Error('Concurrent modification detected on contribution — retries exhausted')
  }
}

// ─── Webhook: transaction settlement ──────────────────────────────────────

export async function processTransactionWebhook(event: TransactionEvent) {
  const transaction = await transactionRepo.findByGatewayRef(
    event.transactionRef,
    { contribution: { select: { userId: true } } },
  )

  if (!transaction) return

  const newStatus = paymentGateway.mapTransactionStatus(event.status)
  if (!newStatus) return

  const terminal: TransactionStatus[] = ['SUCCESS', 'REVERSED']
  if (terminal.includes(transaction.status as TransactionStatus)) return
  if (transaction.status === newStatus) return

  // Reject stale webhooks — if we have a processedAt that's newer than the event
  if (event.processedAt && transaction.processedAt) {
    const eventTime = new Date(event.processedAt)
    if (eventTime < transaction.processedAt) {
      logger.warn('Stale webhook rejected', {
        transactionId: transaction.id,
        eventTime: event.processedAt,
        existingTime: transaction.processedAt.toISOString(),
      })
      return
    }
  }

  await runTransaction(async (tx) => {
    await transactionRepo.update(
      transaction.id,
      {
        status: newStatus,
        processedAt: newStatus === 'SUCCESS' ? new Date() : null,
        gatewayResponse: event as unknown as Prisma.InputJsonValue,
      },
      tx,
    )

    await recalculateContributionStatus(transaction.contributionId, tx)
  })

  await Promise.all([
    cache.del(CACHE_KEYS.DASHBOARD_STATS),
    invalidateContributionSummaryCache(transaction.contribution.userId),
  ])

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

// ─── Transaction reversal ─────────────────────────────────────────────────

export async function createReversal(
  transactionId: string,
  adminId: string,
  adminRoles: string[],
  ip?: string,
) {
  assertAdmin(adminRoles)

  const original = await transactionRepo.findById(transactionId, {
    reversal: true,
  })

  if (!original) throw new TransactionNotFoundError()
  if (original.status !== 'SUCCESS') {
    throw new ContributionConflictError('Only successful transactions can be reversed', 'TXN_002')
  }
  if (original.reversal) {
    throw new ContributionConflictError('Transaction already has a reversal', 'TXN_003')
  }

  const idempotencyKey = `reversal:${transactionId}:${randomUUID()}`

  const reversal = await runTransaction(async (tx) => {
    const rev = await transactionRepo.create(
      {
        contributionId: original.contributionId,
        mandateId: original.mandateId,
        amount: original.amount,
        type: 'REVERSAL',
        status: 'SUCCESS',
        idempotencyKey,
        reversalOfId: original.id,
        processedAt: new Date(),
      },
      tx,
    )

    await transactionRepo.update(original.id, { status: 'REVERSED' }, tx)

    await recalculateContributionStatus(original.contributionId, tx)

    return rev
  })

  await cache.del(CACHE_KEYS.DASHBOARD_STATS)

  await writeAuditLog({
    userId: adminId,
    action: 'TRANSACTION_REVERSED',
    entity: 'Transaction',
    entityId: reversal.id,
    payload: {
      originalTransactionId: transactionId,
      contributionId: original.contributionId,
      amount: Number(original.amount),
    },
    ipAddress: ip,
  })

  logger.info('Transaction reversed', {
    reversalId: reversal.id,
    originalId: transactionId,
    amount: Number(original.amount),
  })

  return reversal
}

// ─── Overdue sweep ────────────────────────────────────────────────────────

export async function sweepOverdueContributions(): Promise<number> {
  const result = await contributionRepo.updateMany(
    { status: 'PENDING', dueDate: { lt: new Date() } },
    { status: 'OVERDUE' },
  )

  if (result.count > 0) {
    logger.info('Overdue sweep completed', { updated: result.count })
    await cache.del(CACHE_KEYS.DASHBOARD_STATS)
  }

  return result.count
}

// ─── Contribution summary with per-user caching ──────────────────────────

function userSummaryCacheKey(userId: string): string {
  return `xxm:cache:contrib-summary:${userId}`
}

export async function invalidateContributionSummaryCache(userId: string) {
  await cache.del(userSummaryCacheKey(userId))
}

// ─── Admin: generate monthly contribution records ──────────────────────────

export async function generateMonthlyContributions(
  data: GenerateContributionsInput,
  adminId: string | undefined,
  adminRoles: string[],
) {
  assertAdmin(adminRoles)

  const mandates = await mandateRepo.findAllActive({
    user: { select: { id: true, status: true } },
  })

  const eligible = mandates.filter((m) => m.user.status === 'ACTIVE')

  // Bulk-check for existing records in one query instead of N per-mandate lookups.
  const existing = await contributionRepo.findByUserIds(
    eligible.map((m) => m.userId),
    data.month,
    data.year,
    { userId: true },
  )
  const alreadyHas = new Set(existing.map((c) => c.userId))

  const toCreate = eligible.filter((m) => !alreadyHas.has(m.userId))

  if (toCreate.length > 0) {
    await contributionRepo.createMany(
      toCreate.map((m) => ({
        userId: m.userId,
        periodMonth: data.month,
        periodYear: data.year,
        amountDue: m.amount,
        amountPaid: 0,
        dueDate: new Date(data.year, data.month - 1, m.debitDay),
        status: 'PENDING' as const,
      })),
      true,
    )
  }

  const created = toCreate.length
  const skipped = eligible.length - toCreate.length

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
