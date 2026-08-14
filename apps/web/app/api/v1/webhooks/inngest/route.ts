import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import {
  debitMorningWarning,
  debitRun,
  debitOverdueReminder,
  contributionDueReminder,
  contributionMonthRollover,
  contributionOverdueSweep,
  ledgerReconciliation,
  transactionRetryFailed,
  mandateDelayHandler,
  notificationFlush,
  goalDeadlineChecker,
  goalAchievedCelebration,
  goalPlanCollection,
  mandateStatusSync,
  inviteExpiry,
  badgeRecalculation,
  badgeGraceCheck,
  financialAnomalyWatch,
  retentionSurvey,
  dsrDeadlineCheck,
  backupWatch,
  monthlyStatementNotice,
  jobHeartbeatCheck,
} from '@/inngest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    debitMorningWarning,
    debitRun,
    debitOverdueReminder,
    contributionDueReminder,
    contributionMonthRollover,
    contributionOverdueSweep,
    ledgerReconciliation,
    transactionRetryFailed,
    mandateDelayHandler,
    notificationFlush,
    goalDeadlineChecker,
    goalAchievedCelebration,
    goalPlanCollection,
    mandateStatusSync,
    inviteExpiry,
    badgeRecalculation,
    badgeGraceCheck,
    financialAnomalyWatch,
    retentionSurvey,
    dsrDeadlineCheck,
    backupWatch,
    monthlyStatementNotice,
    // A function that exists but is not in this array is registered nowhere and
    // runs never — the exact failure this one was added to detect. The list is
    // held to `@/inngest` by a test.
    jobHeartbeatCheck,
  ],
})
