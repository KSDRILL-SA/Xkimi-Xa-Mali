import { db } from '@/lib/db'
import { assertAdmin, writeAuditLog, AdminNotFoundError, AdminConflictError } from './shared'

/**
 * What a deletion request can and cannot actually be given.
 *
 * `DataSubjectRequest` can record that someone asked to be deleted, and it can
 * record what they were told. Between those two there was nothing: no way to
 * find out what the Foundation actually holds about a person, so the answer to a
 * deletion request was assembled from memory by whichever administrator picked
 * it up. A request could be closed COMPLETED with no code having deleted
 * anything, and nothing about the record would look wrong afterwards.
 *
 * ## Why this assesses before it erases
 *
 * Almost nothing about an active member is lawfully erasable, and saying so
 * precisely is most of the work. POPIA section 14 permits — and tax and
 * accounting law requires — that financial records be kept, so the honest answer
 * to most deletion requests is partial refusal with itemised reasons. Section 23
 * gives the requester the right to be told what is held; a refusal without
 * grounds is itself a contravention. So the artefact this module produces is the
 * reasoned inventory, and erasure is what happens to the part of it that has no
 * remaining basis.
 *
 * ## Why erasing here does not contradict the retention survey
 *
 * `retention.service.ts` in the member app deliberately reports and never
 * deletes, because an automatic sweep running on provisional periods would
 * destroy financial records irreversibly and unattended. Nothing here is
 * automatic. It runs when an administrator, answering a named request from a
 * person whose identity they have verified, asks for it — and it touches only
 * the categories this assessment has already shown to have no remaining basis.
 * A person exercising a statutory right is the one trigger that ought to cause
 * deletion; a cron at 05:00 is not.
 *
 * ## The periods below are still provisional
 *
 * They mirror `docs/compliance/popia-compliance.md` §6, where they are marked as
 * proposals pending the accountant's advice (gap 4, still open). Every date this
 * module produces is therefore provisional too, and the assessment says so. What
 * is *not* provisional is the shape: identity and money are retained, security
 * telemetry expires, and the audit log is permanent.
 */

/** Years. Provisional — see `docs/compliance/popia-compliance.md` §6, gap 4. */
export const RETENTION_YEARS = {
  /** Member identity and contact: duration of membership plus this. */
  identity: 5,
  /** Contribution, transaction and ledger records, after the financial year. */
  financial: 5,
  /** Mandate records, after cancellation. */
  mandate: 5,
} as const

/** Days, for the categories whose purpose expires on its own. */
export const RETENTION_DAYS = {
  /** Login history exists to detect unauthorised access; that purpose expires. */
  loginHistory: 365,
  /** Delivery records prove a member was told something. */
  notification: 730,
} as const

export type Disposition =
  /** No remaining basis to hold it. This is what erasure acts on. */
  | 'ERASABLE_NOW'
  /** A basis still applies. Erasable later, on the date given. */
  | 'RETAINED'
  /** Never erasable, and not because of a period. */
  | 'PERMANENT'

export type ErasureCategory = {
  key: string
  /** What this is, in the words an administrator can repeat to the requester. */
  label: string
  count: number
  disposition: Disposition
  /** Why it is kept, or why it need not be. Goes into the answer verbatim. */
  basis: string
  /** When it becomes erasable. Null when erasable now, or never. */
  erasableFrom: Date | null
}

export type ErasureAssessment = {
  subjectId: string
  subjectName: string
  /** Null while they are still a member — most periods run from departure. */
  membershipEndedAt: Date | null
  categories: ErasureCategory[]
  /** How many records the erase step would actually remove. */
  erasableCount: number
  /** True while any period is still running, so the answer must be partial. */
  hasRetainedData: boolean
}

function addYears(from: Date, years: number): Date {
  const d = new Date(from)
  d.setFullYear(d.getFullYear() + years)
  return d
}

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

/**
 * Itemise everything held about one person, and say what may go.
 *
 * Reads only. Safe to run as often as an administrator wants while drafting an
 * answer, and it is the same call the erase step re-runs to decide what to act
 * on — so the preview an administrator approved and the work that is done cannot
 * drift apart.
 */
export async function assessErasure(
  adminRoles: string[],
  subjectId: string,
): Promise<ErasureAssessment> {
  assertAdmin(adminRoles)

  const user = await db.user.findUnique({
    where: { id: subjectId },
    select: { id: true, firstName: true, lastName: true, resignedAt: true, deletedAt: true },
  })
  if (!user) throw new AdminNotFoundError('That member could not be found')

  // Most periods run from when the person stopped being a member. While they
  // are still one, the purpose is live and nothing identity-shaped has expired.
  const membershipEndedAt = user.deletedAt ?? user.resignedAt ?? null

  const loginCutoff = cutoff(RETENTION_DAYS.loginHistory)
  const notifCutoff = cutoff(RETENTION_DAYS.notification)

  const [
    staleLogins,
    staleNotifications,
    contributions,
    transactions,
    paymentProofs,
    mandates,
    bankAccounts,
    auditEntries,
    communityMessages,
    acceptedInvitation,
  ] = await Promise.all([
    db.loginHistory.count({ where: { userId: subjectId, createdAt: { lt: loginCutoff } } }),
    db.notification.count({ where: { userId: subjectId, createdAt: { lt: notifCutoff } } }),
    db.contribution.count({ where: { userId: subjectId } }),
    // Transactions carry no userId of their own — they belong to a contribution,
    // which belongs to the member. Counting them any other way would silently
    // report zero.
    db.transaction.count({ where: { contribution: { userId: subjectId } } }),
    // Counted separately from the transactions themselves, because it is a
    // different kind of thing to hold. A ledger row is a number; a proof of
    // payment is the member's own bank document, showing an account number and
    // often a balance. Somebody asking what the Foundation holds about them is
    // entitled to be told that specifically, not to have it folded silently
    // into "payments".
    db.transaction.count({
      where: { contribution: { userId: subjectId }, proofUrl: { not: null } },
    }),
    db.paymentMandate.count({ where: { userId: subjectId } }),
    db.bankAccount.count({ where: { userId: subjectId } }),
    db.auditLog.count({ where: { userId: subjectId } }),
    db.communityMessage.count({ where: { userId: subjectId } }),
    db.invitation.count({ where: { acceptedById: subjectId } }),
  ])

  const identityErasableFrom = membershipEndedAt
    ? addYears(membershipEndedAt, RETENTION_YEARS.identity)
    : null

  const categories: ErasureCategory[] = [
    {
      key: 'identity',
      label: 'Name, email address, phone number, ID number and address',
      count: 1,
      disposition:
        identityErasableFrom && identityErasableFrom <= new Date() ? 'ERASABLE_NOW' : 'RETAINED',
      basis: membershipEndedAt
        ? `Kept for ${RETENTION_YEARS.identity} years after membership ended, for accounting and any legal claim.`
        : 'Kept while they are a member — it is what the account and the contributions are attached to.',
      erasableFrom: identityErasableFrom,
    },
    {
      key: 'financial',
      label: 'Contributions, payments and ledger entries',
      count: contributions + transactions,
      disposition: 'RETAINED',
      // Deliberately not computed per-record. The period runs from the end of
      // the financial year each record falls in, and the Foundation's financial
      // year is not modelled anywhere yet. Saying "retained" without a date is
      // honest; inventing a date would not be.
      basis: `Tax and accounting law requires these to be kept for ${RETENTION_YEARS.financial} years after the financial year they fall in. They cannot be deleted on request.`,
      erasableFrom: null,
    },
    {
      key: 'paymentProofs',
      label: 'Proof-of-payment documents they sent — bank confirmations, deposit slips, screenshots',
      count: paymentProofs,
      disposition: 'RETAINED',
      basis:
        'The evidence that a payment recorded by leadership actually happened. Kept with the payment it belongs to, for as long as the payment is kept, because a financial record with the proof removed is no longer a record anybody can check.',
      erasableFrom: null,
    },
    {
      key: 'mandates',
      label: 'Debit order mandates and bank account details',
      count: mandates + bankAccounts,
      disposition: 'RETAINED',
      basis: `Proof that a debit was authorised. Kept for ${RETENTION_YEARS.mandate} years after the mandate is cancelled, in case the authorisation is ever disputed.`,
      erasableFrom: null,
    },
    {
      key: 'invitation',
      label: 'The invitation they joined on, including the ID number recorded on it',
      count: acceptedInvitation,
      disposition: 'RETAINED',
      basis: 'Holds the identity the Foundation was given when they were vouched for. Kept with the membership record.',
      erasableFrom: identityErasableFrom,
    },
    {
      key: 'loginHistory',
      label: 'Sign-in records, including IP addresses',
      count: staleLogins,
      disposition: staleLogins > 0 ? 'ERASABLE_NOW' : 'RETAINED',
      basis:
        staleLogins > 0
          ? `Kept to detect unauthorised access. That purpose expires after ${RETENTION_DAYS.loginHistory} days, and these are older.`
          : `Kept for ${RETENTION_DAYS.loginHistory} days to detect unauthorised access.`,
      erasableFrom: null,
    },
    {
      key: 'notifications',
      label: 'Records of messages sent to them',
      count: staleNotifications,
      disposition: staleNotifications > 0 ? 'ERASABLE_NOW' : 'RETAINED',
      basis:
        staleNotifications > 0
          ? `Proof they were told something. Kept ${RETENTION_DAYS.notification} days, and these are older.`
          : `Proof they were told something, kept for ${RETENTION_DAYS.notification} days.`,
      erasableFrom: null,
    },
    {
      key: 'auditLog',
      label: 'The audit log of actions taken on the account',
      count: auditEntries,
      disposition: 'PERMANENT',
      basis:
        'The constitution forbids deletion of the audit log. It is the record that makes every other record trustworthy, including the record of this request.',
      erasableFrom: null,
    },
    {
      key: 'community',
      label: 'Messages they posted to the community board',
      count: communityMessages,
      disposition: 'RETAINED',
      basis:
        'Written by them and read by others. Removed on request as a separate decision, because deleting them changes conversations other members took part in.',
      erasableFrom: null,
    },
  ]

  return {
    subjectId,
    subjectName: `${user.firstName} ${user.lastName}`.trim(),
    membershipEndedAt,
    categories,
    erasableCount: categories
      .filter((c) => c.disposition === 'ERASABLE_NOW')
      .reduce((sum, c) => sum + c.count, 0),
    hasRetainedData: categories.some((c) => c.disposition === 'RETAINED' && c.count > 0),
  }
}

/**
 * Erase the categories that have no remaining basis, and nothing else.
 *
 * Re-runs the assessment inside the call rather than trusting a list passed in,
 * so a stale preview cannot authorise deleting something that has since become
 * retained — and so a caller cannot name a category the assessment did not
 * clear.
 *
 * `requestId` is required. Erasure is an answer to a request, and an erasure
 * that cannot be tied to the request that prompted it is indistinguishable
 * afterwards from an administrator quietly deleting a member's history.
 */
export async function eraseErasableData(
  adminRoles: string[],
  adminId: string,
  input: { subjectId: string; requestId: string },
): Promise<{ assessment: ErasureAssessment; deleted: Record<string, number> }> {
  assertAdmin(adminRoles)

  const request = await db.dataSubjectRequest.findUnique({ where: { id: input.requestId } })
  if (!request) throw new AdminNotFoundError('Request not found')
  if (request.kind !== 'DELETION') {
    throw new AdminConflictError('Only a deletion request can authorise erasure')
  }
  if (request.status === 'COMPLETED' || request.status === 'REFUSED') {
    throw new AdminConflictError('This request is already closed')
  }

  const assessment = await assessErasure(adminRoles, input.subjectId)
  const erasable = new Set(
    assessment.categories.filter((c) => c.disposition === 'ERASABLE_NOW').map((c) => c.key),
  )

  const deleted: Record<string, number> = {}

  // One transaction: a half-finished erasure would leave the Foundation unable
  // to say what it still holds, which is worse than not having started.
  await db.$transaction(async (tx) => {
    if (erasable.has('loginHistory')) {
      const { count } = await tx.loginHistory.deleteMany({
        where: { userId: input.subjectId, createdAt: { lt: cutoff(RETENTION_DAYS.loginHistory) } },
      })
      deleted.loginHistory = count
    }
    if (erasable.has('notifications')) {
      const { count } = await tx.notification.deleteMany({
        where: { userId: input.subjectId, createdAt: { lt: cutoff(RETENTION_DAYS.notification) } },
      })
      deleted.notifications = count
    }
    // `identity` is deliberately absent. Anonymising the user row detaches every
    // financial record from the person they belong to, and those records must
    // still be attributable for as long as they are retained. Once the identity
    // period has genuinely run, the whole account is removable rather than
    // partially rewritten — a different operation, needing its own decision, and
    // not one to bury inside a request handler.
  })

  await writeAuditLog({
    userId: adminId,
    action: 'DSR_ERASURE_EXECUTED',
    entity: 'User',
    entityId: input.subjectId,
    payload: {
      requestId: input.requestId,
      deleted,
      // What was kept, and why, recorded next to what was removed. This is the
      // evidence that the refusal-in-part was reasoned rather than convenient.
      retained: assessment.categories
        .filter((c) => c.disposition !== 'ERASABLE_NOW' && c.count > 0)
        .map((c) => ({ key: c.key, count: c.count, basis: c.basis })),
    },
  })

  return { assessment: await assessErasure(adminRoles, input.subjectId), deleted }
}
