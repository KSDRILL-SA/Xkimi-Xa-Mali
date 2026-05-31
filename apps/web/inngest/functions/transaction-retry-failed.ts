import { Prisma } from '@prisma/client'
import type { TransactionStatus } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { paymentGateway } from '@/integrations/payment'
import { recalculateContributionStatus } from '@/services/contribution.service'
import { writeAuditLog } from '@/services/audit.service'
import { queueNotification } from '@/services/notification.service'
import { MAX_TRANSACTION_RETRY } from '@xxm/utils'

export const transactionRetryFailed = inngest.createFunction(
  { id: 'transaction-retry-failed', name: 'Retry Failed Transactions' },
  { cron: '0 10 * * *' }, // 12:00 SAST (UTC+2)
  async ({ step }) => {
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

    let retried = 0
    let skipped = 0

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
            amount: Number(tx.amount),
            reference: `XXM-RETRY-${tx.id.slice(-8)}`,
            idempotencyKey: `retry:${tx.idempotencyKey}:${tx.retryCount + 1}`,
          })

          const newStatus: TransactionStatus =
            gatewayRes.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING'

          await db.$transaction(async (dbTx) => {
            await dbTx.transaction.update({
              where: { id: tx.id },
              data: {
                status: newStatus,
                retryCount: tx.retryCount + 1,
                gatewayRef: gatewayRes.transactionRef ?? tx.gatewayRef,
                gatewayResponse: gatewayRes as unknown as Prisma.InputJsonValue,
                failureReason: null,
                processedAt: newStatus === 'SUCCESS' ? new Date() : null,
              },
            })

            if (newStatus === 'SUCCESS') {
              await recalculateContributionStatus(tx.contributionId, dbTx)
            }
          })

          return { success: true, newStatus }
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
              newStatus: result.newStatus,
              source: 'transaction-retry-job',
            },
          }),
        )

        if (result.newStatus === 'SUCCESS') {
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
      } else {
        skipped++
      }
    }

    logger.info('Transaction retry job completed', {
      total: candidates.length,
      retried,
      skipped,
    })

    return { total: candidates.length, retried, skipped }
  },
)
