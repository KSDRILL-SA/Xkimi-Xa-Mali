import { Prisma } from '@prisma/client'
import type { DistinctionKind } from '@prisma/client'
import { FOUNDER_COUNT } from '@xxm/utils'
import { logger } from '@xxm/observability'
import { db } from '@/lib/db'
import { writeAuditLog } from '@/services/audit.service'
import { queueNotification } from '@/services/notification.service'
import { ConflictError, NotFoundError } from '@/lib/errors'

/**
 * Distinctions: marks that are *given*, not earned.
 *
 * The tier on `BadgeScore` is derived — recalculated from contribution
 * behaviour on every status change — and this is the opposite kind of thing: a
 * decision a person made, which must outlive every recalculation. Nothing in
 * `badge.service.ts` reads or writes what is here, and nothing here reads or
 * writes a tier. That separation is the whole design; see
 * `docs/founder-badge-plan.md`.
 *
 * Today there is one kind, `FOUNDER`, held by the four people who founded the
 * collective. They register as members like anybody else and an admin grants it
 * afterwards — there is no email matching and no automatic conferral, because
 * "the system decided you are a founder" is not a thing this system should say.
 */

export interface DistinctionHolder {
  userId: string
  kind: DistinctionKind
  grantedAt: Date
  grantedById: string
  note: string | null
}

/**
 * Grant a distinction.
 *
 * Not idempotent by design: granting twice is a mistake worth surfacing, not a
 * no-op worth hiding. The unique index makes the second one impossible even if
 * two admins raced, and that violation is translated here rather than escaping
 * as a Prisma error.
 */
export async function grantDistinction(params: {
  userId: string
  kind: DistinctionKind
  grantedById: string
  note?: string | null
}): Promise<DistinctionHolder> {
  const { userId, kind, grantedById, note = null } = params

  const holder = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true },
  })
  if (!holder) throw new NotFoundError('Member not found')

  // The cap is checked before the write and enforced by the write. A count is a
  // read, so two simultaneous grants could both pass it — the unique index stops
  // a duplicate, but not a genuine fifth founder. With one admin that race
  // cannot happen; the check is here so a future second admin finds a clear
  // error rather than a quietly oversized list.
  const cap = capFor(kind)
  if (cap !== null) {
    const existing = await db.memberDistinction.count({ where: { kind } })
    if (existing >= cap) {
      throw new ConflictError(
        `There are already ${existing} ${kind} distinctions and the limit is ${cap}. ` +
          'Remove one before granting another.',
      )
    }
  }

  let created
  try {
    created = await db.memberDistinction.create({
      data: { userId, kind, grantedById, note },
      select: { userId: true, kind: true, grantedAt: true, grantedById: true, note: true },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('This member already holds that distinction')
    }
    throw err
  }

  await writeAuditLog({
    userId: grantedById,
    action: 'DISTINCTION_GRANTED',
    entity: 'User',
    entityId: userId,
    // `selfGranted` is recorded rather than left to be inferred by comparing two
    // ids. There is one admin and he is himself a founder, so this is expected —
    // and expected things still belong on the record.
    payload: { kind, note, selfGranted: grantedById === userId },
  })

  await notifyHolder(userId, holder.firstName, kind)

  logger.info('Distinction granted', { userId, kind, grantedById })
  return created
}

/**
 * Remove a distinction.
 *
 * This is an erratum, not a revocation. A founder badge is permanent and
 * survives resignation — founding is a historical fact and a member leaving
 * does not un-happen it. What this exists for is a badge granted to the wrong
 * account, which is a mistake and must be correctable.
 *
 * The reason is required for exactly that reason: it forces the person removing
 * it to say which of the two they are doing.
 */
export async function removeDistinction(params: {
  userId: string
  kind: DistinctionKind
  removedById: string
  reason: string
}): Promise<void> {
  const { userId, kind, removedById, reason } = params

  const existing = await db.memberDistinction.findUnique({
    where: { userId_kind: { userId, kind } },
    select: { grantedAt: true, grantedById: true },
  })
  if (!existing) throw new NotFoundError('This member does not hold that distinction')

  await db.memberDistinction.delete({ where: { userId_kind: { userId, kind } } })

  await writeAuditLog({
    userId: removedById,
    action: 'DISTINCTION_REMOVED',
    entity: 'User',
    entityId: userId,
    // The grant details go into the removal record, because the row that held
    // them has just been deleted and the audit log is now the only trace.
    payload: {
      kind,
      reason,
      originallyGrantedAt: existing.grantedAt.toISOString(),
      originallyGrantedById: existing.grantedById,
    },
  })

  logger.warn('Distinction removed', { userId, kind, removedById, reason })
}

/** Everyone holding a given kind. Ordered by when it was granted. */
export async function listHolders(kind: DistinctionKind): Promise<DistinctionHolder[]> {
  return db.memberDistinction.findMany({
    where: { kind },
    select: { userId: true, kind: true, grantedAt: true, grantedById: true, note: true },
    orderBy: { grantedAt: 'asc' },
  })
}

/**
 * The founder ids, as a set.
 *
 * Every display surface needs the same answer for a list of members, and asking
 * per member would be a query per row. There are at most four, so this is a
 * whole-table read of a table that cannot grow.
 */
export async function getFounderIds(): Promise<Set<string>> {
  const rows = await db.memberDistinction.findMany({
    where: { kind: 'FOUNDER' },
    select: { userId: true },
  })
  return new Set(rows.map((r) => r.userId))
}

/**
 * Attach `isFounder` to any list of rows carrying a `userId`.
 *
 * The composition happens here rather than inside `badge.service.ts`, which
 * never learns that distinctions exist. That is not fastidiousness: the moment
 * the badge service can read this table, somebody will one day make the
 * recalculation consult it, and the separation that keeps a granted badge safe
 * from a derived one is gone.
 *
 * One query for the whole list, not one per row.
 */
export async function withFounderFlag<T extends { userId: string }>(
  rows: T[],
): Promise<Array<T & { isFounder: boolean }>> {
  if (rows.length === 0) return []
  const founders = await getFounderIds()
  return rows.map((row) => ({ ...row, isFounder: founders.has(row.userId) }))
}

/** Whether one member is a founder. */
export async function isFounder(userId: string): Promise<boolean> {
  const row = await db.memberDistinction.findUnique({
    where: { userId_kind: { userId, kind: 'FOUNDER' } },
    select: { userId: true },
  })
  return row !== null
}

/** How many holders a kind may have, or null for no limit. */
function capFor(kind: DistinctionKind): number | null {
  return kind === 'FOUNDER' ? FOUNDER_COUNT : null
}

/**
 * Nothing to invalidate, and that is a fact worth stating rather than a gap.
 *
 * Every surface that shows a founder mark reads live: `badge.service.ts` uses
 * no cache at all, and `DashboardBadge` calls `getMyBadge` directly. So a grant
 * is visible on the next request, with no cache clearing involved.
 *
 * **If you add caching to any of those reads, clear it here.** A badge that
 * appears whenever a TTL happens to lapse reads first as "it didn't work" and
 * then as "it works sometimes", which is worse.
 */

/**
 * Tell the member.
 *
 * A mark appearing on someone's account without a word is the kind of thing
 * that gets read as a bug. Queued, not sent — and a failure here never costs
 * the grant, which is already written and audited.
 */
async function notifyHolder(
  userId: string,
  firstName: string,
  kind: DistinctionKind,
): Promise<void> {
  if (kind !== 'FOUNDER') return
  try {
    await queueNotification({
      userId,
      templateSlug: 'founder-badge-granted',
      channel: 'EMAIL',
      payload: { firstName },
    })
  } catch (err) {
    logger.warn('Could not queue the distinction notification', {
      userId,
      kind,
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}
