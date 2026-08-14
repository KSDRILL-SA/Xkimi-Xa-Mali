import { db } from '@/lib/db'

/**
 * POPIA section 14: personal information may not be kept longer than is
 * necessary for the purpose it was collected for, unless a law requires
 * otherwise.
 *
 * The Foundation had a retention *policy* and no mechanism, which is the
 * ordinary way this obligation is failed — not by keeping the wrong thing, but
 * by nobody ever looking.
 *
 * **This module reports. It does not delete.**
 *
 * That is a deliberate choice and not a half-measure. An automatic deleter whose
 * periods are wrong destroys members' financial records irreversibly, and the
 * periods below are *proposals* pending the accountant's advice (see
 * `docs/compliance/popia-compliance.md` §6, gap 4). A survey that tells a human
 * "these 412 rows are past their period" every month converts an invisible
 * obligation into a visible decision, at none of that risk. Deletion can be
 * added once the periods are settled and someone has read a few months of these
 * reports and agreed the counts look right.
 *
 * The audit log is deliberately absent from this survey. The constitution
 * forbids its deletion, and it is retained permanently by design.
 */

/** Days. Provisional until confirmed with the Foundation's accountant. */
export const RETENTION_DAYS = {
  /**
   * Login history exists to detect unauthorised access. That purpose expires;
   * the IP addresses in it are personal information that does not.
   */
  loginHistory: 365,
  /**
   * An invitation that was never used, or was revoked, is personal information
   * about someone who never became a member — the weakest claim to retention
   * anywhere in the system.
   */
  spentInvitation: 180,
  /**
   * Delivery records prove a member was told something. Two years covers the
   * period in which that is likely to be disputed.
   */
  notification: 730,
} as const

export type RetentionFinding = {
  category: string
  count: number
  olderThan: string
  policyDays: number
  /** What the record is, in the terms a non-engineer would use. */
  describes: string
}

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * Counts what is past its retention period. Reads only.
 *
 * Returns one finding per category with anything to report; categories that are
 * clean are omitted, so an empty array means there is nothing to decide.
 */
export async function surveyRetention(): Promise<RetentionFinding[]> {
  const loginCutoff = cutoff(RETENTION_DAYS.loginHistory)
  const inviteCutoff = cutoff(RETENTION_DAYS.spentInvitation)
  const notifCutoff = cutoff(RETENTION_DAYS.notification)

  const [loginHistory, spentInvitations, notifications] = await Promise.all([
    db.loginHistory.count({ where: { createdAt: { lt: loginCutoff } } }),
    db.invitation.count({
      // Only invitations that can no longer become a member. A PENDING one is
      // still live however old it looks, and expiring it is invite-expiry's job.
      where: {
        status: { in: ['EXPIRED', 'REVOKED'] },
        createdAt: { lt: inviteCutoff },
      },
    }),
    db.notification.count({ where: { createdAt: { lt: notifCutoff } } }),
  ])

  const findings: RetentionFinding[] = [
    {
      category: 'Login history',
      count: loginHistory,
      olderThan: loginCutoff.toISOString().slice(0, 10),
      policyDays: RETENTION_DAYS.loginHistory,
      describes: 'sign-in records, including IP addresses',
    },
    {
      category: 'Spent invitations',
      count: spentInvitations,
      olderThan: inviteCutoff.toISOString().slice(0, 10),
      policyDays: RETENTION_DAYS.spentInvitation,
      describes: 'expired or revoked invitations, holding the ID number of someone who never joined',
    },
    {
      category: 'Notification records',
      count: notifications,
      olderThan: notifCutoff.toISOString().slice(0, 10),
      policyDays: RETENTION_DAYS.notification,
      describes: 'delivery records for messages sent to members',
    },
  ]

  return findings.filter((f) => f.count > 0)
}
