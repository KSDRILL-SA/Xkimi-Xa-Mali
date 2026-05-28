import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import {
  debitMorningWarning,
  debitRun,
  debitOverdueReminder,
  contributionMonthRollover,
  mandateDelayHandler,
  notificationFlush,
} from '@/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    debitMorningWarning,
    debitRun,
    debitOverdueReminder,
    contributionMonthRollover,
    mandateDelayHandler,
    notificationFlush,
  ],
})
