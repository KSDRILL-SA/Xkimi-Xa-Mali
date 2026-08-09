import { inngest } from '@/lib/inngest'
import { collectDuePlans } from '@/services/goal-plan.service'

/**
 * Carries out members' standing commitments to their goals.
 *
 * Daily rather than monthly because plans do not share a collection day — each
 * member picks their own, and a plan set to a day past the end of a short month
 * collects on that month's last day instead.
 *
 * Running every day is safe to repeat. A plan is stamped with the period it
 * collected for before the charge is submitted, and the payment itself carries
 * an idempotency key built from the plan and that same period, so neither a
 * second run today nor a retry of this one can charge a member twice.
 */
export const goalPlanCollection = inngest.createFunction(
  { id: 'goal-plan-collection', name: 'Goal Plan Collection' },
  { cron: '0 4 * * *' }, // 06:00 SAST (UTC+2) daily
  async ({ step }) => {
    return step.run('collect-due-plans', () => collectDuePlans())
  },
)
