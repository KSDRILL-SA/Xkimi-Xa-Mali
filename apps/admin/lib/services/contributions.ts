import { ContributionStatus, MandateStatus, UserStatus } from '@prisma/client'
import { refusePeriod, PERIOD_REFUSAL_MESSAGE } from '@xxm/utils/contribution-period'
import { db, Prisma } from '@/lib/db'
import { internalAdminPost } from '@/lib/api'
import {
  assertAdmin, writeAuditLog, notifyInbox,
  AdminConflictError, AdminNotFoundError,
} from './shared'

/** For telling a member which month, in the words they use. */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ─── Contributions ────────────────────────────────────────────────────────────

/**
 * Every member a payment could be recorded against, for the picker on the
 * contributions page.
 *
 * Not `listMembers`: that one paginates at 25, filters, and carries badge and
 * relation counts for a table. A picker needs the whole list at once — a name
 * missing from a dropdown because it fell on page two is money that cannot be
 * recorded — and needs almost none of that payload.
 *
 * No status filter either, deliberately. PENDING members are the point: people
 * invited but not yet signed up have been paying by EFT since June, and they
 * are the ones whose months exist only on the bank statement. RESIGNED is kept
 * for the same reason the service allows it — settling up on the way out is the
 * commonest late payment there is. Only soft-deleted members are excluded,
 * matching `listMembers`.
 *
 * The mandate amount rides along so the form can say what each member owes a
 * month, which is the figure an admin would otherwise have to go and look up in
 * another tab before they could fill in "amount due".
 */
export async function listPayableMembers(adminRoles: string[]) {
  assertAdmin(adminRoles)

  const members = await db.user.findMany({
    where: { deletedAt: null },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    // A ceiling rather than pagination. This is a stokvel of a few dozen; if it
    // ever grows past this the dropdown was the wrong control long before the
    // query was, and a silently truncated list is better caught by the number
    // being suspiciously round.
    take: 500,
    select: {
      id: true, firstName: true, lastName: true, email: true, status: true,
      mandates: {
        where: { status: MandateStatus.ACTIVE },
        select: { amount: true },
        take: 1,
      },
    },
  })

  return members.map((m) => ({
    id: m.id,
    name: `${m.firstName} ${m.lastName}`,
    email: m.email,
    status: m.status as string,
    /** What their debit order is for, or null when they have none. */
    monthlyAmount: m.mandates[0] ? Number(m.mandates[0].amount) : null,
  }))
}

export async function listAllContributions(
  adminRoles: string[],
  params: { month: number; year: number; status?: string; page?: number; limit?: number },
) {
  assertAdmin(adminRoles)
  const { month, year, status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where: Prisma.ContributionWhereInput = {
    periodMonth: month, periodYear: year,
    ...(status && { status: status as ContributionStatus }),
  }

  const [items, total] = await Promise.all([
    db.contribution.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, periodMonth: true, periodYear: true,
        amountDue: true, amountPaid: true, status: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    db.contribution.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * The transactions behind a set of contributions, for the reversal action.
 *
 * A reversal acts on a Transaction, but this console lists Contributions — so
 * without this there is nothing for leadership to point at. Loaded for the
 * page's current rows only, in one query rather than one per row.
 *
 * `reversal` comes back so the UI can show that a payment has already been
 * corrected and refuse to offer it twice; the service enforces that too, but an
 * action a screen should never have offered is a worse experience than one that
 * was never shown.
 */
export async function listTransactionsForContributions(
  adminRoles: string[],
  contributionIds: string[],
) {
  assertAdmin(adminRoles)
  if (contributionIds.length === 0) return []

  return db.transaction.findMany({
    where: { contributionId: { in: contributionIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, contributionId: true, amount: true, type: true, status: true,
      gatewayRef: true, reversalReason: true, createdAt: true,
      // An offline payment has no gateway reference and no gateway date. Its
      // evidence is the bank reference an admin typed, and the date the money
      // actually reached the account — which for the backlog is months before
      // the row was written. Showing createdAt for those would put three
      // months of payments on the afternoon they were captured, which is the
      // precise misreading this whole path exists to avoid.
      offlineReference: true, processedAt: true,
      // The evidence, so the row can offer it. proofUrl is a blob pathname,
      // never a link — /api/media is what turns it into bytes, and only after
      // checking a row claims it.
      proofUrl: true, proofWitness: true,
      reversal: { select: { id: true } },
    },
  })
}

export async function generateContributions(
  adminId: string, adminRoles: string[],
  month: number, year: number,
  /** Caller IP, for the audit trail. See `requireAdmin`. */
  ip?: string,
) {
  assertAdmin(adminRoles)

  // The month and year arrive from `parseInt` on a form field. The database
  // refuses an impossible period, but it does so with a constraint violation
  // after the press — and it considers every month from 2020 to 2100 possible.
  const refusal = refusePeriod({ month, year })
  if (refusal) throw new AdminConflictError(PERIOD_REFUSAL_MESSAGE[refusal])

  const mandates = await db.paymentMandate.findMany({
    where: { status: MandateStatus.ACTIVE, user: { status: UserStatus.ACTIVE } },
    select: { userId: true, debitDay: true, amount: true },
  })

  const existing = await db.contribution.findMany({
    where: {
      userId: { in: mandates.map((m) => m.userId) },
      periodMonth: month, periodYear: year,
    },
    select: { userId: true },
  })
  const alreadyHas = new Set(existing.map((c) => c.userId))
  const toCreate = mandates.filter((m) => !alreadyHas.has(m.userId))

  if (toCreate.length > 0) {
    await db.contribution.createMany({
      data: toCreate.map((m) => ({
        userId: m.userId,
        periodMonth: month,
        periodYear: year,
        amountDue: m.amount,
        amountPaid: 0,
        dueDate: new Date(year, month - 1, m.debitDay),
        status: ContributionStatus.PENDING,
      })),
      skipDuplicates: true,
    })
  }

  const created = toCreate.length
  const skipped = mandates.length - toCreate.length

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_CONTRIBUTIONS_GENERATED',
    entity: 'Contribution',
    entityId: `${year}-${month}`,
    payload: { month, year, created, skipped, total: mandates.length },
    ipAddress: ip,
  })

  return { created, skipped, total: mandates.length }
}

/**
 * What generating this period would do, without doing it.
 *
 * The console offered no confirmation on the widest action it has, while
 * reversing a single transaction — one member, one amount, and undoable in the
 * sense that the entry stays visible — asks the admin to confirm in a dialog
 * that spells out the consequence. The proportion was backwards.
 *
 * Cheap enough to run on every render of the page: two counts, both indexed.
 */
export async function previewGeneration(
  adminRoles: string[], month: number, year: number,
): Promise<{ eligible: number; alreadyHave: number; toCreate: number }> {
  assertAdmin(adminRoles)
  if (refusePeriod({ month, year })) return { eligible: 0, alreadyHave: 0, toCreate: 0 }

  const mandates = await db.paymentMandate.findMany({
    where: { status: MandateStatus.ACTIVE, user: { status: UserStatus.ACTIVE } },
    select: { userId: true },
  })
  if (mandates.length === 0) return { eligible: 0, alreadyHave: 0, toCreate: 0 }

  const alreadyHave = await db.contribution.count({
    where: {
      userId: { in: mandates.map((m) => m.userId) },
      periodMonth: month, periodYear: year,
    },
  })

  return {
    eligible: mandates.length,
    alreadyHave,
    toCreate: mandates.length - alreadyHave,
  }
}


// --- Releasing a month, and money that arrived another way -------------------
//
// Both were promised to members in writing and existed nowhere in the code.
// `WAIVED` was read by statements, member insights, the collection-rate report
// and badge scoring - and written by nothing, so a contribution could never
// reach it. Recording a payment that arrived as cash or a transfer had no path
// at all: a member could settle their own shortfall through the member app, but
// leadership could not enter money it had actually been handed.
//
// Everything downstream already handled a waived month correctly, which says
// this was designed and never finished rather than deliberately left out.

/**
 * Release a member from a month.
 *
 * Not a payment and not a deletion: the obligation stays on the record, marked
 * as released, with the name of whoever released it and why. The member's
 * statement shows a waiver rather than quietly reading as settled.
 */
export async function waiveContribution(
  adminId: string, adminRoles: string[], contributionId: string,
  /** Why. Told to the member, and kept in the audit trail. */
  reason?: string,
  /** Caller IP, for the audit trail. See `requireAdmin`. */
  ip?: string,
) {
  assertAdmin(adminRoles)

  const trimmed = reason?.trim() ?? ''
  if (trimmed.length < 10) {
    throw new AdminConflictError(
      'Give a reason of at least 10 characters - the member is told why, and it is recorded.',
    )
  }

  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    select: {
      id: true, userId: true, status: true, version: true,
      periodMonth: true, periodYear: true, amountDue: true, amountPaid: true,
    },
  })
  if (!c) throw new AdminNotFoundError('Contribution not found')

  if (c.status === ContributionStatus.WAIVED) {
    throw new AdminConflictError('That month has already been waived.')
  }
  if (c.status === ContributionStatus.PAID) {
    throw new AdminConflictError(
      'That month is settled in full - there is nothing to release. Reverse the payment instead if it was taken in error.',
    )
  }

  // Guarded on the version rather than written blind: the collection job can
  // settle a contribution between this read and this write, and waiving a month
  // that has just been paid would erase the payment from the member's standing.
  const { count } = await db.contribution.updateMany({
    where: { id: c.id, version: c.version },
    data: { status: ContributionStatus.WAIVED, version: { increment: 1 } },
  })
  if (count === 0) {
    throw new AdminConflictError('That contribution just changed - reload and look again before waiving it.')
  }

  const period = `${MONTH_NAMES[c.periodMonth - 1] ?? c.periodMonth} ${c.periodYear}`
  await notifyInbox({
    userId: c.userId,
    title: `${period} has been waived`,
    body:
      `Leadership has released you from your ${period} contribution. You do not need to pay it, ` +
      `and it will show on your statement as waived. Reason given: ${trimmed}`,
    category: 'PAYMENT',
    createdById: adminId,
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_CONTRIBUTION_WAIVED',
    entity: 'Contribution',
    entityId: c.id,
    payload: {
      memberId: c.userId,
      period: { month: c.periodMonth, year: c.periodYear },
      amountDue: Number(c.amountDue),
      amountPaid: Number(c.amountPaid),
      reason: trimmed,
    },
    ipAddress: ip,
  })

  return { id: c.id, status: 'WAIVED' as const, period }
}

/**
 * Money that reached the Foundation without passing through the debit order.
 *
 * Cash, or a transfer straight into the account. The member app can already
 * settle a shortfall on the member's own instruction; this is the other case,
 * where the money is already in hand and the record has to catch up.
 *
 * ── Why this delegates instead of writing the rows itself ──────────────────
 *
 * It used to do all of it here, and could not do the job it was built for.
 * Netcash declined the DebiCheck application - their processing bank requires
 * an active debit-order base a new stokvel cannot have - so the members whose
 * EFTs most need recording are exactly the ones with no mandate. The old
 * implementation refused all three of the things that case needs:
 *
 *   - it required an ACTIVE mandate, and threw without one;
 *   - it required the contribution row to already exist, so a month nobody had
 *     generated could not be paid against at all;
 *   - it typed the row MANUAL, which in this system means "the member pressed
 *     pay and we submitted it to the gateway". Its own comment conceded the
 *     mandate was not a claim the money came through it - but a reader of the
 *     ledger a year from now has only the type to go on.
 *
 * It also stamped every payment with the moment it was captured, so a backlog
 * entered in one sitting dated three months of history to one afternoon.
 *
 * `recordOfflineContribution` in the web app handles all of that, and having
 * one implementation is the point: two "an admin records a payment" paths that
 * disagree about transaction type, mandate requirement and dating is precisely
 * the drift this system keeps paying for.
 *
 * The signature is kept so the per-row form on the contributions page still
 * works: given a contribution id this resolves the member and period from it
 * and forwards the rest.
 */
export async function recordPayment(
  adminId: string, adminRoles: string[], contributionId: string,
  amount: number,
  /** How it arrived - a deposit reference, cash at the meeting, and so on. */
  reference?: string,
  /** Caller IP, for the audit trail. See `requireAdmin`. */
  ip?: string,
  /**
   * When the money actually reached the account. Defaults to now, which is
   * right for a payment recorded as it happens and wrong for a backlog - the
   * fuller form on the contributions page asks, this shorthand does not.
   */
  receivedAt?: Date,
  /**
   * How the payment is evidenced: a stored proof of payment, or a note naming
   * who counted the cash. Exactly one, refused by the web schema otherwise.
   */
  evidence?: { proofUrl?: string; proofWitness?: string },
) {
  assertAdmin(adminRoles)

  const c = await db.contribution.findUnique({
    where: { id: contributionId },
    select: { id: true, userId: true, periodMonth: true, periodYear: true },
  })
  if (!c) throw new AdminNotFoundError('Contribution not found')

  return recordOfflinePaymentForMember({
    adminId,
    adminRoles,
    userId: c.userId,
    amount,
    periodMonth: c.periodMonth,
    periodYear: c.periodYear,
    reference: reference ?? '',
    receivedAt: receivedAt ?? new Date(),
    ...(evidence?.proofUrl ? { proofUrl: evidence.proofUrl } : {}),
    ...(evidence?.proofWitness ? { proofWitness: evidence.proofWitness } : {}),
    ip,
  })
}

/**
 * Record an offline payment for a member and a period, whether or not a
 * contribution row exists for it yet.
 *
 * The general form; `recordPayment` above is the shorthand for when a row is
 * already on screen. This is what the catch-up form on the contributions page
 * calls, because the months it enters have no rows -
 * `generateMonthlyContributions` only raises a period for members with an
 * active mandate, and these members have none.
 *
 * Server-to-server rather than a direct database write. The rules about what a
 * period is created owing, what counts as a duplicate, and how a payment
 * settles a contribution live in the web app beside the debit run that has to
 * agree with them; reaching into the same tables from here would mean two
 * copies of those rules, free to drift apart.
 */
export async function recordOfflinePaymentForMember(input: {
  adminId: string
  adminRoles: string[]
  userId: string
  amount: number
  periodMonth: number
  periodYear: number
  reference: string
  receivedAt: Date
  /** What the member owed, when no mandate establishes it. */
  amountDue?: number
  note?: string
  /**
   * The stored proof of payment, as a blob pathname. Exactly one of this and
   * `proofWitness` is required — the web schema refuses the request otherwise.
   * The file itself never travels: it is read and stored on this side, which
   * owns the upload adapter, and only the reference crosses.
   */
  proofUrl?: string
  /** Who counted the money, when cash means there is no document. */
  proofWitness?: string
  ip?: string
}) {
  assertAdmin(input.adminRoles)

  // Resolved here rather than passed in from the form. The row form knows the
  // member's name because it renders it; the catch-up form knows only the id it
  // posted, and a confirmation that names the member matters most there — an
  // admin entering a backlog is doing several people in one sitting. One
  // lookup, one source, no hidden field to drift.
  const member = await db.user.findUnique({
    where: { id: input.userId },
    select: { firstName: true, lastName: true },
  })
  if (!member) throw new AdminNotFoundError('Member not found')

  const res = await internalAdminPost<{
    transactionId: string
    contributionId: string
    receiptRef: string
    period: string
    amount: number
    amountDue: number
    amountPaid: number
    outstanding: number
    status: string
    overpaid: boolean
  }>('/api/v1/admin/contributions/offline', {
    userId: input.userId,
    amount: input.amount,
    periodMonth: input.periodMonth,
    periodYear: input.periodYear,
    receivedAt: input.receivedAt.toISOString(),
    reference: input.reference,
    ...(input.amountDue !== undefined ? { amountDue: input.amountDue } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.proofUrl ? { proofUrl: input.proofUrl } : {}),
    ...(input.proofWitness ? { proofWitness: input.proofWitness } : {}),
  }, { adminUserId: input.adminId, adminIp: input.ip })

  if (!res.ok || !res.data) {
    // The web app's own message, not a generic one. It is written for the
    // person filling in the form - which period is out of range, which
    // reference is already recorded - and replacing it with "that did not go
    // through" throws away the only part that says what to do next.
    throw new AdminConflictError(res.error?.message ?? 'That payment could not be recorded.')
  }

  const d = res.data
  return {
    id: d.contributionId,
    amount: d.amount,
    settled: d.status === 'PAID',
    period: d.period,
    outstanding: d.outstanding,
    overpaid: d.overpaid,
    receiptRef: d.receiptRef,
    memberName: `${member.firstName} ${member.lastName}`,
  }
}
