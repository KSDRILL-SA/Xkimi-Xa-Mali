import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { paymentGateway } from '@/integrations/payment'
import { logger } from '@xxm/observability'
import { writeAuditLog } from '@/services/audit.service'
import type { MandateStatus } from '@prisma/client'

/**
 * Nightly reconciliation: pull fresh status from Netcash for every non-terminal
 * mandate and update our DB if the status differs. Catches out-of-band changes
 * (bank declines, consumer-side cancellations) that never produce a webhook.
 */
export const mandateStatusSync = inngest.createFunction(
  { id: 'mandate-status-sync', name: 'Mandate Status Reconciliation' },
  { cron: '0 2 * * *' }, // 04:00 SAST (UTC+2) — low traffic window
  async ({ step }) => {
    const mandates = await step.run('fetch-active-mandates', () =>
      db.paymentMandate.findMany({
        where: { status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] }, netcashMandateId: { not: null } },
        select: { id: true, netcashMandateId: true, status: true, userId: true },
      }),
    )

    let synced = 0
    let unchanged = 0
    let failed = 0

    for (const mandate of mandates) {
      try {
        const result = await step.run(`sync-${mandate.id}`, async () => {
          const gatewayRes = await paymentGateway.getMandateStatus(mandate.netcashMandateId!)
          const newStatus = paymentGateway.mapMandateStatus(gatewayRes.status) as MandateStatus

          // Idempotent: skip if already matching
          if (mandate.status === newStatus) return 'unchanged'

          await db.paymentMandate.update({
            where: { id: mandate.id },
            data: { status: newStatus },
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

          logger.info('Mandate status synced', {
            mandateId: mandate.id,
            from: mandate.status,
            to: newStatus,
          })

          return 'synced'
        })

        if (result === 'synced') synced++
        else unchanged++
      } catch (err) {
        logger.warn('Mandate status sync failed for mandate', { mandateId: mandate.id, err })
        failed++
      }
    }

    return { total: mandates.length, synced, unchanged, failed }
  },
)
