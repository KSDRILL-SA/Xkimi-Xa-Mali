import { inngest } from '@/lib/inngest'
import { markExpiredGoalsFailed } from '@/services/goal.service'

export const goalDeadlineChecker = inngest.createFunction(
  { id: 'goal-deadline-checker', name: 'Goal Deadline Checker' },
  { cron: '0 1 * * *' }, // 03:00 SAST (UTC+2) daily
  async ({ step }) => {
    const expired = await step.run('mark-expired-goals-failed', () =>
      markExpiredGoalsFailed(),
    )

    return { expiredGoalsMarkedFailed: expired }
  },
)
