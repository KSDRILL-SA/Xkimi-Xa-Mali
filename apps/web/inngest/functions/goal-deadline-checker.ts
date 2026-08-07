import { inngest } from '@/lib/inngest'
import { logger } from '@xxm/observability'
import { markExpiredGoalsFailed } from '@/services/goal.service'
import { queueNotification } from '@/services/notification.service'
import { createInboxMessages } from '@/services/inbox.service'
import { env } from '@/lib/env'

/**
 * Nightly: a Goal whose deadline has passed without reaching target is marked
 * Failed, and the members who pledged toward it are told.
 *
 * The telling is the part that was missing. This job marked goals Failed and
 * returned a count, in silence — a Goal the circle had pledged toward went
 * Failed overnight and nobody heard. The guide promises the opposite twice:
 * "You are told when … a Goal you care about has news", and "A Goal fails to
 * reach target → it is marked Failed and no funds are released."
 *
 * `goal-achieved.ts` already notifies on the happy ending. Only the
 * disappointing one was quiet, which is the wrong way round.
 */
export type GoalDeadlineStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export async function executeGoalDeadlineCheck(step: GoalDeadlineStepRunner) {
  const failed = await step.run('mark-expired-goals-failed', () => markExpiredGoalsFailed())

  // Counters live out here. A completed step is not executed again when Inngest
  // re-enters the function — its recorded value is returned — so a total
  // accumulated inside one stops climbing after the first pass and the run
  // reports having done nothing while having done everything.
  let membersNotified = 0

  for (const goal of failed) {
    if (goal.pledgerIds.length === 0) continue

    await step.run(`notify-failed-${goal.id}`, async () => {
      const payload = {
        goal: goal.title,
        url: `${env.NEXTAUTH_URL ?? ''}/dashboard/goals`,
      }

      // In-app for everyone who pledged, in one write.
      await createInboxMessages(goal.pledgerIds, {
        title: `"${goal.title}" did not reach its target`,
        body:
          `The deadline for "${goal.title}" has passed without reaching its target, ` +
          `so it has been marked Failed. No funds have been released, and nothing you ` +
          `contributed has left the pool.`,
        category: 'GOAL',
      })

      // And on SMS, which is where most of the circle actually reads things.
      // Not in MANDATORY_SLUGS: this is news about a goal, not about money
      // moving out of a member's own balance, so a member who has switched
      // SMS off is entitled to not receive it.
      for (const userId of goal.pledgerIds) {
        await queueNotification({
          userId, templateSlug: 'goal-failed', channel: 'SMS', payload,
        })
      }
    })

    membersNotified += goal.pledgerIds.length
  }

  if (failed.length > 0) {
    logger.info('Goals marked failed at deadline', {
      goals: failed.length,
      membersNotified,
    })
  }

  return { expiredGoalsMarkedFailed: failed.length, membersNotified }
}

export const goalDeadlineChecker = inngest.createFunction(
  { id: 'goal-deadline-checker', name: 'Goal Deadline Checker' },
  { cron: '0 1 * * *' }, // 03:00 SAST (UTC+2) daily
  ({ step }) => executeGoalDeadlineCheck(step as unknown as GoalDeadlineStepRunner),
)
