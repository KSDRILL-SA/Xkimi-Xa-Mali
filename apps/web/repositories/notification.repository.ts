import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// ─── Notification repository ────────────────────────────────────────────────
// Thin wrapper around db.notification.*, db.notificationTemplate.*,
// and db.notificationPreference.* — zero business logic.

export const notificationRepo = {
  // ─── Notification ─────────────────────────────────────────────────────────

  /** Find a single notification by ID. */
  findById(id: string) {
    return db.notification.findUnique({ where: { id } })
  },

  /** Find many notifications matching a where clause. */
  findMany(
    where: Prisma.NotificationWhereInput,
    opts: {
      orderBy?: Prisma.NotificationOrderByWithRelationInput
      skip?: number
      take?: number
      include?: Prisma.NotificationInclude
      // `include` pulls whole rows; a caller that only needs two columns of a
      // large, JSON-carrying table should be able to say so.
      select?: Prisma.NotificationSelect
    } = {},
  ) {
    // Prisma rejects `select` and `include` together, and the two produce
    // different row shapes — so they are two calls rather than one spread union.
    const page = { where, orderBy: opts.orderBy, skip: opts.skip, take: opts.take }
    return opts.select
      ? db.notification.findMany({ ...page, select: opts.select })
      : db.notification.findMany({ ...page, include: opts.include })
  },

  /**
   * Atomically claim a batch of QUEUED notifications using raw SQL.
   * Returns the IDs of claimed rows.
   */
  findReady(limit = 100, maxRetries = 3) {
    // Stamp updatedAt on claim (raw SQL bypasses Prisma's @updatedAt) so a claim
    // orphaned by a worker crash can be detected by age and recovered.
    return db.$queryRaw`
      UPDATE "notifications"
      SET "status" = 'FAILED', "errorMessage" = 'in-flight', "updatedAt" = NOW()
      WHERE "id" IN (
        SELECT "id" FROM "notifications"
        WHERE "status" = 'QUEUED' AND "retryCount" < ${maxRetries}
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `.then((rows) => (rows as Array<{ id: string }>).map((r) => r.id))
  },

  /**
   * Requeue notifications stuck 'in-flight' — claimed by a flush run whose worker
   * died before writing the final status. Only rows whose claim is older than
   * `staleBefore` are touched, so a batch actively being processed is never
   * disturbed. Returns the number recovered.
   */
  recoverStalled(staleBefore: Date) {
    return db.notification.updateMany({
      where: { status: 'FAILED', errorMessage: 'in-flight', updatedAt: { lt: staleBefore } },
      data: { status: 'QUEUED', errorMessage: null },
    })
  },

  /** Create a notification. */
  create(data: Prisma.NotificationUncheckedCreateInput) {
    return db.notification.create({ data })
  },

  /** Update a single notification by ID. */
  update(id: string, data: Prisma.NotificationUpdateInput) {
    return db.notification.update({ where: { id }, data })
  },

  /** Update many notifications matching a where clause. */
  updateMany(
    where: Prisma.NotificationWhereInput,
    data: Prisma.NotificationUpdateManyMutationInput,
  ) {
    return db.notification.updateMany({ where, data })
  },

  // ─── NotificationTemplate ─────────────────────────────────────────────────

  /** Find a template by slug. */
  findTemplate(slug: string) {
    return db.notificationTemplate.findUnique({ where: { slug } })
  },

  // ─── NotificationPreference ───────────────────────────────────────────────

  /** Find a user's notification preferences. */
  findPreference(userId: string) {
    return db.notificationPreference.findUnique({ where: { userId } })
  },

  /** Find preferences matching a where clause. */
  findPreferences(where: Prisma.NotificationPreferenceWhereInput) {
    return db.notificationPreference.findMany({ where })
  },

  /** Upsert notification preferences for a user. */
  upsertPreference(
    userId: string,
    data: Prisma.NotificationPreferenceUpdateInput,
  ) {
    return db.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data } as Prisma.NotificationPreferenceCreateInput,
    })
  },
}

// ─── Thin db.$transaction wrapper ───────────────────────────────────────────

export function runTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(fn)
}
