import { Prisma } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@xxm/observability'
import { paymentGateway } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { recalculateContributionStatus, emitContributionStatusChange } from '@/services/contribution.service'
import { writeAuditLog } from '@/services/audit.service'
import { queueNotification } from '@/services/notification.service'
import { MAX_TRANSACTION_RETRY } from '@xxm/utils'
import { toTransactionStatus } from '@/lib/transaction-status'
import { alertOnFailure } from '@/inngest/on-failure'
import { recordJobHeartbeat } from '@/lib/job-heartbeat'

/**
 * Inngest's `step`, narrowed to what this job uses.
 *
 * This job is the entire recovery path for a collection that did not happen.
 * The debit run writes a FAILED transaction precisely so this picks it up the
 * next day — which means the correctness of that fix depends on this one, and
 * until now nothing exercised either.
 */
export type RetryStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export async function executeTransactionRetry(step: RetryStepRunner) {
  const candidates = await step.run('find-retryable', () =>
    db.transaction.findMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: MAX_TRANSACTION_RETRY },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        mandate: { select: { id: true, netcashMandateId: true, status: true, userId: true } },
        contribution: { select: { id: true, status: true } },
      },
    }),
  )

  // Four outcomes, kept apart. "Skipped" used to absorb declines and errors
  // alike, so a run where every retry was refused reported the same shape as
  // one where there was nothing to do.
  let retried = 0
  let skipped = 0
  let declined = 0
  let errored = 0

  for (const tx of candidates) {
    if (tx.mandate.status !== 'ACTIVE' || !tx.mandate.netcashMandateId) {
      skipped++
      continue
    }

    if (tx.contribution.status === 'PAID') {
      skipped++
      continue
    }

    const result = await step.run(`retry-${tx.id}`, async () => {
      const submitFn = tx.type === 'MANUAL' ? paymentGateway.submitOnceOffDebit : paymentGateway.submitScheduledDebit

      try {
        const gatewayRes = await submitFn({
          mandateId: tx.mandate.netcashMandateId!,
          amount: debitAmountWithFee(Number(tx.amount)),
          reference: `XXM-RETRY-${tx.id.slice(-8)}`,
          idempotencyKey: `retry:${tx.idempotencyKey}:${tx.retryCount + 1}`,
        })

        // A decline must stay FAILED. Writing PENDING takes the row out of the
        // `status: 'FAILED'` set this job queries, so it is never retried
        // again — one declined attempt and it leaves the recovery pool for
        // good, with the reason erased alongside it.
        const newStatus = toTransactionStatus(gatewayRes.status)

        const statusChange = await db.$transaction(async (dbTx) => {
          await dbTx.transaction.update({
            where: { id: tx.id },
            data: {
              status: newStatus,
              retryCount: tx.retryCount + 1,
              gatewayRef: gatewayRes.transactionRef ?? tx.gatewayRef,
              gatewayResponse: gatewayRes as unknown as Prisma.InputJsonValue,
              failureReason: newStatus === 'SUCCESS'
                ? null
                : (gatewayRes.reason ?? gatewayRes.status ?? null),
              processedAt: newStatus === 'SUCCESS' ? new Date() : null,
            },
          })

          if (newStatus === 'SUCCESS') {
            return recalculateContributionStatus(tx.contributionId, dbTx)
          }
          return null
        })

        // After the commit, never inside it: the announcement is an HTTP call
        // and the transaction's timeout is five seconds.
        if (statusChange) await emitContributionStatusChange(statusChange)

        // Declined is not retried. The submission was made and refused; saying
        // otherwise put a TRANSACTION_RETRIED entry in the audit log for money
        // that never moved.
        return { success: newStatus !== 'FAILED', newStatus }
      } catch (err) {
        await db.transaction.update({
          where: { id: tx.id },
          data: {
            retryCount: tx.retryCount + 1,
            failureReason: err instanceof Error ? err.message : 'Retry failed',
          },
        })
        return { success: false }
      }
    })

    if (result.success) {
      retried++

      await step.run(`audit-${tx.id}`, () =>
        writeAuditLog({
          action: 'TRANSACTION_RETRIED',
          entity: 'Transaction',
          entityId: tx.id,
          payload: {
            attempt: tx.retryCount + 1,
            newStatus: 'newStatus' in result ? result.newStatus : undefined,
            source: 'transaction-retry-job',
          },
        }),
      )

      if ('newStatus' in result && result.newStatus === 'SUCCESS') {
        await step.run(`notify-${tx.id}`, () =>
          queueNotification({
            userId: tx.mandate.userId,
            templateSlug: 'debit-success',
            channel: 'SMS',
            payload: {
              mandateId: tx.mandate.id,
              amount: Number(tx.amount).toString(),
              transactionId: tx.id,
            },
          }),
        )
      }
    } else if ('newStatus' in result) {
      // Submitted and refused. Still FAILED, so the next run will try again
      // until the attempt cap.
      declined++
    } else {
      errored++
    }
  }

  await step.run('heartbeat', () => recordJobHeartbeat('transaction-retry-failed'))

  const summary = { total: candidates.length, retried, skipped, declined, errored }
  logger.info('Transaction retry job completed', summary)

  return summary
}

export const transactionRetryFailed = inngest.createFunction(
  {
    id: 'transaction-retry-failed',
    name: 'Retry Failed Transactions',
    // The entire recovery path for a collection that did not happen. Silence
    // here means every failed debit stays failed and nobody finds out until
    // the month closes.
    onFailure: alertOnFailure('The failed-transaction retry'),
  },
  { cron: '0 10 * * *' }, // 12:00 SAST (UTC+2)
  // Narrowed for the same reason as the debit run — see RetryStepRunner.
  ({ step }) => executeTransactionRetry(step as unknown as RetryStepRunner),
)
