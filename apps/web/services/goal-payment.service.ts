import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { goalRepo } from '@/repositories/goal.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { paymentGateway } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { assertCanAccess } from '@/lib/authorization'
import { GoalNotFoundError, GoalConflictError, MandateConflictError } from '@/lib/errors'
import { MIN_GOAL_PAYMENT } from '@/lib/validation/goal'
import { roundZAR } from '@/lib/money'
import { writeAuditLog } from './audit.service'
import { postPoolCredit, postPoolDebit } from './ledger.service'
import { queueNotification } from './notification.service'
import { syncPrimaryGoalProgress, syncAdditionalGoalProgress } from './goal.service'
import { logger } from '@xxm/observability'

type GoalForPayment = {
  id: string
  status: string
  isPrimary: boolean
  title: string
  targetAmount: unknown
}

type SettledPayment = {
  id: string
  goalId: string
  userId: string
  amount: unknown
}

/**
 * Bring a goal's total back in line with the money actually behind it. Both
 * funds derive rather than accumulate, so this is the single call that settles
 * and un-settles a payment alike — it simply re-reads the sums.
 */
async function resyncGoal(goal: GoalForPayment): Promise<void> {
  if (goal.isPrimary) {
    await syncPrimaryGoalProgress()
  } else {
    await syncAdditionalGoalProgress(goal.id)
  }
}

/**
 * Everything that must happen once a directed payment is settled money, whether
 * it settled inline at submission or later via the gateway webhook. The goal
 * total re-derives; the pool ledger credit and the thank-you are best-effort — a
 * hiccup in either must never unwind a payment we have already taken.
 */
async function applySettledPayment(
  payment: SettledPayment,
  goal: GoalForPayment,
): Promise<void> {
  const amount = roundZAR(Number(payment.amount))

  await resyncGoal(goal)

  await postPoolCredit({
    refType: 'GOAL_PAYMENT', refId: payment.id, amount, memberId: payment.userId,
    description: `Goal contribution: ${goal.title}`,
  }).catch((err) => logger.error('Pool credit failed on goal payment', {
    paymentId: payment.id, error: err instanceof Error ? err.message : String(err),
  }))

  await queueNotification({
    userId: payment.userId, templateSlug: 'goal-payment-thanks', channel: 'SMS',
    payload: { amount: amount.toString(), goal: goal.title },
  }).catch(() => {})
}

/**
 * Unwind a payment that settled and was later reversed by the bank.
 *
 * The money left the fund, so the goal total must come down and the pool must be
 * debited. Both halves are safe to repeat: the goal figure is derived from the
 * SUCCESS sum (which no longer includes this payment), and the ledger is
 * idempotent on (refType, refId, direction) — so the original CREDIT stays as
 * the immutable record of what happened and the DEBIT sits alongside it.
 */
async function applyReversedPayment(
  payment: SettledPayment,
  goal: GoalForPayment,
): Promise<void> {
  const amount = roundZAR(Number(payment.amount))

  await resyncGoal(goal)

  await postPoolDebit({
    refType: 'GOAL_PAYMENT', refId: payment.id, amount, memberId: payment.userId,
    description: `Goal contribution reversed: ${goal.title}`,
  }).catch((err) => logger.error('Pool debit failed on reversed goal payment', {
    paymentId: payment.id, error: err instanceof Error ? err.message : String(err),
  }))
}

/**
 * A member's directed extra payment toward any active goal — the primary fund or
 * an additional one. Money is collected through the gateway exactly like a manual
 * contribution (mandate required, member charged the amount plus the Netcash fee
 * so the fund nets the full value), recorded as an idempotent GoalPayment, and
 * — once settled — reflected in the goal's progress. Boosts their standing.
 *
 * The gateway may answer PENDING; the money is then only real when the webhook
 * says so, which is why settlement lives in `processGoalPaymentWebhook`.
 */
export async function payToGoal(
  goalId: string,
  userId: string,
  requesterId: string,
  roles: string[],
  rawAmount: number,
  ip?: string,
) {
  assertCanAccess(userId, requesterId, roles)

  const amount = roundZAR(rawAmount)
  if (!(amount >= MIN_GOAL_PAYMENT)) {
    throw new GoalConflictError(`The minimum payment toward a goal is R${MIN_GOAL_PAYMENT}`, 'GOL_012')
  }

  const goal = await goalRepo.findById(goalId)
  if (!goal) throw new GoalNotFoundError()
  const g = goal as unknown as GoalForPayment
  if (g.status !== 'ACTIVE') {
    throw new GoalConflictError('You can only contribute to an active goal', 'GOL_013')
  }

  const mandate = await mandateRepo.findActiveByUser(userId)
  if (!mandate?.netcashMandateId) {
    throw new MandateConflictError('An active payment mandate is required to contribute to a goal', 'CTR_002')
  }

  const idempotencyKey = `goal:${goalId}:${userId}:${randomUUID()}`

  const gatewayRes = await paymentGateway.submitOnceOffDebit({
    mandateId: mandate.netcashMandateId,
    amount: debitAmountWithFee(amount),
    reference: `XXM-GOAL-${goalId.slice(-8).toUpperCase()}`,
    idempotencyKey,
  })

  const status = gatewayRes.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING'

  const payment = await goalRepo.createPayment({
    goalId,
    userId,
    amount,
    status,
    idempotencyKey,
    gatewayRef: gatewayRes.transactionRef ?? null,
    processedAt: status === 'SUCCESS' ? new Date() : null,
  })

  if (status === 'SUCCESS') {
    await applySettledPayment({ id: payment.id, goalId, userId, amount }, g)
  }

  await writeAuditLog({
    userId,
    action: 'GOAL_PAYMENT_SUBMITTED',
    entity: 'GoalPayment',
    entityId: payment.id,
    payload: { goalId, amount, status: gatewayRes.status } as Prisma.InputJsonValue,
    ipAddress: ip,
  })

  logger.info('Goal payment submitted', { goalId, userId, amount, status })

  return { paymentId: payment.id, status, amount, goalId, goalTitle: g.title }
}

type GoalPaymentEvent = {
  transactionRef: string
  status: string
  processedAt?: string
}

/**
 * Settle a directed goal payment from a Netcash webhook.
 *
 * Directed payments live in their own table, so the contribution webhook handler
 * cannot see them — without this a PENDING goal payment would be collected from
 * the member and never credited to the fund. An unknown reference is a no-op
 * (the event belongs to a contribution) and an unchanged status is a no-op
 * (redelivery safe).
 *
 * REVERSED is the one status a settled payment can still move to: the bank can
 * pull money back after it cleared, and when it does the goal total and the pool
 * have to follow it down. Every other transition out of a terminal state is
 * refused, so a late or replayed SUCCESS can never resurrect reversed money.
 */
export async function processGoalPaymentWebhook(event: GoalPaymentEvent): Promise<void> {
  const payment = await goalRepo.findPaymentByGatewayRef(event.transactionRef)
  if (!payment) return

  const newStatus = paymentGateway.mapTransactionStatus(event.status)
  if (!newStatus) return

  if (payment.status === newStatus) return

  const isReversalOfSettled = payment.status === 'SUCCESS' && newStatus === 'REVERSED'
  const terminal = ['SUCCESS', 'REVERSED']
  if (terminal.includes(payment.status) && !isReversalOfSettled) return

  // processedAt is only ever stamped by settlement, never cleared. On a reversal
  // it is the record that this payment DID clear once — which is how the ledger
  // reconciler tells a reversal that needs undoing from one that never settled
  // and so has no credit to undo.
  await goalRepo.updatePayment(payment.id, {
    status: newStatus,
    ...(newStatus === 'SUCCESS' && { processedAt: new Date() }),
  })

  // A payment that never settled has nothing to unwind — no goal total moved and
  // no pool entry was written, so recording the status is the whole job.
  if (newStatus !== 'SUCCESS' && !isReversalOfSettled) {
    logger.info('Goal payment did not settle', { paymentId: payment.id, status: newStatus })
    return
  }

  const goal = await goalRepo.findById(payment.goalId)
  if (!goal) {
    logger.error('Goal payment references a missing goal', { paymentId: payment.id, goalId: payment.goalId })
    return
  }
  const g = goal as unknown as GoalForPayment

  if (isReversalOfSettled) {
    await applyReversedPayment(payment, g)
    logger.warn('Settled goal payment reversed', {
      paymentId: payment.id, goalId: payment.goalId, amount: Number(payment.amount),
    })
    return
  }

  await applySettledPayment(payment, g)

  logger.info('Goal payment settled via webhook', {
    paymentId: payment.id, goalId: payment.goalId, amount: Number(payment.amount),
  })
}
