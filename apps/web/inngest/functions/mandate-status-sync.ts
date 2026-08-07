import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { paymentGateway } from '@/integrations/payment'
import { logger } from '@xxm/observability'
import { writeAuditLog } from '@/services/audit.service'
import { queueNotification } from '@/services/notification.service'
import type { MandateStatus } from '@prisma/client'

/**
 * Nightly reconciliation: pull fresh status from Netcash for every non-terminal
 * mandate and update our DB if the status differs. Catches out-of-band changes
 * (bank declines, consumer-side cancellations) that never produce a webhook.
 */
export type StatusSyncStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export async function executeMandateStatusSync(step: StatusSyncStepRunner) {
  const mandates = await step.run('fetch-active-mandates', () =>
    db.paymentMandate.findMany({
      where: { status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] }, netcashMandateId: { not: null } },
      select: { id: true, netcashMandateId: true, status: true, userId: true },
    }),
  )

  let synced = 0
  let unchanged = 0
  let failed = 0
  let unrecognised = 0

  for (const mandate of mandates) {
    try {
      const result = await step.run(`sync-${mandate.id}`, async () => {
        const gatewayRes = await paymentGateway.getMandateStatus(mandate.netcashMandateId!)
        const newStatus = paymentGateway.mapMandateStatus(gatewayRes.status)

        // A status we cannot read is not a status change. Both adapters used to
        // guess — SUSPENDED on the real one, PENDING on the mock — and either
        // took the mandate out of ACTIVE, which is the only status the debit run
        // collects from. One unfamiliar code and a member stopped being debited
        // with nothing said to anyone.
        if (newStatus === null) {
          logger.error('Unrecognised mandate status from the gateway — mandate left unchanged', {
            mandateId: mandate.id,
            gatewayStatus: gatewayRes.status,
          })
          return 'unrecognised' as const
        }

        // Idempotent: skip if already matching
        if (mandate.status === newStatus) return 'unchanged' as const

        await db.paymentMandate.update({
          where: { id: mandate.id },
          data: { status: newStatus as MandateStatus },
        })

        await writeAuditLog({
          action: 'MANDATE_STATUS_SYNCED',
          entity: 'PaymentMandate',
          entityId: mandate.id,
          payload: {
            netcashMandateId: mandate.netcashMandateId,
            previousStatus: mandate.status,
            newStatus,
            source: 'status-sync-job',
          },
        })

        // Cancelled at the bank, out of band. Without this the member's
        // contributions simply stop and the first they hear of it is a gap in
        // their statement — `mandate-cancelled` has been seeded since the
        // templates were written and nothing has ever sent it.
        if (newStatus === 'CANCELLED') {
          await queueNotification({
            userId: mandate.userId,
            templateSlug: 'mandate-cancelled',
            channel: 'SMS',
            payload: { mandateId: mandate.id },
          })
        }

        logger.info('Mandate status synced', {
          mandateId: mandate.id,
          from: mandate.status,
          to: newStatus,
        })

        return 'synced' as const
      })

      if (result === 'synced') synced++
      else if (result === 'unrecognised') unrecognised++
      else unchanged++
    } catch (err) {
      logger.warn('Mandate status sync failed for mandate', { mandateId: mandate.id, err })
      failed++
    }
  }

  return { total: mandates.length, synced, unchanged, failed, unrecognised }
}

export const mandateStatusSync = inngest.createFunction(
  { id: 'mandate-status-sync', name: 'Mandate Status Reconciliation' },
  { cron: '0 2 * * *' }, // 04:00 SAST (UTC+2) — low traffic window
  ({ step }) => executeMandateStatusSync(step as unknown as StatusSyncStepRunner),
)
