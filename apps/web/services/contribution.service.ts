import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import type { ContributionStatus, TransactionStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { writeAuditLog } from './audit.service'
import { submitOnceOffDebit, mapNetcashTransactionStatus } from '@/lib/netcash'
import type { ManualContributionInput, GenerateContributionsInput } from '@/lib/validation/contribution'
import type { NetcashTransactionEvent } from '@/lib/netcash'

// ─── Domain errors ─────────────────────────────────────────────────────────

class NotFoundError extends Error {
  code = 'CTR_001'
  status = 404
}
class ForbiddenError extends Error {
  code = 'SYS_003'
  status = 403
}
class ConflictError extends Error {
  status = 409
  constructor(message: string, public code: string) {
    super(message)
  }
}

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
  if (!contribution) throw new NotFoundError('Contribution not found')
  assertCanAccess(contribution.userId, requesterId, roles)
  return contribution
}

export async function getContributionSummary(
  userId: string,
  requesterId: string,
  roles: string[],
) {
  assertCanAccess(userId, requesterId, roles)

  const contributions = await db.contribution.findMany({ where: { userId } })
  const currentYear = new Date().getFullYear()

  const totalPaid = contributions.reduce((sum, c) => sum + Number(c.amountPaid), 0)
  const yearlyPaid = contributions
    .filter((c) => c.periodYear === currentYear)
    .reduce((sum, c) => sum + Number(c.amountPaid), 0)

  return {
    totalPaid,
    yearlyPaid,
    totalContributions: contributions.length,
    paid: contributions.filter((c) => c.status === 'PAID').length,
    partial: contributions.filter((c) => c.status === 'PARTIAL').length,
    pending: contributions.filter((c) => c.status === 'PENDING').length,
    overdue: contributions.filter((c) => c.status === 'OVERDUE').length,
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

  // Manual payments are debited via the member's active mandate authorization
  const mandate = await db.paymentMandate.findFirst({
    where: { userId, status: 'ACTIVE' },
  })
  if (!mandate?.netcashMandateId) {
    throw new ConflictError(
      'An active payment mandate is required to make a manual payment',
      'CTR_002',
    )
  }

  // Find or create the contribution record for this period
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
    throw new ConflictError('This period is already fully paid', 'CTR_003')
  }

  const remaining = Number(contribution.amountDue) - Number(contribution.amountPaid)
  if (data.amount > remaining + 0.01) {
    throw new ConflictError(
      `Amount exceeds remaining balance of R${remaining.toFixed(2)}`,
      'CTR_004',
    )
  }

  // Idempotency key per payment attempt — prevents duplicate Netcash charges on retry
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

  // If Netcash confirms immediately, update the ledger now.
  // Otherwise the transaction webhook (M06) will settle it later.
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

  return { contribution, transaction }
}

// ─── Status engine ─────────────────────────────────────────────────────────

// Derives contribution status from the sum of all SUCCESS transactions.
// Always called after a transaction status change so the ledger stays consistent.
export async function recalculateContributionStatus(contributionId: string) {
  const [contribution, successTxs] = await Promise.all([
    db.contribution.findUnique({ where: { id: contributionId } }),
    db.transaction.findMany({
      where: { contributionId, status: 'SUCCESS' },
    }),
  ])

  if (!contribution) return

  const newAmountPaid = successTxs.reduce((sum, t) => sum + Number(t.amount), 0)
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

  if (!transaction) return // unknown ref — no-op

  const newStatus = mapNetcashTransactionStatus(event.status)
  if (!newStatus) return // unrecognised status — ignore

  // Terminal states are never overwritten; identical status is a no-op
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

  // Re-derive the contribution ledger from the updated transaction set
  await recalculateContributionStatus(transaction.contributionId)

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
  adminId: string,
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

    if (existing) {
      skipped++
      continue
    }

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
