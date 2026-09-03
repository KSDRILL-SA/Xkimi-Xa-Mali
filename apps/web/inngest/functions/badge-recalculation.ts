import { inngest } from '@/lib/inngest'
import { recalculateAll, recalculateOne } from '@/services/badge.service'

export const badgeRecalculation = inngest.createFunction(
  { id: 'badge-recalculation', name: 'Badge Recalculation' },
  [
    { cron: '0 2 1 * *' }, // 04:00 SAST (UTC+2), 1st of each month — after the contribution rollover
    { event: 'xxm/contribution.status.changed' },
  ],
  async ({ event, step }) => {
    if (event?.name === 'xxm/contribution.status.changed') {
      const { userId, status } = event.data

      /**
       * Every status change, not only PAID and OVERDUE.
       *
       * This used to skip anything else, on the reasoning that a badge goes up
       * when somebody pays and into grace when they fall behind. What that
       * missed is that money can also be taken back OUT.
       *
       * A reversal moves a contribution from PAID to PENDING, and PENDING was
       * neither of the two, so the job returned `{ skipped: true }` and the
       * badge kept a score it had earned from a payment that no longer exists.
       * Found by the member who watched their own badge rise on a R100 payment
       * and not move when that payment was reversed — the payment having come
       * from a stand-in gateway that never contacted a bank.
       *
       * Every input to the score is derived from contribution status and
       * amountPaid: paid months, on-time months, overdue count, the streak
       * walk, the average contribution. There is no status transition that
       * leaves all of those unchanged, so there is none worth filtering out.
       * A recalculation is one member and a handful of queries; a stale badge
       * is a member being credited for money the Foundation does not have.
       */
      const trigger =
        status === 'PAID' ? 'contribution_paid'
        : status === 'OVERDUE' ? 'contribution_overdue'
        : `contribution_${String(status).toLowerCase()}`

      await step.run('recalculate-one', () => recalculateOne(userId, trigger))
      return { recalculated: 1 }
    }

    const processed = await step.run('recalculate-all', () => recalculateAll('monthly_recalc'))
    return { recalculated: processed }
  },
)
