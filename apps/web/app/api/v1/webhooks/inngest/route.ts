import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import {
  debitMorningWarning,
  debitRun,
  debitOverdueReminder,
  contributionMonthRollover,
  contributionOverdueSweep,
  ledgerReconciliation,
  transactionRetryFailed,
  mandateDelayHandler,
  notificationFlush,
  goalDeadlineChecker,
  mandateStatusSync,
  inviteExpiry,
  badgeRecalculation,
  badgeGraceCheck,
} from '@/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    debitMorningWarning,
    debitRun,
    debitOverdueReminder,
    contributionMonthRollover,
    contributionOverdueSweep,
    ledgerReconciliation,
    transactionRetryFailed,
    mandateDelayHandler,
    notificationFlush,
    goalDeadlineChecker,
    mandateStatusSync,
    inviteExpiry,
    badgeRecalculation,
    badgeGraceCheck,
  ],
})
