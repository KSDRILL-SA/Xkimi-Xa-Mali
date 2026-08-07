import { Inngest, EventSchemas } from 'inngest'
import { env } from './env'

type XXMEvents = {
  'xxm/debit.morning-warning': { data: { date: string } }
  'xxm/debit.run': { data: { date: string } }
  'xxm/debit.overdue-reminder': { data: { date: string } }
  'xxm/contribution.month-rollover': { data: { month: number; year: number } }
  'xxm/contribution.overdue-sweep': { data: Record<string, never> }
  'xxm/contribution.ledger-reconciliation': { data: Record<string, never> }
  'xxm/transaction.retry-failed': { data: Record<string, never> }
  'xxm/mandate.delay-handler': {
    data: {
      mandateId: string
      userId: string
      newDate: string
      reason: string | null
    }
  }
  'xxm/notifications.flush': { data: Record<string, never> }
  'xxm/mandate.status-sync': { data: Record<string, never> }
  'xxm/invite.expiry': { data: Record<string, never> }
  'xxm/contribution.status.changed': {
    data: { userId: string; contributionId: string; status: string }
  }
  'xxm/goal.achieved': { data: { goalId: string; title: string } }
}

export const inngest = new Inngest({
  id: 'xkimm-xa-mali',
  eventKey: env.INNGEST_EVENT_KEY ?? 'local-dev-key',
  schemas: new EventSchemas().fromRecord<XXMEvents>(),
})

export const InngestEvents = {
  DEBIT_MORNING_WARNING: 'xxm/debit.morning-warning',
  DEBIT_RUN: 'xxm/debit.run',
  DEBIT_OVERDUE_REMINDER: 'xxm/debit.overdue-reminder',
  CONTRIBUTION_MONTH_ROLLOVER: 'xxm/contribution.month-rollover',
  CONTRIBUTION_OVERDUE_SWEEP: 'xxm/contribution.overdue-sweep',
  CONTRIBUTION_LEDGER_RECONCILIATION: 'xxm/contribution.ledger-reconciliation',
  TRANSACTION_RETRY_FAILED: 'xxm/transaction.retry-failed',
  MANDATE_DELAY_HANDLER: 'xxm/mandate.delay-handler',
  NOTIFICATIONS_FLUSH: 'xxm/notifications.flush',
  MANDATE_STATUS_SYNC: 'xxm/mandate.status-sync',
  INVITE_EXPIRY: 'xxm/invite.expiry',
  CONTRIBUTION_STATUS_CHANGED: 'xxm/contribution.status.changed',
  GOAL_ACHIEVED: 'xxm/goal.achieved',
} as const
