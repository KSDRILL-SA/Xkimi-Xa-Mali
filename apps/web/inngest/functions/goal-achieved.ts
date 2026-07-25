import { inngest } from '@/lib/inngest'
import { logger } from '@/lib/logger'
import { celebrateGoalAchieved } from '@/services/goal.service'

// When a goal reaches its target, congratulate the whole group in their inbox —
// the payoff moment that makes every contribution feel worth it.
export const goalAchievedCelebration = inngest.createFunction(
  { id: 'goal-achieved-celebration', name: 'Goal Achieved Celebration' },
  { event: 'xxm/goal.achieved' },
  async ({ event, step }) => {
    const notified = await step.run('celebrate', () => celebrateGoalAchieved(event.data.title))
    logger.info('Goal-achieved celebration sent', { goalId: event.data.goalId, notified })
    return { notified }
  },
)
