import { DsrKind, DsrStatus } from '@prisma/client'
import { db, Prisma } from '@/lib/db'
import { assertAdmin, writeAuditLog, AdminNotFoundError, AdminConflictError } from './shared'

/**
 * The POPIA data subject request log.
 *
 * The Act gives a person the right to see, correct or delete the personal
 * information held about them, and gives the Foundation **thirty days** to
 * answer. What was missing was not the willingness to answer — it was that
 * nothing recorded a request had been made, so the thirty days ran against
 * nobody, and there was no history to show a regulator who asked how such
 * requests had been handled.
 *
 * Recorded here rather than in a spreadsheet for one reason: every action on a
 * request writes to the same append-only audit log as every other administrative
 * act. A spreadsheet can be edited afterwards to say the request was answered on
 * time. This cannot.
 */

/** The statutory response period, in days. */
export const DSR_RESPONSE_DAYS = 30

export function dueDateFor(receivedAt: Date): Date {
  const due = new Date(receivedAt)
  due.setDate(due.getDate() + DSR_RESPONSE_DAYS)
  return due
}

export type DsrListParams = {
  status?: DsrStatus
  /** Only those still open and past their due date. */
  overdueOnly?: boolean
  page?: number
  limit?: number
}

const OPEN: DsrStatus[] = [DsrStatus.RECEIVED, DsrStatus.IN_PROGRESS]

export async function listDataRequests(adminRoles: string[], params: DsrListParams = {}) {
  assertAdmin(adminRoles)
  const { status, overdueOnly, page = 1, limit = 25 } = params

  const where: Prisma.DataSubjectRequestWhereInput = {
    ...(status ? { status } : {}),
    ...(overdueOnly ? { status: { in: OPEN }, dueAt: { lt: new Date() } } : {}),
  }

  const [rows, total, openCount, overdueCount] = await Promise.all([
    db.dataSubjectRequest.findMany({
      where,
      // Oldest due first: the one closest to breaching the thirty days is the
      // one that needs attention, which is not the same as the newest.
      orderBy: [{ dueAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        subject: { select: { id: true, firstName: true, lastName: true, email: true } },
        handledBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.dataSubjectRequest.count({ where }),
    db.dataSubjectRequest.count({ where: { status: { in: OPEN } } }),
    db.dataSubjectRequest.count({ where: { status: { in: OPEN }, dueAt: { lt: new Date() } } }),
  ])

  return { rows, total, page, limit, openCount, overdueCount }
}

export async function logDataRequest(
  adminRoles: string[],
  adminId: string,
  input: {
    requesterName: string
    requesterEmail: string
    subjectId?: string | null
    kind: DsrKind
    detail: string
    /** Defaults to now. Set it when logging a request that arrived earlier — the
     *  clock runs from when the requester asked, not from when we got round to
     *  writing it down. */
    receivedAt?: Date
  },
) {
  assertAdmin(adminRoles)

  const receivedAt = input.receivedAt ?? new Date()

  const request = await db.dataSubjectRequest.create({
    data: {
      requesterName: input.requesterName.trim(),
      requesterEmail: input.requesterEmail.trim().toLowerCase(),
      subjectId: input.subjectId ?? null,
      kind: input.kind,
      detail: input.detail.trim(),
      receivedAt,
      dueAt: dueDateFor(receivedAt),
    },
  })

  await writeAuditLog({
    userId: adminId,
    action: 'DSR_LOGGED',
    entity: 'DataSubjectRequest',
    entityId: request.id,
    payload: { kind: input.kind, requesterEmail: request.requesterEmail, dueAt: request.dueAt },
  })

  return request
}

export async function startDataRequest(adminRoles: string[], adminId: string, id: string) {
  assertAdmin(adminRoles)

  const existing = await db.dataSubjectRequest.findUnique({ where: { id } })
  if (!existing) throw new AdminNotFoundError('Request not found')
  if (existing.status !== DsrStatus.RECEIVED) {
    throw new AdminConflictError('Only a newly received request can be started')
  }

  const request = await db.dataSubjectRequest.update({
    where: { id },
    data: { status: DsrStatus.IN_PROGRESS, handledById: adminId },
  })

  await writeAuditLog({
    userId: adminId,
    action: 'DSR_STARTED',
    entity: 'DataSubjectRequest',
    entityId: id,
    payload: {},
  })

  return request
}

/**
 * Close a request, as answered or as refused.
 *
 * `outcome` is required in both cases and not only for a refusal. A completed
 * request with no record of what was actually given back is indistinguishable
 * later from one that was quietly dropped.
 */
export async function closeDataRequest(
  adminRoles: string[],
  adminId: string,
  id: string,
  input: { status: 'COMPLETED' | 'REFUSED'; outcome: string },
) {
  assertAdmin(adminRoles)

  const outcome = input.outcome.trim()
  if (!outcome) {
    throw new AdminConflictError(
      input.status === 'REFUSED'
        ? 'Refusing a request without recorded reasons is itself a contravention'
        : 'Record what was provided to the requester',
    )
  }

  const existing = await db.dataSubjectRequest.findUnique({ where: { id } })
  if (!existing) throw new AdminNotFoundError('Request not found')
  if (existing.status === DsrStatus.COMPLETED || existing.status === DsrStatus.REFUSED) {
    throw new AdminConflictError('This request is already closed')
  }

  const completedAt = new Date()
  const request = await db.dataSubjectRequest.update({
    where: { id },
    data: {
      status: input.status as DsrStatus,
      outcome,
      completedAt,
      handledById: existing.handledById ?? adminId,
    },
  })

  await writeAuditLog({
    userId: adminId,
    action: input.status === 'REFUSED' ? 'DSR_REFUSED' : 'DSR_COMPLETED',
    entity: 'DataSubjectRequest',
    entityId: id,
    payload: {
      outcome,
      // Recorded at close, because whether the Foundation answered in time is
      // the fact a regulator asks for, and recomputing it later from two
      // timestamps invites the answer to drift.
      withinStatutoryPeriod: completedAt <= existing.dueAt,
      daysTaken: Math.round((completedAt.getTime() - existing.receivedAt.getTime()) / 86_400_000),
    },
  })

  return request
}
