import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { paymentGateway } from '@/integrations/payment'
import { logger } from '@xxm/observability'
import { writeAuditLog } from '@/services/audit.service'
import { queueNotification } from '@/services/notification.service'
import type { MandateStatus } from '@prisma/client'
import { recordJobHeartbeat } from '@/lib/job-heartbeat'
import { raiseOperationalAlert } from '@/services/alert.service'

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
      where: {
        netcashMandateId: { not: null },
        OR: [
          { status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] } },
          // A cancellation the gateway refused.
          //
          // Cancelling writes CANCELLED locally and tells Netcash second, so a
          // failed gateway call leaves this system saying cancelled while the
          // authorisation still stands at the bank. This job read only the
          // three live statuses, so a locally-cancelled mandate was never
          // examined again — and the divergence lived nowhere but an alert
          // somebody had to have been reading at the time.
          //
          // Including it here is what makes the state recoverable rather than
          // merely recorded: the next run asks the gateway what it actually
          // holds.
          { gatewaySync: { not: 'IN_SYNC' } },
        ],
      },
      select: { id: true, netcashMandateId: true, status: true, userId: true, gatewaySync: true },
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

        // Suspended, which the member did not ask for and nobody chose.
        //
        // Appendix A §15.2.1: the bank suspends a mandate automatically after
        // the seventh consecutive unsuccessful collection. The debit run only
        // collects from ACTIVE mandates, so the effect is that the member's
        // contributions simply stop — and until now the only trace was this
        // job's log line.
        //
        // The comment above says exactly why that is not acceptable for a
        // cancellation. It is more true here, because a cancellation is at
        // least somebody's decision. §15.11 also puts a clock on it: thirteen
        // months to reinstate or the mandate leaves the register entirely.
        if (newStatus === 'SUSPENDED') {
          await queueNotification({
            userId: mandate.userId,
            templateSlug: 'mandate-suspended',
            channel: 'SMS',
            payload: { mandateId: mandate.id },
          })

          await raiseOperationalAlert({
            code: 'MANDATE_SUSPENDED_BY_BANK',
            severity: 'warning',
            title: 'A debit order was suspended by the bank',
            entityId: mandate.id,
            body: [
              'The bank has suspended this debit order, which it does after seven',
              'consecutive failed collections. Nothing further will be collected',
              'from this member until it is reinstated.',
              '',
              'Reinstating needs the member to authorise it again. There are',
              'thirteen months before the mandate leaves the register for good.',
            ].join(String.fromCharCode(10)),
            payload: { mandateId: mandate.id, userId: mandate.userId },
          }).catch(() => {})
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

  await step.run('heartbeat', () => recordJobHeartbeat('mandate-status-sync'))

  return { total: mandates.length, synced, unchanged, failed, unrecognised }
}

export const mandateStatusSync = inngest.createFunction(
  { id: 'mandate-status-sync', name: 'Mandate Status Reconciliation' },
  { cron: '0 2 * * *' }, // 04:00 SAST (UTC+2) — low traffic window
  ({ step }) => executeMandateStatusSync(step as unknown as StatusSyncStepRunner),
)
