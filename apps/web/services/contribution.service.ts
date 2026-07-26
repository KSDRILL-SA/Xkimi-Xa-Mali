import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import type { ContributionStatus, TransactionStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { contributionRepo, runTransaction, type TxClient } from '@/repositories/contribution.repository'
import { transactionRepo, SUCCESSFUL_INFLOW } from '@/repositories/transaction.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { budgetRepo } from '@/repositories/budget.repository'
import { writeAuditLog } from './audit.service'
import { checkBudget, recordBudgetOverride } from './budget.service'
import { syncPrimaryGoalProgress } from './goal.service'
import { logger } from '@xxm/observability'
import { cache, CACHE_KEYS } from '@/lib/cache'
import { tallyBy } from '@/lib/aggregate'
import { postPoolCredit, postPoolDebit } from './ledger.service'
import { inngest, InngestEvents } from '@/lib/inngest'
import {
  ContributionNotFoundError,
  ContributionConflictError,
  MandateConflictError,
  TransactionNotFoundError,
  BudgetExceededError,
} from '@/lib/errors'
import { assertCanAccess, assertAdmin } from '@/lib/authorization'
import { paymentGateway, type TransactionEvent } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { subtractZAR } from '@/lib/money'
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

  const [rawItems, total] = await Promise.all([
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

  type ContributionListItem = Prisma.ContributionGetPayload<{
    include: { transactions: true }
  }>
  const items = rawItems as ContributionListItem[]

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/** Most recent contributions for a user, for dashboard summaries. */
export async function getRecentContributions(userId: string, limit = 5) {
  return contributionRepo.findMany(
    { userId },
    { orderBy: [{ createdAt: 'desc' }], take: limit },
  )
}

type StatementPeriodRow = {
  periodMonth: number
  periodYear: number
  amountDue: unknown
  amountPaid: unknown
  status: string
}

/** All contribution periods for a user, for the statements list. */
export async function getStatementPeriods(userId: string, requesterId: string, roles: string[]) {
  assertCanAccess(userId, requesterId, roles)

  const items = await contributionRepo.findMany(
    { userId },
    {
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      select: { periodMonth: true, periodYear: true, amountDue: true, amountPaid: true, status: true },
    },
  )

  return (items as unknown as StatementPeriodRow[]).map((c) => ({
    periodMonth: c.periodMonth,
    periodYear: c.periodYear,
    amountDue: Number(c.amountDue),
    amountPaid: Number(c.amountPaid),
    status: c.status,
  }))
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
    contributionRepo.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    }),
    contributionRepo.aggregate({ userId }, {
      _sum: { amountPaid: true },
      _count: { id: true },
    }),
    contributionRepo.aggregate({ userId, periodYear: currentYear }, {
      _sum: { amountPaid: true },
    }),
  ])

  const statusCounts = tallyBy(byStatus, (r) => r.status, 'status')

  const summary = buildSummary(
    totals as Parameters<typeof buildSummary>[0],
    yearTotals as Parameters<typeof buildSummary>[1],
    statusCounts,
  )
  await cache.set(cacheKey, summary, 180)
  return summary
}

function buildSummary(
  totals: { _sum?: { amountPaid: unknown }; _count: { id: number } },
  yearTotals: { _sum?: { amountPaid: unknown } },
  statusCounts: Record<string, number>,
) {
  return {
    totalPaid: Number(totals._sum?.amountPaid ?? 0),
    yearlyPaid: Number(yearTotals._sum?.amountPaid ?? 0),
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

  const remaining = subtractZAR(Number(contribution.amountDue), Number(contribution.amountPaid))
  if (data.amount > remaining + 0.01) {
    throw new ContributionConflictError(
      `Amount exceeds remaining balance of R${remaining.toFixed(2)}`,
      'CTR_004',
    )
  }

  if (data.amount < 0) {
    throw new ContributionConflictError('Payment amount must be positive', 'CTR_005')
  }

  const budgetCheck = await checkBudget(userId, data.amount)

  if (budgetCheck.status === 'OVER_BUDGET') {
    if (!data.budgetOverrideConfirmed) {
      throw new BudgetExceededError({
        budget: budgetCheck.budget,
        alreadyContributed: budgetCheck.alreadyContributed,
        remaining: budgetCheck.remaining,
        overage: budgetCheck.overage,
      })
    }

    const activeBudget = await budgetRepo.findActiveByType(userId, 'MONTHLY')
    if (activeBudget) {
      await recordBudgetOverride(
        userId,
        activeBudget.id,
        contribution.id,
        {
          attemptedAmount: data.amount,
          budgetAmount: budgetCheck.budget,
          overageAmount: budgetCheck.overage,
        },
        data.budgetOverrideReason,
      )
    }
  }

  const idempotencyKey = `manual:${userId}:${data.periodYear}-${data.periodMonth}:${randomUUID()}`

  // Debit the contribution PLUS the Netcash fee buffer so the group nets the
  // full contribution; the transaction/contribution stay at data.amount.
  const gatewayRes = await paymentGateway.submitOnceOffDebit({
    mandateId: mandate.netcashMandateId,
    amount: debitAmountWithFee(data.amount),
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

  // Reflect this payment in the primary fund's progress right away (best-effort).
  await syncPrimaryGoalProgress().catch((err) =>
    logger.error('Primary goal sync failed after manual payment', { error: err instanceof Error ? err.message : String(err) }),
  )

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
      transactionRepo.aggregate({ contributionId, ...SUCCESSFUL_INFLOW }, tx),
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

    if (updated.count > 0) {
      if (status === 'PAID' || status === 'OVERDUE') {
        await inngest.send({
          name: InngestEvents.CONTRIBUTION_STATUS_CHANGED,
          data: { userId: contribution.userId, contributionId, status },
        }).catch((err) => {
          logger.error('Failed to send contribution.status.changed event', {
            contributionId,
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
      return
    }

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
  const transaction = (await transactionRepo.findByGatewayRef(
    event.transactionRef,
    { contribution: { select: { userId: true } } },
  )) as Prisma.TransactionGetPayload<{
    include: { contribution: { select: { userId: true } } }
  }> | null

  if (!transaction?.contribution) return

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
    cache.del(CACHE_KEYS.DASHBOARD_STATS).catch(() => {}),
    invalidateContributionSummaryCache(transaction.contribution.userId).catch(() => {}),
  ])

  // A settlement or reversal moved the paid total — keep the primary fund in step.
  await syncPrimaryGoalProgress().catch((err) =>
    logger.error('Primary goal sync failed after transaction webhook', { error: err instanceof Error ? err.message : String(err) }),
  )

  // Append to the immutable pool ledger. Idempotent + best-effort: a ledger
  // hiccup must never affect payment processing, and the reconciler backstops it.
  if (newStatus === 'SUCCESS') {
    await postPoolCredit({
      refType: 'TRANSACTION', refId: transaction.id, amount: Number(transaction.amount),
      memberId: transaction.contribution.userId, description: 'Contribution received',
    }).catch((err) => logger.error('Ledger credit post failed', { transactionId: transaction.id, error: err instanceof Error ? err.message : String(err) }))
  } else if (newStatus === 'REVERSED') {
    await postPoolDebit({
      refType: 'TRANSACTION', refId: transaction.id, amount: Number(transaction.amount),
      memberId: transaction.contribution.userId, description: 'Contribution reversed',
    }).catch((err) => logger.error('Ledger debit post failed', { transactionId: transaction.id, error: err instanceof Error ? err.message : String(err) }))
  }

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
    contribution: { select: { userId: true } },
  }) as Prisma.TransactionGetPayload<{
    include: { reversal: true; contribution: { select: { userId: true } } }
  }> | null

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

  // Back the reversed money out of the immutable pool ledger immediately, rather
  // than waiting for the nightly reconciler. Idempotent (unique refType+refId+
  // direction) and best-effort — mirrors the webhook REVERSED path and keys on
  // the original transaction id so the two never double-post.
  await postPoolDebit({
    refType: 'TRANSACTION', refId: original.id, amount: Number(original.amount),
    memberId: original.contribution?.userId ?? null, description: 'Contribution reversed',
  }).catch((err) => logger.error('Ledger debit post failed on reversal', {
    transactionId: original.id, error: err instanceof Error ? err.message : String(err),
  }))

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

// ─── Early-payment reminder selection ────────────────────────────────────────

export type DueSoonContribution = {
  status: string
  dueDate: Date
  user: { status: string }
}

/**
 * Of the given contributions, the ones an active member should be nudged to pay
 * early — still unpaid (PENDING/PARTIAL) and falling due within the next
 * `leadDays`, but not yet due/overdue. A single well-timed reminder inside this
 * window (throttled by the caller) is the whole point: encourage an early,
 * badge-boosting payment before the automatic debit, without daily spam. Pure
 * and side-effect free.
 */
export function selectDueSoonReminders<T extends DueSoonContribution>(
  contributions: ReadonlyArray<T>,
  now: Date,
  leadDays: number,
): T[] {
  const horizon = new Date(now.getTime() + leadDays * 24 * 60 * 60 * 1000)
  return contributions.filter(
    (c) =>
      (c.status === 'PENDING' || c.status === 'PARTIAL') &&
      c.user.status === 'ACTIVE' &&
      c.dueDate >= now &&
      c.dueDate <= horizon,
  )
}

// ─── Contribution summary with per-user caching ──────────────────────────

function userSummaryCacheKey(userId: string): string {
  return `xxm:cache:contrib-summary:${userId}`
}

export async function invalidateContributionSummaryCache(userId: string) {
  // Also clear the member's dashboard insights — their streak, forecast and
  // consistency stats all move when a contribution/payment does.
  await cache.del(userSummaryCacheKey(userId), CACHE_KEYS.memberInsights(userId))
}

// ─── Admin: generate monthly contribution records ──────────────────────────

export async function generateMonthlyContributions(
  data: GenerateContributionsInput,
  adminId: string | undefined,
  adminRoles: string[],
) {
  assertAdmin(adminRoles)

  type ActiveMandateWithUser = Prisma.PaymentMandateGetPayload<{
    include: { user: { select: { id: true; status: true } } }
  }>

  const mandates = (await mandateRepo.findAllActive({
    user: { select: { id: true, status: true } },
  })) as ActiveMandateWithUser[]

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

/**
 * Of the given contributions, those that already have an early-payment reminder
 * on record.
 *
 * The notification row is the evidence a reminder was sent, so it is what the
 * job throttles on. Previously that was a Redis key, which failed open whenever
 * Upstash was not configured — the no-op cache always reads as "nothing here",
 * so the same member was reminded on every run of the window.
 *
 * One query for the whole batch: the reminder job runs over everyone falling due
 * that day, so a per-contribution lookup would be the shape #253 removed.
 */
/**
 * Of the given contributions, those already notified with `slug` — optionally
 * only counting notifications sent since `since`.
 *
 * The notification row is the evidence a message went out, so it is what the
 * reminder jobs throttle on. Both of them previously used a Redis key, and the
 * cache client is a no-op shim whenever Upstash is not configured: its get()
 * always returns null, so every run read "not sent yet" and sent again.
 *
 * Omit `since` for a message that should go out once ever, as with the
 * early-payment reminder. Pass it for one that should repeat on a cadence, as
 * with the overdue reminder — a contribution stays overdue until it is paid, and
 * without a window a member already behind would be messaged every single day.
 *
 * One query for the whole batch, matched inside the database rather than
 * fetching every notification ever sent and filtering here.
 */
export async function findNotifiedContributionIds(
  slug: string,
  contributionIds: readonly string[],
  since?: Date,
): Promise<string[]> {
  if (contributionIds.length === 0) return []

  const rows = since
    ? await db.$queryRaw<Array<{ contributionId: string }>>`
        SELECT DISTINCT n.payload->>'contributionId' AS "contributionId"
        FROM notifications n
        JOIN notification_templates t ON t.id = n."templateId"
        WHERE t.slug = ${slug}
          AND n."createdAt" >= ${since}
          AND n.payload->>'contributionId' = ANY(${contributionIds as string[]})
      `
    : await db.$queryRaw<Array<{ contributionId: string }>>`
        SELECT DISTINCT n.payload->>'contributionId' AS "contributionId"
        FROM notifications n
        JOIN notification_templates t ON t.id = n."templateId"
        WHERE t.slug = ${slug}
          AND n.payload->>'contributionId' = ANY(${contributionIds as string[]})
      `

  return rows.map((r) => r.contributionId)
}

/** Contributions that already had their one early-payment reminder. */
export async function findRemindedContributionIds(
  contributionIds: readonly string[],
): Promise<string[]> {
  return findNotifiedContributionIds('contribution-due-reminder', contributionIds)
}
