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
import { queueNotification } from './notification.service'
import { env } from '@/lib/env'
import { inngest, InngestEvents } from '@/lib/inngest'
import {
  ContributionNotFoundError,
  ContributionConflictError,
  MandateConflictError,
  MemberNotFoundError,
  TransactionNotFoundError,
  BudgetExceededError,
} from '@/lib/errors'
import { assertCanAccess, assertAdmin } from '@/lib/authorization'
import { toTransactionStatus } from '@/lib/transaction-status'
import { paymentGateway, type TransactionEvent } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { subtractZAR } from '@/lib/money'
import type { ManualContributionInput, GenerateContributionsInput, OfflineContributionInput } from '@/lib/validation/contribution'
import { MIN_CONTRIBUTION_ZAR } from '@xxm/utils'

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

  // `ManualContributionSchema` only rejects a non-positive amount — it has no
  // way to know what's actually still owed. The real R100 minimum belongs
  // here, capped at whatever remains: a fresh R450 period still needs at
  // least R100 to start, but a period with R60 left after an earlier partial
  // payment needs to accept exactly R60, or that R60 could never be paid off
  // by any amount at all (below R100 fails the minimum, above R60 fails the
  // remaining-balance check above) — the exact bug this guards against.
  const minimumPayment = Math.min(MIN_CONTRIBUTION_ZAR, remaining)
  if (data.amount < minimumPayment - 0.01) {
    throw new ContributionConflictError(
      `Minimum payment is R${minimumPayment.toFixed(2)}`,
      'CTR_006',
    )
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

  // The key the member's *intent* maps to.
  //
  // This was `...:${randomUUID()}` — unique on every request, so the column
  // named `idempotencyKey` provided no idempotency at all and the unique index
  // on it could never fire. A double tap, a retried request or a browser
  // back-and-resubmit each produced a second real debit off the member's
  // account, bounded only by the five-per-hour limiter.
  //
  // It cannot be derived from the period the way the debit run's is, because a
  // member may legitimately pay twice in one month — a partial now, the balance
  // later. So the client supplies one token per payment it is offering to make,
  // and the same intent submitted twice collapses onto one debit while a second,
  // deliberate payment carries a new token and goes through.
  //
  // `userId` stays in the key, so a token chosen by one member can never
  // collide with another's.
  const clientToken = data.idempotencyKey ?? randomUUID()
  const idempotencyKey = `manual:${userId}:${data.periodYear}-${data.periodMonth}:${clientToken}`

  if (!data.idempotencyKey) {
    // Not fatal — the payment is still correct, it is simply unprotected against
    // a duplicate submission. Logged so a caller that has not been updated is
    // visible rather than quietly less safe than the others.
    logger.warn('Manual payment submitted without an idempotency token', { userId })
  }

  // Claim before submitting, never after.
  //
  // The old order called the gateway first and wrote second, so two concurrent
  // submissions produced two debits and only then collided on the unique
  // column — by which point the member's account had been hit twice and the
  // error came too late to prevent anything. This mirrors the debit run:
  // check what already exists, claim, then submit.
  const existing = await transactionRepo.findByIdempotencyKey(idempotencyKey)
  if (existing) {
    logger.info('Manual payment already submitted under this token — returning the first result', {
      userId, idempotencyKey, transactionId: existing.id,
    })
    return {
      contribution,
      transaction: existing,
      receiptRef: `XXM-${existing.id.slice(-8).toUpperCase()}`,
      status: existing.status,
      duplicate: true as const,
    }
  }

  // Debit the contribution PLUS the Netcash fee buffer so the group nets the
  // full contribution; the transaction/contribution stay at data.amount.
  const gatewayRes = await paymentGateway.submitOnceOffDebit({
    mandateId: mandate.netcashMandateId,
    amount: debitAmountWithFee(data.amount),
    reference: `XXM-${data.periodYear}-${String(data.periodMonth).padStart(2, '0')}`,
    idempotencyKey,
  })

  // The gateway answers with three outcomes and this collapsed them into two,
  // writing every non-success as PENDING. It is the fourth copy of the defect
  // recorded in §4.6 — debit-run, transaction-retry-failed and
  // mandate-delay-handler each had it, each was fixed, and this path was never
  // looked at, because it is not a job.
  //
  // What it cost here is worse than in the jobs, because a person is watching.
  // A decline was written as PENDING, so: the member was told "Payment
  // submitted"; the row sat waiting on a webhook that was never coming, because
  // the bank had already refused; `transaction-retry-failed` queries
  // `status: 'FAILED'` and so never picked it up; the contribution was never
  // settled; and no payment-failed message was sent, because those are keyed off
  // FAILED too. The member believed they had paid and nothing ever contradicted
  // them.
  const txStatus: TransactionStatus = toTransactionStatus(gatewayRes.status)

  const written = await runTransaction(async (tx) => {
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

    const change =
      txStatus === 'SUCCESS' ? await recalculateContributionStatus(contribution.id, tx) : null

    return { created, change }
  })

  const { created: transaction, change: statusChange } = written

  // After the commit, never inside it. See recalculateContributionStatus.
  if (statusChange) await emitContributionStatusChange(statusChange)

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

  // `status` is returned so the caller can tell the member what actually
  // happened. Without it the page had only "the request did not throw", which
  // it rendered as "Payment submitted!" — the same screen for a collection the
  // bank accepted and one it refused.
  return { contribution, transaction, receiptRef, status: txStatus }
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

/** A status change worth telling the rest of the system about. */
export type ContributionStatusChange = {
  userId: string
  contributionId: string
  status: string
}

/**
 * Announce a contribution status change.
 *
 * Separate from the recalculation because it is a network call, and a network
 * call has no business inside a database transaction — see
 * {@link recalculateContributionStatus}.
 */
export async function emitContributionStatusChange(change: ContributionStatusChange): Promise<void> {
  await inngest
    .send({ name: InngestEvents.CONTRIBUTION_STATUS_CHANGED, data: change })
    .catch((err) => {
      logger.error('Failed to send contribution.status.changed event', {
        contributionId: change.contributionId,
        error: err instanceof Error ? err.message : String(err),
      })
    })
}

/**
 * Re-derive a contribution's paid total and status from its settled inflows.
 *
 * **Returns the status change rather than always announcing it.** This used to
 * `await inngest.send(...)` inline, and four of its callers run it inside a
 * database transaction — so an HTTP round trip to Inngest sat in the middle of
 * an interactive transaction whose timeout is five seconds.
 *
 * That is not a theoretical cost. With the event key unset the call took just
 * under six seconds to fail, the transaction expired, and the whole write rolled
 * back — *after* `submitManualPayment` had already charged the member at the
 * gateway. Money left the account and no transaction row existed to show for
 * it, and because the idempotency key is written in that same rolled-back
 * transaction, the member's retry would have charged them a second time.
 *
 * So: when this owns the connection it announces the change itself. When it is
 * handed a caller's transaction it returns the change and the caller announces
 * it after the commit, where a slow third party can cost time but not money.
 */
export async function recalculateContributionStatus(
  contributionId: string,
  tx?: TxClient,
): Promise<ContributionStatusChange | null> {
  const client = tx ?? (db as unknown as TxClient)
  for (let attempt = 1; attempt <= MAX_OPTIMISTIC_RETRIES; attempt++) {
    const [contribution, aggr] = await Promise.all([
      contributionRepo.findUniqueWithVersion(contributionId, client),
      transactionRepo.aggregate({ contributionId, ...SUCCESSFUL_INFLOW }, client),
    ])

    if (!contribution) return null

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
      client,
    )

    if (updated.count > 0) {
      const change =
        status === 'PAID' || status === 'OVERDUE'
          ? { userId: contribution.userId, contributionId, status }
          : null

      // Announced here only when this owns the connection. Inside a caller's
      // transaction the change is handed back, to be announced after commit.
      if (change && !tx) await emitContributionStatusChange(change)
      return change
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

  // Unreachable: the final attempt above either returns or throws. Stated so
  // the signature can promise a change-or-null rather than allowing undefined.
  return null
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

  const settledChange = await runTransaction(async (tx) => {
    // Conditional on the status this function read a moment ago, not a blind
    // overwrite — see updateIfStatus. A concurrent delivery that read the
    // same pre-update status loses this compare-and-swap and does none of
    // the downstream work below, instead of both proceeding to double-post
    // the ledger credit.
    const claimed = await transactionRepo.updateIfStatus(
      transaction.id,
      transaction.status,
      {
        status: newStatus,
        processedAt: newStatus === 'SUCCESS' ? new Date() : null,
        gatewayResponse: event as unknown as Prisma.InputJsonValue,
      },
      tx,
    )
    // undefined ("lost the race") is deliberately distinct from null, which
    // recalculateContributionStatus already returns for its own legitimate
    // reasons (e.g. nothing about the contribution's status actually
    // changed) — collapsing the two would skip this function's own
    // still-correct downstream ledger posting on every ordinary no-change
    // webhook, not only on a genuine race loss.
    if (claimed.count === 0) return undefined

    return recalculateContributionStatus(transaction.contributionId, tx)
  })

  if (settledChange === undefined) {
    logger.info('Transaction webhook lost the concurrent update race — a parallel delivery already applied it', {
      transactionId: transaction.id,
      transactionRef: event.transactionRef,
    })
    return
  }

  // After the commit, never inside it. See recalculateContributionStatus.
  if (settledChange) await emitContributionStatusChange(settledChange)

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
  reason: string,
  ip?: string | null,
) {
  assertAdmin(adminRoles)

  // The route validates this, but the service is the thing that writes the row
  // and a second caller must not be able to record an unexplained reversal.
  // "A mistake is never quietly deleted" is only true if the correction says
  // what the mistake was.
  const trimmedReason = reason?.trim() ?? ''
  if (trimmedReason.length < 10) {
    throw new ContributionConflictError('A reversal requires a stated reason', 'TXN_004')
  }

  const original = await transactionRepo.findById(transactionId, {
    reversal: true,
    contribution: {
      select: {
        userId: true,
        periodMonth: true,
        periodYear: true,
        user: { select: { firstName: true } },
      },
    },
  }) as Prisma.TransactionGetPayload<{
    include: {
      reversal: true
      contribution: {
        select: {
          userId: true
          periodMonth: true
          periodYear: true
          user: { select: { firstName: true } }
        }
      }
    }
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
        // On the reversing entry, not on the original. The original is the
        // record of what was believed to have happened and is not edited —
        // that is the whole point of correcting by addition.
        reversalReason: trimmedReason,
        processedAt: new Date(),
      },
      tx,
    )

    await transactionRepo.update(original.id, { status: 'REVERSED' }, tx)

    const change = await recalculateContributionStatus(original.contributionId, tx)

    return { rev, change }
  })

  const { rev: reversalTx, change: reversalChange } = reversal

  // After the commit, never inside it. See recalculateContributionStatus.
  if (reversalChange) await emitContributionStatusChange(reversalChange)

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

  // Tell the member. A reversal changes what they were already told they had
  // paid, and until now this happened in silence: the money went back, the
  // contribution status was recalculated, and the only written trace was an
  // audit entry no member can read.
  //
  // Both slugs are in MANDATORY_SLUGS, so this reaches a member who has
  // notifications switched off. Best-effort by the same rule as the ledger post
  // above — the money has already moved correctly and a messaging outage must
  // not undo it — but it is logged rather than swallowed.
  const period = original.contribution
    ? `${String(original.contribution.periodMonth).padStart(2, '0')}/${original.contribution.periodYear}`
    : ''
  const notifyPayload = {
    firstName: original.contribution?.user?.firstName ?? '',
    amount: Number(original.amount).toString(),
    period,
    reason: trimmedReason,
    url: `${env.NEXTAUTH_URL ?? ''}/dashboard/transactions`,
  }

  if (original.contribution?.userId) {
    const memberId = original.contribution.userId
    await Promise.all([
      queueNotification({
        userId: memberId, templateSlug: 'contribution-reversed-sms',
        channel: 'SMS', payload: notifyPayload,
      }),
      queueNotification({
        userId: memberId, templateSlug: 'contribution-reversed-email',
        channel: 'EMAIL', payload: notifyPayload,
      }),
    ]).catch((err) => logger.error('Reversal notification failed', {
      transactionId: original.id,
      userId: memberId,
      error: err instanceof Error ? err.message : String(err),
    }))
  }

  await writeAuditLog({
    userId: adminId,
    action: 'TRANSACTION_REVERSED',
    entity: 'Transaction',
    entityId: reversalTx.id,
    payload: {
      originalTransactionId: transactionId,
      contributionId: original.contributionId,
      amount: Number(original.amount),
      reason: trimmedReason,
    },
    ipAddress: ip ?? undefined,
  })

  logger.info('Transaction reversed', {
    reversalId: reversalTx.id,
    originalId: transactionId,
    amount: Number(original.amount),
  })

  return reversalTx
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

// ─── Admin: record an offline (cash / EFT) contribution ────────────────────

/**
 * Record money that reached the group's bank account without the gateway.
 *
 * Netcash declined the DebiCheck application — their processing bank requires
 * an applicant to already hold an active debit-order base, which a new stokvel
 * by definition cannot. Members have been paying by EFT since June 2026
 * regardless, and none of it could be recorded: every payment path here
 * required a gateway mandate, and `generateMonthlyContributions` only raises a
 * period for members who have one. So those months exist in the bank statement
 * and nowhere in this system.
 *
 * This is the way in. It is deliberately NOT `submitManualPayment` with the
 * gateway call removed — that function charges a member, this one writes down
 * that a member already paid. The differences are the whole point:
 *
 *   - No gateway, no mandate. `mandateId` is null (see the schema note), and
 *     `type` is OFFLINE rather than MANUAL so the ledger stays readable: MANUAL
 *     means "the member pressed pay and we submitted it", and conflating the
 *     two would leave nobody able to tell which rows ever touched a provider.
 *   - The transaction is written SUCCESS immediately. There is no settlement to
 *     wait for; the money is already in the account, which is why an admin is
 *     recording it.
 *   - It creates the period if none exists. That is the June–August backlog
 *     case, and refusing would make the feature useless for the exact situation
 *     it was built for.
 *   - No budget check. `submitManualPayment` runs one because a member spending
 *     money can exceed what they set aside; writing down money that has already
 *     moved cannot.
 *
 * What it shares with every other payment path is the part that must not fork:
 * `recalculateContributionStatus` derives amountPaid and PENDING/PARTIAL/PAID
 * from the transaction rows, so an offline payment settles a period by exactly
 * the same rule as a gateway one, and the debit run's "already PAID, skip" and
 * outstanding-balance logic both see it without knowing it exists.
 */
export async function recordOfflineContribution(
  data: OfflineContributionInput,
  adminId: string,
  adminRoles: string[],
  ip?: string,
) {
  assertAdmin(adminRoles)

  const member = await db.user.findUnique({
    where: { id: data.userId },
    select: { id: true, status: true, firstName: true },
  })
  if (!member) throw new MemberNotFoundError()

  // RESIGNED and SUSPENDED members are deliberately allowed. Money that arrived
  // is a fact about the past, and the commonest reason to record a late payment
  // is settling up with somebody on their way out. Refusing would leave real
  // money unrecordable for the members most likely to need the record.

  // One offline payment per bank reference. The reference identifies a specific
  // real-world payment, so recording it twice is either a double-submitted form
  // or two admins capturing the same statement line — and the second would
  // silently double the member's paid balance and mark a period settled that is
  // not. Scoped by member and period so an unimaginative reference ("EFT") on
  // two genuinely different payments is not blocked.
  const idempotencyKey = `offline:${data.userId}:${data.periodYear}-${String(data.periodMonth).padStart(2, '0')}:${data.reference.toLowerCase()}`

  const duplicate = await transactionRepo.findByIdempotencyKey(idempotencyKey)
  if (duplicate) {
    throw new ContributionConflictError(
      `A payment with reference "${data.reference}" is already recorded for this member and period`,
      'CTB_004',
    )
  }

  // Find or raise the period.
  //
  // `amountDue` on a new period, in order of authority:
  //
  //   1. the member's active mandate, when they have one — that is the
  //      obligation they actually agreed to, and an admin recording a payment
  //      has no business restating it;
  //   2. an explicit `amountDue` from the admin, for a member with no mandate,
  //      where the system holds no record of what was owed;
  //   3. the amount received.
  //
  // The third is a last resort and its consequence is worth being explicit
  // about: a period created owing exactly what arrived is settled in full by
  // that payment. For a member with no mandate — which is precisely who this
  // feature is for — a part payment would otherwise mark them up to date.
  // Somebody who owed R500 and paid R200 would read as settled. That is what
  // (2) exists to prevent, and why the form asks.
  let contribution = await contributionRepo.findByPeriod(data.userId, data.periodMonth, data.periodYear)

  if (!contribution) {
    const mandate = await mandateRepo.findFirst({ userId: data.userId, status: 'ACTIVE' })
    const amountDue = mandate ? Number(mandate.amount) : (data.amountDue ?? data.amount)
    const debitDay = mandate?.debitDay ?? 1

    contribution = await contributionRepo.create({
      userId: data.userId,
      periodMonth: data.periodMonth,
      periodYear: data.periodYear,
      amountDue,
      amountPaid: 0,
      dueDate: new Date(data.periodYear, data.periodMonth - 1, debitDay),
      status: 'PENDING',
    })

    logger.info('Offline payment raised a contribution period that did not exist', {
      userId: data.userId,
      period: `${data.periodYear}-${data.periodMonth}`,
      amountDue,
      derivedFrom: mandate
        ? 'mandate'
        : data.amountDue !== undefined
          ? 'admin-stated'
          : 'payment amount',
    })
  }

  const periodContribution = contribution

  const written = await runTransaction(async (tx) => {
    const created = await transactionRepo.create(
      {
        contributionId: periodContribution.id,
        // Null, not a placeholder. Faking a mandate would need a bank account
        // beneath it — inventing banking details for somebody who handed over
        // cash and never supplied any.
        mandateId: null,
        amount: data.amount,
        type: 'OFFLINE',
        // SUCCESS on write: the money is already in the account. There is no
        // webhook coming to confirm it, so anything else would leave the row
        // waiting forever for a settlement that already happened.
        status: 'SUCCESS',
        idempotencyKey,
        offlineReference: data.reference,
        recordedById: adminId,
        processedAt: data.receivedAt,
      },
      tx,
    )

    const change = await recalculateContributionStatus(periodContribution.id, tx)
    return { created, change }
  })

  const { created: transaction, change: statusChange } = written

  // After the commit, never inside it — same reason as every other payment
  // path: the announcement is an HTTP call and the transaction has a timeout.
  if (statusChange) await emitContributionStatusChange(statusChange)

  await Promise.all([
    cache.del(CACHE_KEYS.DASHBOARD_STATS),
    invalidateContributionSummaryCache(data.userId),
  ])

  await syncPrimaryGoalProgress().catch((err) =>
    logger.error('Primary goal sync failed after an offline payment', {
      error: err instanceof Error ? err.message : String(err),
    }),
  )

  await writeAuditLog({
    userId: adminId,
    action: 'OFFLINE_PAYMENT_RECORDED',
    entity: 'Transaction',
    entityId: transaction.id,
    payload: {
      memberId: data.userId,
      contributionId: periodContribution.id,
      periodMonth: data.periodMonth,
      periodYear: data.periodYear,
      amount: data.amount,
      amountDue: data.amountDue ?? null,
      reference: data.reference,
      receivedAt: data.receivedAt.toISOString(),
      note: data.note ?? null,
    } as Prisma.InputJsonValue,
    ipAddress: ip,
  })

  logger.info('Offline payment recorded', {
    adminId,
    memberId: data.userId,
    contributionId: periodContribution.id,
    amount: data.amount,
    period: `${data.periodYear}-${data.periodMonth}`,
  })

  return {
    transactionId: transaction.id,
    contributionId: periodContribution.id,
    receiptRef: `XXM-OFF-${transaction.id.slice(-8).toUpperCase()}`,
  }
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
