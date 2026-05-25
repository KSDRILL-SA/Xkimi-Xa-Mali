import { Inngest } from 'inngest'
import { env } from './env'

export const inngest = new Inngest({
  id: 'xkimm-xa-mali',
  eventKey: env.INNGEST_EVENT_KEY,
})

export const InngestEvents = {
  DEBIT_MORNING_WARNING: 'xxm/debit.morning-warning',
  DEBIT_RUN: 'xxm/debit.run',
  DEBIT_OVERDUE_REMINDER: 'xxm/debit.overdue-reminder',
  CONTRIBUTION_MONTH_ROLLOVER: 'xxm/contribution.month-rollover',
  MANDATE_DELAY_HANDLER: 'xxm/mandate.delay-handler',
} as const
