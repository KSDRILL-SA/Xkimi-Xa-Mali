import { decrypt } from '@/lib/encryption'
import { writeAuditLog } from './audit.service'
import {
  MandateNotFoundError,
  MandateConflictError,
  BankAccountNotFoundError,
  isUniqueViolation,
} from '@/lib/errors'
import { assertCanAccess } from '@/lib/authorization'
import {
  paymentGateway,
  type WebhookEvent,
  type AccountType as GatewayAccountType,
} from '@/integrations/payment'
import type { CreateMandateInput, UpdateMandateInput, DelayMandateInput } from '@/lib/validation/mandate'
import type { MandateStatus, AccountType, Prisma } from '@prisma/client'
import { inngest, InngestEvents } from '@/lib/inngest'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { mandateRepo } from '@/repositories/mandate.repository'
import { bankAccountRepo } from '@/repositories/bank-account.repository'

const mandateBankInclude = {
  bankAccount: {
    select: { bankName: true, accountNumber: true, accountType: true, branchCode: true },
  },
} as const

type MandateWithBank = Prisma.PaymentMandateGetPayload<{
  include: typeof mandateBankInclude
}>

type BankAccountWithUser = Prisma.BankAccountGetPayload<{
  include: { user: { select: { firstName: true; lastName: true; idNumber: true } } }
}>

// ─── Queries ───────────────────────────────────────────────────────────────

export async function getMandates(userId: string, requesterId: string, requesterRoles: string[]) {
  assertCanAccess(userId, requesterId, requesterRoles)

  const mandates = (await mandateRepo.findByUser(userId, {
    orderBy: { createdAt: 'desc' },
    include: mandateBankInclude,
  })) as MandateWithBank[]

  // Mask encrypted account numbers before returning
  return mandates.map((m) => ({
    ...m,
    bankAccount: {
      ...m.bankAccount,
      accountNumberMasked: maskBankAccount(m.bankAccount.accountNumber),
      accountNumber: undefined,
    },
  }))
}

export async function getMandate(mandateId: string, requesterId: string, requesterRoles: string[]) {
  const mandate = (await mandateRepo.findById(mandateId, mandateBankInclude)) as MandateWithBank | null

  if (!mandate) throw new MandateNotFoundError()
  assertCanAccess(mandate.userId, requesterId, requesterRoles)

  return {
    ...mandate,
    bankAccount: {
      ...mandate.bankAccount,
      accountNumberMasked: maskBankAccount(mandate.bankAccount.accountNumber),
      accountNumber: undefined,
    },
  }
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function createMandate(
  userId: string,
  data: CreateMandateInput,
  requesterId: string,
  requesterRoles: string[],
  ipAddress?: string,
) {
  assertCanAccess(userId, requesterId, requesterRoles)

  const existingActive = await mandateRepo.findFirst({
    userId, status: { in: ['PENDING', 'ACTIVE'] },
  })
  if (existingActive) {
    throw new MandateConflictError('An active or pending mandate already exists', 'MND_002')
  }

  const bankAccount = (await bankAccountRepo.findById(data.bankAccountId, {
    user: { select: { firstName: true, lastName: true, idNumber: true } },
  })) as BankAccountWithUser | null
  if (!bankAccount || bankAccount.userId !== userId) {
    throw new BankAccountNotFoundError()
  }

  const decryptedAccountNumber = decrypt(bankAccount.accountNumber)
  const accountType = mapAccountType(bankAccount.accountType)
  const startDate = paymentGateway.getNextDebitDate(data.debitDay)
  const accountName = `${bankAccount.user.firstName} ${bankAccount.user.lastName}`
  const idNumber = bankAccount.user.idNumber ? decrypt(bankAccount.user.idNumber) : undefined

  const netcashRes = await paymentGateway.createMandate({
    accountNumber: decryptedAccountNumber,
    branchCode: bankAccount.branchCode,
    accountType,
    accountName,
    idNumber,
    amount: data.amount,
    debitDay: data.debitDay,
    startDate,
    referenceNumber: `XXM-${userId.slice(-8).toUpperCase()}`,
  })

  // Persist the status Netcash actually returned (a 200 response may still carry
  // a REJECTED/CANCELLED status), not an assumed PENDING.
  const status = paymentGateway.mapMandateStatus(netcashRes.status)

  // The DebiCheck mandate is already live at Netcash. If the local write fails we
  // must cancel it, otherwise we orphan a debit authorisation with no local record.
  let mandate
  try {
    mandate = await mandateRepo.create({
      userId,
      bankAccountId: data.bankAccountId,
      debitDay: data.debitDay,
      amount: data.amount,
      status,
      netcashMandateId: netcashRes.mandateId,
    })
  } catch (dbErr) {
    // The Netcash mandate is already live; cancel it so we never orphan a debit
    // authorisation with no local record.
    await paymentGateway.cancelMandate(netcashRes.mandateId).catch(() => {})
    // A unique-violation here means a concurrent request won the race to create
    // the single allowed active/pending mandate. Return a clean conflict instead
    // of a raw Prisma error (the DB partial unique index is the race-safe backstop
    // for the non-atomic pre-check above).
    if (isUniqueViolation(dbErr)) {
      throw new MandateConflictError('An active or pending mandate already exists', 'MND_002')
    }
    throw dbErr
  }

  await writeAuditLog({
    userId,
    action: 'MANDATE_CREATED',
    entity: 'PaymentMandate',
    entityId: mandate.id,
    payload: { bankAccountId: data.bankAccountId, debitDay: data.debitDay, amount: data.amount },
    ipAddress,
  })

  return mandate
}

export async function updateMandate(
  mandateId: string,
  data: UpdateMandateInput,
  requesterId: string,
  requesterRoles: string[],
  ipAddress?: string,
) {
  const mandate = await mandateRepo.findById(mandateId)
  if (!mandate) throw new MandateNotFoundError()
  assertCanAccess(mandate.userId, requesterId, requesterRoles)

  if (mandate.status !== 'ACTIVE' && mandate.status !== 'PENDING') {
    throw new MandateConflictError('Only active or pending mandates can be updated', 'MND_003')
  }

  // Write to DB first (source of truth), then sync to Netcash.
  // If Netcash call fails after DB write, we log for manual reconciliation
  // rather than leaving DB in the new state while Netcash has the old values.
  const updated = await mandateRepo.update(mandateId, {
    ...(data.debitDay !== undefined && { debitDay: data.debitDay }),
    ...(data.amount !== undefined && { amount: data.amount }),
  })

  const hasChange = data.amount !== undefined || data.debitDay !== undefined
  if (hasChange && mandate.netcashMandateId) {
    try {
      const effectiveDate = paymentGateway.getNextDebitDate(data.debitDay ?? mandate.debitDay)
      await paymentGateway.updateMandate(
        mandate.netcashMandateId,
        { amount: data.amount, debitDay: data.debitDay },
        effectiveDate,
      )
    } catch (err) {
      logger.error('DB mandate updated but Netcash sync failed — manual reconciliation required', {
        mandateId, netcashMandateId: mandate.netcashMandateId, changes: data,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await writeAuditLog({
    userId: mandate.userId,
    action: 'MANDATE_UPDATED',
    entity: 'PaymentMandate',
    entityId: mandateId,
    payload: {
      changes: data,
      previousState: {
        debitDay: mandate.debitDay,
        amount: Number(mandate.amount),
      },
    },
    ipAddress,
  })

  return updated
}

export async function cancelMandate(
  mandateId: string,
  requesterId: string,
  requesterRoles: string[],
  ipAddress?: string,
) {
  const mandate = await mandateRepo.findById(mandateId)
  if (!mandate) throw new MandateNotFoundError()
  assertCanAccess(mandate.userId, requesterId, requesterRoles)

  if (mandate.status === 'CANCELLED') {
    throw new MandateConflictError('Mandate is already cancelled', 'MND_004')
  }

  // Cancel in DB first so we never re-bill after a member requests cancellation.
  // Then notify Netcash; failure is logged for manual reconciliation.
  const updated = await mandateRepo.update(mandateId, { status: 'CANCELLED' })

  if (mandate.netcashMandateId) {
    try {
      await paymentGateway.cancelMandate(mandate.netcashMandateId)
    } catch (err) {
      logger.error('DB mandate cancelled but Netcash cancel failed — manual reconciliation required', {
        mandateId, netcashMandateId: mandate.netcashMandateId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await writeAuditLog({
    userId: mandate.userId,
    action: 'MANDATE_CANCELLED',
    entity: 'PaymentMandate',
    entityId: mandateId,
    payload: {
      previousStatus: mandate.status,
      hadNetcashMandate: !!mandate.netcashMandateId,
    },
    ipAddress,
  })

  return updated
}

export async function requestDelay(
  mandateId: string,
  data: DelayMandateInput,
  requesterId: string,
  requesterRoles: string[],
  ipAddress?: string,
) {
  const mandate = await mandateRepo.findById(mandateId)
  if (!mandate) throw new MandateNotFoundError()
  assertCanAccess(mandate.userId, requesterId, requesterRoles)

  if (mandate.status !== 'ACTIVE') {
    throw new MandateConflictError('Only active mandates can be delayed', 'MND_005')
  }

  const newDate = new Date(data.newDate)
  if (newDate <= new Date()) {
    throw new MandateConflictError('Delay date must be in the future', 'MND_006')
  }

  if (mandate.netcashMandateId) {
    await paymentGateway.delayMandate(mandate.netcashMandateId, data.newDate)
  }

  // Mark this period's debit as delayed so the nightly debit-run skips it.
  // Key derived from getNextDebitDate so it matches what debit-run checks.
  const nextDebit = paymentGateway.getNextDebitDate(mandate.debitDay)
  const [periodYear, periodMonth] = nextDebit.split('-')
  await redis.set(
    `xxm:delay:${mandateId}:${periodYear}-${periodMonth}`,
    '1',
    { ex: 60 * 60 * 24 * 90 },
  )

  // Emit event so mandate-delay-handler sleeps until the new date and charges then.
  await inngest.send({
    name: InngestEvents.MANDATE_DELAY_HANDLER,
    data: {
      mandateId,
      userId: mandate.userId,
      newDate: data.newDate,
      reason: data.reason ?? null,
    },
  })

  await writeAuditLog({
    userId: mandate.userId,
    action: 'MANDATE_DELAY_REQUESTED',
    entity: 'PaymentMandate',
    entityId: mandateId,
    payload: { newDate: data.newDate, reason: data.reason ?? null },
    ipAddress,
  })

  return { success: true, newDate: data.newDate }
}

// ─── Webhook processing ────────────────────────────────────────────────────

export async function processMandateWebhook(event: WebhookEvent) {
  const mandate = await mandateRepo.findFirst({
    netcashMandateId: event.mandateId,
  })

  if (!mandate) return // unknown mandate ID — no-op

  const newStatus = paymentGateway.mapMandateStatus(event.status) as MandateStatus

  // CANCELLED is terminal — never let a replayed or out-of-order event revive a
  // cancelled mandate (which would resume debiting an account the member closed).
  if (mandate.status === 'CANCELLED') return

  // Idempotency: identical-status redeliveries are a no-op (no churn, no duplicate
  // audit rows). Netcash retries on non-2xx and may also deliver duplicates.
  if (mandate.status === newStatus) return

  await mandateRepo.update(mandate.id, { status: newStatus })

  await writeAuditLog({
    action: 'MANDATE_WEBHOOK_RECEIVED',
    entity: 'PaymentMandate',
    entityId: mandate.id,
    payload: {
      netcashMandateId: event.mandateId,
      previousStatus: mandate.status,
      externalStatus: event.status,
      mappedStatus: newStatus,
      reason: event.reason ?? null,
      transactionRef: event.transactionRef ?? null,
    },
  })
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function maskBankAccount(encrypted: string): string {
  const plain = decrypt(encrypted)
  return plain.slice(-4).padStart(plain.length, '*')
}

function mapAccountType(type: AccountType): GatewayAccountType {
  const map: Record<AccountType, GatewayAccountType> = {
    CHEQUE: 'Cheque',
    SAVINGS: 'Savings',
    TRANSMISSION: 'Transmission',
  }
  return map[type]
}
