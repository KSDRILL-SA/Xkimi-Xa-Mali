import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { goalRepo } from '@/repositories/goal.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { paymentGateway } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { assertCanAccess } from '@/lib/authorization'
import { GoalNotFoundError, GoalConflictError, MandateConflictError, isUniqueViolation } from '@/lib/errors'
import { MIN_GOAL_PAYMENT } from '@/lib/validation/goal'
import type { OfflineGoalPaymentInput } from '@xxm/utils'
import { db } from '@/lib/db'
import { assertAdmin } from '@/lib/authorization'
import { MemberNotFoundError } from '@/lib/errors'
import { createInboxMessages } from './inbox.service'
import { roundZAR } from '@/lib/money'
import { writeAuditLog } from './audit.service'
import { postPoolCredit, postPoolDebit } from './ledger.service'
import { queueNotification } from './notification.service'
import { syncPrimaryGoalProgress, syncAdditionalGoalProgress } from './goal.service'
import { logger } from '@xxm/observability'
import { toTransactionStatus } from '@/lib/transaction-status'

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
  /** One token per payment the member intends. See the key below. */
  token?: string,
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

  // One token per payment the member intends, supplied by the client.
  //
  // This ended in randomUUID(), so it was unique on every request and provided
  // no idempotency at all — a double tap on "contribute to this goal" took the
  // money twice. Identical to the defect fixed in the contribution path (#309);
  // this is the sibling path, and it had it too.
  //
  // A member may legitimately give to one goal more than once, so the key
  // cannot be derived from the goal and the member alone. What it can refuse is
  // the same *intent* submitted twice.
  const clientToken = token ?? randomUUID()
  const idempotencyKey = `goal:${goalId}:${userId}:${clientToken}`

  if (!token) {
    logger.warn('Goal payment submitted without an idempotency token', { userId, goalId })
  }

  // Checked before the gateway, never after. Submitting first and writing
  // second means two concurrent requests produce two debits and only then
  // collide — by which point the member has paid twice.
  const alreadyPaid = await goalRepo.findPaymentByIdempotencyKey(idempotencyKey)
  if (alreadyPaid) {
    logger.info('Goal payment already submitted under this token', {
      userId, goalId, paymentId: alreadyPaid.id,
    })
    return { payment: alreadyPaid, status: alreadyPaid.status, duplicate: true as const }
  }

  // Claim the key before the gateway is touched.
  //
  // The lookup above protects a member who submits again after the first
  // request finished. It cannot protect two requests that pass it together —
  // a double tap does exactly that, both read nothing, both charge, and only
  // the second collides on the unique index afterwards. Which is the very
  // thing the comment above was written to prevent: the member is debited
  // twice at Netcash and left with one payment row and a 500.
  //
  // Writing the row first makes the unique index the arbiter instead of the
  // gap between a read and a write. Exactly one request reaches the gateway;
  // the loser finds the row it collided with and reports the duplicate it is.
  let payment
  try {
    payment = await goalRepo.createPayment({
      goalId,
      userId,
      amount,
      status: 'PENDING',
      idempotencyKey,
      gatewayRef: null,
      processedAt: null,
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const existing = await goalRepo.findPaymentByIdempotencyKey(idempotencyKey)
    if (!existing) throw err
    logger.info('Goal payment already claimed under this token', {
      userId, goalId, paymentId: existing.id,
    })
    return { payment: existing, status: existing.status, duplicate: true as const }
  }

  const gatewayRes = await paymentGateway.submitOnceOffDebit({
    mandateId: mandate.netcashMandateId,
    amount: debitAmountWithFee(amount),
    reference: `XXM-GOAL-${goalId.slice(-8).toUpperCase()}`,
    idempotencyKey,
  })

  // The gateway answers with three outcomes and this collapsed them onto two.
  // The fifth copy of §4.6 — debit-run, transaction-retry-failed,
  // mandate-delay-handler and the manual contribution path each carried it.
  //
  // Here a declined goal payment was written PENDING, so the member was told
  // their contribution to the fund was on its way, the goal's progress waited
  // on a settlement that was never coming, and nothing retried it.
  const status = toTransactionStatus(gatewayRes.status)

  // The row already exists — this settles what the gateway said about it. The
  // result is deliberately not reassigned over `payment`: everything below
  // needs the id, which the claimed row already carries, and rebinding it makes
  // the whole function depend on what an update happens to return.
  await goalRepo.updatePayment(payment.id, {
    status,
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

// ─── Admin: record an offline (cash / EFT) payment toward a goal ───────────

/**
 * Record money a member gave toward a goal without the gateway.
 *
 * The sibling of `recordOfflineContribution`, and it exists for the same
 * reason. `payToGoal` above requires an active Netcash mandate, and the
 * DebiCheck application was declined — so no member can reach a goal through
 * the gateway at all. The only other route was an admin recording goal
 * progress, and that is a different thing wearing similar clothes: it moves a
 * goal's total with **no member attached**, does not touch the pool ledger, and
 * refuses the primary fund outright. A member who handed over cash for a goal
 * could not be recorded as having given anything.
 *
 * What it shares with the gateway path is the part that must not fork:
 * `applySettledPayment` re-derives the goal total, credits the pool ledger and
 * thanks the member. A goal's figure is DERIVED from the SUCCESS sum rather
 * than accumulated, which is what makes an offline payment reversal-safe for
 * free — remove the row and the next sync reflects the smaller total.
 *
 * ── Why the primary fund is refused ────────────────────────────────────────
 *
 * `syncPrimaryGoalProgress` adds directed payments ON TOP of monthly
 * contributions. That is right for the gateway path, where a member
 * deliberately gives extra beyond their obligation. It is wrong here, because
 * the mistake an admin is actually likely to make is recording somebody's
 * ordinary monthly money as a payment to the fund: the fund total would rise
 * while the member's month still showed unpaid, and the debit run would go on
 * trying to collect money already in the account. Money for the primary fund IS
 * a monthly contribution and belongs on `recordOfflineContribution`, where
 * paying more than the month owes is already accepted and reported.
 */
export async function recordOfflineGoalPayment(
  data: OfflineGoalPaymentInput,
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

  const goal = await goalRepo.findById(data.goalId)
  if (!goal) throw new GoalNotFoundError()
  const g = goal as unknown as GoalForPayment

  if (g.isPrimary) {
    throw new GoalConflictError(
      'The fund fills from monthly contributions. Record this against the month it was paid for, not as a goal payment.',
      'GOL_014',
    )
  }
  if (g.status !== 'ACTIVE') {
    throw new GoalConflictError('Money can only be recorded against an active goal', 'GOL_015')
  }

  // Scoped to the member AND the goal, which is the whole point of asking what
  // the payment is for. The same reference against two different goals is two
  // real payments; the same reference against the same goal twice is one
  // payment being recorded again — a double-submitted form, or two admins
  // working from the same bank statement. Without the goal in the key, giving
  // to two goals on one day under a lazy reference would be refused as a
  // duplicate. Without the reference, nothing would be refused at all.
  const idempotencyKey = `goal-offline:${data.goalId}:${data.userId}:${data.reference.toLowerCase()}`

  const duplicate = await goalRepo.findPaymentByIdempotencyKey(idempotencyKey)
  if (duplicate) {
    throw new GoalConflictError(
      `A payment with reference "${data.reference}" is already recorded for this member against "${g.title}"`,
      'GOL_016',
    )
  }

  const amount = roundZAR(data.amount)

  const payment = await goalRepo.createPayment({
    goalId: data.goalId,
    userId: data.userId,
    amount,
    // SUCCESS on write. The money is already in the account — that is why an
    // admin is recording it — and no webhook is coming to confirm it.
    status: 'SUCCESS',
    idempotencyKey,
    // Null, not a placeholder: nothing was submitted to a gateway, so there is
    // no gateway reference to hold. The bank reference has its own column.
    gatewayRef: null,
    offlineReference: data.reference,
    recordedById: adminId,
    proofUrl: data.proofUrl ?? null,
    proofWitness: data.proofWitness ?? null,
    // When the money arrived, not when it was typed. For a payment caught up
    // months later these are far apart, and only the first is true.
    processedAt: data.receivedAt,
  })

  // The same tail every settled payment runs: re-derive the goal, credit the
  // pool, thank the member. Not reimplemented here — a second copy of "what it
  // means for a goal payment to have landed" is how the two would drift.
  await applySettledPayment(
    { id: payment.id, goalId: data.goalId, userId: data.userId, amount },
    g,
  )

  await writeAuditLog({
    userId: adminId,
    action: 'OFFLINE_GOAL_PAYMENT_RECORDED',
    entity: 'GoalPayment',
    entityId: payment.id,
    payload: {
      memberId: data.userId,
      goalId: data.goalId,
      goalTitle: g.title,
      amount,
      reference: data.reference,
      receivedAt: data.receivedAt.toISOString(),
      note: data.note ?? null,
      // Which kind of evidence, never the pathname — this log is read by people
      // who are not entitled to open the document.
      evidence: data.proofUrl ? 'DOCUMENT' : 'WITNESSED',
      witness: data.proofWitness ?? null,
    } as Prisma.InputJsonValue,
    ipAddress: ip,
  })

  // Read back rather than computed. The goal total is derived from the SUCCESS
  // sum, so working it out separately here would be a second opinion about the
  // same thing, free to disagree with it.
  const after = await goalRepo.findById(data.goalId)
  const currentAmount = Number((after as unknown as { currentAmount: unknown })?.currentAmount ?? 0)
  const targetAmount = Number(g.targetAmount)

  // Leadership recording money against somebody's name is a change to their
  // financial record that they had no part in making. Best-effort: the payment
  // is committed, and a failed inbox write must not turn it into an error the
  // admin retries — which is how the same money gets recorded twice.
  await createInboxMessages([data.userId], {
    title: `R${amount.toFixed(2)} recorded toward ${g.title}`,
    body:
      `Leadership has recorded your payment of R${amount.toFixed(2)} toward "${g.title}". ` +
      `That goal now stands at R${currentAmount.toFixed(2)} of R${targetAmount.toFixed(2)}. ` +
      `Reference: ${data.reference}.` +
      ' If you do not recognise this, contact leadership.',
    category: 'GOAL',
    createdById: adminId,
  }).catch((err) =>
    logger.error('Inbox notify failed after an offline goal payment', {
      error: err instanceof Error ? err.message : String(err),
      userId: data.userId,
    }),
  )

  logger.info('Offline goal payment recorded', {
    adminId,
    memberId: data.userId,
    goalId: data.goalId,
    paymentId: payment.id,
    amount,
    currentAmount,
  })

  return {
    paymentId: payment.id,
    goalId: data.goalId,
    goalTitle: g.title,
    receiptRef: `XXM-GOF-${payment.id.slice(-8).toUpperCase()}`,
    amount,
    currentAmount,
    targetAmount,
    /** True when this payment took the goal to or past its target. */
    achieved: currentAmount >= targetAmount,
  }
}
