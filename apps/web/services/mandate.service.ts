// `decrypt` is used where the plaintext is submitted to the payment gateway and
// must fail loudly; `maskStoredSecret` where it is only displayed.
import { decrypt, maskStoredSecret } from '@/lib/encryption'
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
import type { AccountType, Prisma } from '@prisma/client'
import { inngest, InngestEvents } from '@/lib/inngest'
import { logger } from '@xxm/observability'
import { mandateRepo } from '@/repositories/mandate.repository'
import { bankAccountRepo } from '@/repositories/bank-account.repository'
import { userRepo } from '@/repositories/user.repository'
import { bumpRoleVersion } from '@/lib/role-version'
import { notifyAdmins } from './inbox.service'
import { raiseOperationalAlert } from './alert.service'

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

/**
 * Whether the member can be debited right now — the precondition for every
 * member-initiated payment. Lets a page offer the payment path only when it can
 * actually succeed, instead of letting the member fill in a form and fail at
 * submit. Id-only lookup: no bank details are read or decrypted.
 */
export async function hasActiveMandate(
  userId: string,
  requesterId: string,
  requesterRoles: string[],
): Promise<boolean> {
  assertCanAccess(userId, requesterId, requesterRoles)
  const mandate = await mandateRepo.findActiveByUser(userId, { id: true })
  return mandate !== null
}

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
      accountNumberMasked: maskBankAccount(m.bankAccount.accountNumber, m.bankAccountId),
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
      accountNumberMasked: maskBankAccount(mandate.bankAccount.accountNumber, mandate.bankAccountId),
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
  // An unrecognised status on a mandate we have just created is treated as
  // PENDING — not yet authorised — rather than guessed at. Logged because it
  // means the gateway is speaking a vocabulary this code does not have.
  const mappedStatus = paymentGateway.mapMandateStatus(netcashRes.status)
  if (mappedStatus === null) {
    logger.error('Unrecognised mandate status from the gateway on creation', {
      userId,
      gatewayStatus: netcashRes.status,
    })
  }
  const status = mappedStatus ?? 'PENDING'

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
      const reason = err instanceof Error ? err.message : String(err)
      logger.error('DB mandate updated but Netcash sync failed — manual reconciliation required', {
        mandateId, netcashMandateId: mandate.netcashMandateId, changes: data,
        error: reason,
      })
      await raiseGatewayDesyncAlert({
        mandateId,
        netcashMandateId: mandate.netcashMandateId,
        operation: 'update',
        reason,
        detail: [
          `This system now holds R${data.amount ?? Number(mandate.amount)} on day ${data.debitDay ?? mandate.debitDay}.`,
          'The authorisation at the bank still carries the previous values.',
          '',
          'The debit run submits the amount held here, so the next collection may be',
          'refused for exceeding what the member actually authorised. Re-apply the',
          'change at Netcash, or revert it here, before the next debit day.',
        ].join('\n'),
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
      const reason = err instanceof Error ? err.message : String(err)
      logger.error('DB mandate cancelled but Netcash cancel failed — manual reconciliation required', {
        mandateId, netcashMandateId: mandate.netcashMandateId,
        error: reason,
      })
      await raiseGatewayDesyncAlert({
        mandateId,
        netcashMandateId: mandate.netcashMandateId,
        operation: 'cancel',
        reason,
        detail: [
          'The member has been told their debit order is cancelled, and this system',
          'will not collect from them again. The authorisation at their bank is',
          'still standing.',
          '',
          'Nothing here will find this on its own: mandate-status-sync only reads',
          'mandates that are PENDING, ACTIVE or SUSPENDED, so a locally-cancelled',
          'one is never looked at again. Cancel it in the Netcash portal by hand.',
        ].join('\n'),
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

  // Record the delay on the mandate itself so the nightly debit-run skips it.
  //
  // This used to be a Redis key. The cache client is a no-op shim whenever
  // Upstash is not configured — its set() discards and its get() returns null —
  // so the delay was never written and never read, and the member was debited on
  // the original date despite having asked not to be. Money leaving someone's
  // account on a day they said they could not afford is not something to leave
  // resting on a cache.
  //
  // delayedUntil already existed on the model, and was indexed, and no code had
  // ever written to or read from it.
  await mandateRepo.update(mandateId, { delayedUntil: newDate })

  // The event that will actually charge them, and the reason this is not simply
  // awaited and forgotten.
  //
  // `delayedUntil` is what makes the debit run skip this member. The event is
  // what makes anything collect from them afterwards. Written in that order they
  // are two halves of one promise, and if the second half fails the member is
  // skipped by the debit run and charged by nothing — not late, not failed,
  // simply never collected for the period, with no failed transaction and no
  // trace anywhere that money was due.
  //
  // So a failed send un-skips them. Being debited on the original date is not
  // what they asked for and they must be told, but it is a collection that
  // happened and can be reversed. The alternative is a silent hole in a month's
  // contributions that nobody would find until reconciliation.
  try {
    await inngest.send({
      name: InngestEvents.MANDATE_DELAY_HANDLER,
      data: {
        mandateId,
        userId: mandate.userId,
        newDate: data.newDate,
        reason: data.reason ?? null,
      },
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await mandateRepo.update(mandateId, { delayedUntil: null }).catch(() => {})

    logger.error('Mandate delay could not be scheduled — the skip was withdrawn', {
      mandateId, userId: mandate.userId, newDate: data.newDate, error: reason,
    })

    await raiseOperationalAlert({
      code: 'MANDATE_DELAY_NOT_SCHEDULED',
      // The member asked not to be debited on a day they said they could not
      // afford, and will be. That is worth an SMS on the night it matters.
      severity: 'critical',
      title: 'A member asked to move their debit and it was not scheduled',
      body: [
        'The delay was accepted by the gateway but the job that charges them on the',
        'new date could not be scheduled. The skip has been withdrawn, so they will',
        'be debited on their original date instead.',
        '',
        'They asked to move it because of that date. Contact them before it runs.',
        '',
        `Mandate: ${mandateId}`,
        `Member: ${mandate.userId}`,
        `Requested date: ${data.newDate}`,
        `Reason: ${reason}`,
      ].join('\n'),
      entityId: mandateId,
      payload: { mandateId, userId: mandate.userId, newDate: data.newDate, reason },
    })

    throw err
  }

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

  // A status we cannot read is not a status change. Leaving the mandate as it
  // is keeps a member being collected from on an authorisation that is still
  // good, rather than moving them out of ACTIVE on a word we do not know.
  const newStatus = paymentGateway.mapMandateStatus(event.status)
  if (newStatus === null) {
    logger.error('Unrecognised mandate status in webhook — mandate left unchanged', {
      mandateId: mandate.id,
      gatewayStatus: event.status,
    })
    return
  }

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

// ─── Debit warning planning ──────────────────────────────────────────────────

export type DebitWarningTarget = {
  mandateId: string
  userId: string
  amount: number
  atRisk: boolean
}

/**
 * Decide which of today's active mandates should get a pre-debit warning.
 *
 * A member whose contribution for the period is already settled (paid manually
 * or waived) is skipped — the debit run will not touch them, so a "R{amount}
 * will be debited today" SMS would be wrong and just noise. A member with a
 * recent failed debit is flagged `atRisk` so the caller can prioritise them (the
 * ones most likely to fail again and most in need of the heads-up). Pure and
 * side-effect free for straightforward testing.
 */
export function planDebitWarnings(
  mandates: ReadonlyArray<{
    id: string
    userId: string
    amount: number
    userStatus: string
    /** A date the member moved this debit to. Serialised as a string across an
     *  Inngest step boundary, so both shapes are accepted. */
    delayedUntil?: Date | string | null
  }>,
  settledUserIds: ReadonlySet<string>,
  atRiskUserIds: ReadonlySet<string>,
  now: Date = new Date(),
): DebitWarningTarget[] {
  const targets: DebitWarningTarget[] = []
  for (const m of mandates) {
    if (m.userStatus !== 'ACTIVE') continue
    if (settledUserIds.has(m.userId)) continue
    // No point warning someone about a debit that will not run: they have moved
    // it, and the delay handler charges them on the day they chose.
    if (m.delayedUntil && new Date(m.delayedUntil) > now) continue
    targets.push({
      mandateId: m.id,
      userId: m.userId,
      amount: m.amount,
      atRisk: atRiskUserIds.has(m.userId),
    })
  }
  return targets
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Say that this system and the bank now disagree about a mandate.
 *
 * Both `updateMandate` and `cancelMandate` write locally first and tell Netcash
 * second — deliberately, so a member who asks to stop being collected from is
 * never collected from again by us, whatever the gateway does. The cost of that
 * ordering is a window where the two disagree, and until now the entire response
 * to landing in that window was one `logger.error` and a comment saying "manual
 * reconciliation required" addressed to nobody in particular.
 *
 * That is the failure this repository keeps finding: silence on the money path.
 * A divergence between what a member believes and what their bank has been told
 * does not announce itself, and nothing else in the system is looking — the
 * nightly `mandate-status-sync` reads only PENDING, ACTIVE and SUSPENDED, so a
 * cancellation that failed at the gateway is never examined again by anything.
 *
 * `warning` rather than `critical`: no money has moved incorrectly at the moment
 * this fires, and it is a state to correct today rather than tonight. The debit
 * run's own alerts stay `critical` for the case where money actually did not
 * move.
 */
export async function raiseGatewayDesyncAlert(params: {
  mandateId: string
  netcashMandateId: string
  operation: 'update' | 'cancel'
  reason: string
  detail: string
}): Promise<void> {
  await raiseOperationalAlert({
    code: 'MANDATE_GATEWAY_DESYNC',
    severity: 'warning',
    // Plain ASCII and short — the alert service may put this in an SMS.
    title: `Mandate ${params.operation} did not reach Netcash`,
    body: [
      `A mandate ${params.operation} was applied here but rejected by the gateway.`,
      '',
      params.detail,
      '',
      `Mandate: ${params.mandateId}`,
      `Netcash mandate: ${params.netcashMandateId}`,
      `Reason: ${params.reason}`,
    ].join('\n'),
    entityId: params.mandateId,
    payload: {
      mandateId: params.mandateId,
      netcashMandateId: params.netcashMandateId,
      operation: params.operation,
      reason: params.reason,
    },
  })
}

function maskBankAccount(encrypted: string, bankAccountId: string): string {
  return maskStoredSecret(encrypted, { field: 'bankAccount.accountNumber', bankAccountId })
}

function mapAccountType(type: AccountType): GatewayAccountType {
  const map: Record<AccountType, GatewayAccountType> = {
    CHEQUE: 'Cheque',
    SAVINGS: 'Savings',
    TRANSMISSION: 'Transmission',
  }
  return map[type]
}


// ─── Leaving the Foundation ───────────────────────────────────────────────────

/**
 * A member chooses to leave.
 *
 * Under Your Rights the guide promises "Leave the Foundation at any time, with
 * your history intact", and the FAQ answers "Yes, at any time. Your history
 * stays on record but future contributions stop." There was no self-service
 * route at all.
 *
 * Immediate, by the founders' decision — "at any time" reads as immediate, and
 * a leaving that waits on an acknowledgement means a debit the member asked to
 * stop can still run before anyone gets to it.
 *
 * What this does NOT do is as important as what it does. Nothing is deleted:
 * every contribution, transaction, ledger entry and statement stays exactly
 * where it is, and money already contributed is not refunded. The status moves
 * out of ACTIVE, which is what every collection path already filters on, and
 * the mandate is cancelled at the gateway so the bank stops too.
 */
export async function leaveFoundation(
  userId: string,
  ipAddress?: string,
) {
  const user = await userRepo.findById(userId)
  if (!user) throw new MandateNotFoundError()

  if (user.status === 'RESIGNED') {
    throw new MandateConflictError('You have already left the Foundation', 'USR_010')
  }

  // Cancel first, so no debit can be claimed between the status write and the
  // gateway call. Each mandate goes through the same cancelMandate the member
  // could have called themselves — one implementation of "stop collecting",
  // not a second one that could drift from it.
  const mandates = await mandateRepo.findMany({
    userId,
    status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] },
  })

  for (const mandate of mandates) {
    await cancelMandate(mandate.id, userId, [], ipAddress).catch((err) =>
      logger.error('Mandate cancel failed while a member was leaving', {
        userId, mandateId: mandate.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }

  const resignedAt = new Date()

  const updated = await userRepo.update(userId, {
    status: 'RESIGNED',
    resignedAt,
  }, { id: true, firstName: true, lastName: true })

  // Bump AND publish the role version, so a session issued while they were
  // still active is re-established against the new status rather than running
  // on a stale token. bumpRoleVersion does both — incrementing separately here
  // would double-count and publish the wrong number.
  await bumpRoleVersion(userId)

  await writeAuditLog({
    userId,
    action: 'MEMBER_RESIGNED',
    entity: 'User',
    entityId: userId,
    payload: {
      mandatesCancelled: mandates.length,
      previousStatus: user.status,
    },
    ipAddress,
  })

  // Leadership is told after the fact, not asked in advance. The guide says the
  // member may leave at any time; making that conditional on a leader reading an
  // inbox would make "at any time" untrue.
  const name = `${(updated as { firstName: string }).firstName} ${(updated as { lastName: string }).lastName}`
  await notifyAdmins({
    title: `${name} has left the Foundation`,
    body:
      `${name} has chosen to leave. Their debit order has been cancelled and no future ` +
      `collection will include them. Their full contribution history remains on record.`,
    category: 'SYSTEM',
  }).catch((err) => logger.error('Failed to notify leadership of a resignation', {
    userId, error: err instanceof Error ? err.message : String(err),
  }))

  logger.info('Member left the Foundation', { userId, mandatesCancelled: mandates.length })

  return { resignedAt: resignedAt.toISOString(), mandatesCancelled: mandates.length }
}
