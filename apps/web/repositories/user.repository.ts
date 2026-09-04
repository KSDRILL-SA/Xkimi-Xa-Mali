import { RoleName, type Prisma, type PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

export type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export async function runTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn)
}

type FindByIdArgs = { select?: Prisma.UserSelect; include?: Prisma.UserInclude }

export const userRepo = {
  findById(id: string, args?: FindByIdArgs) {
    return db.user.findUnique({
      where: { id },
      ...(args?.select && { select: args.select }),
      ...(args?.include && { include: args.include }),
    })
  },

  findByEmail(email: string) {
    return db.user.findUnique({ where: { email } })
  },

  findByEmailOrPhone(email: string | undefined, phone: string, excludeUserId?: string) {
    return db.user.findFirst({
      where: {
        ...(excludeUserId && { NOT: { id: excludeUserId } }),
        OR: [
          ...(email ? [{ email }] : []),
          { phone },
        ],
      },
    })
  },

  findByIdOrThrow(id: string) {
    return db.user.findUniqueOrThrow({ where: { id } })
  },

  create(data: Prisma.UserCreateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.user.create({ data })
  },

  update(id: string, data: Prisma.UserUpdateInput, select?: Prisma.UserSelect, tx?: TxClient) {
    const client = tx ?? db
    return client.user.update({
      where: { id },
      data,
      ...(select && { select }),
    })
  },

  /**
   * Admins who can still sign in — ACTIVE, undeleted, holding ADMIN.
   *
   * Its own method rather than a `findMany` at the call site, because the shape
   * of this count *is* the rule: counted including the target, so suspending
   * the last one leaves zero and the policy refuses. Takes a `tx` because it is
   * only meaningful inside the transaction holding the admin-availability lock
   * — read outside one, the answer is already stale when it is used.
   */
  countActiveAdmins(tx?: TxClient) {
    const client = tx ?? db
    return client.user.count({
      where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: { name: 'ADMIN' } } } },
    })
  },

  findMany(where: Prisma.UserWhereInput, opts?: { skip?: number; take?: number; orderBy?: Prisma.UserOrderByWithRelationInput | Prisma.UserOrderByWithRelationInput[]; select?: Prisma.UserSelect }) {
    return db.user.findMany({
      where,
      ...(opts?.skip !== undefined && { skip: opts.skip }),
      ...(opts?.take !== undefined && { take: opts.take }),
      ...(opts?.orderBy && { orderBy: opts.orderBy }),
      ...(opts?.select && { select: opts.select }),
    })
  },

  count(where?: Prisma.UserWhereInput) {
    return db.user.count({ ...(where && { where }) })
  },

  groupBy<T extends Prisma.UserGroupByArgs>(args: T) {
    return (db.user.groupBy as unknown as (a: T) => ReturnType<typeof db.user.groupBy>)(args)
  },

  findRole(name: RoleName | string, tx?: TxClient) {
    const client = tx ?? db
    return client.role.findUnique({ where: { name: name as RoleName } })
  },

  findRoleOrThrow(name: RoleName | string) {
    return db.role.findUniqueOrThrow({ where: { name: name as RoleName } })
  },

  createUserRole(data: Prisma.UserRoleUncheckedCreateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.userRole.create({ data })
  },

  upsertUserRole(where: Prisma.UserRoleWhereUniqueInput, create: Prisma.UserRoleUncheckedCreateInput, update: Prisma.UserRoleUpdateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.userRole.upsert({ where, create, update })
  },

  deleteUserRoles(where: Prisma.UserRoleWhereInput, tx?: TxClient) {
    const client = tx ?? db
    return client.userRole.deleteMany({ where })
  },

  // `tx` is not optional in spirit on the revoke path: the count and the write
  // that follows it only mean anything inside the transaction holding the
  // admin-availability lock. See lockAdminInvariant.
  countUserRoles(where: Prisma.UserRoleWhereInput, tx?: TxClient) {
    const client = tx ?? db
    return client.userRole.count({ where })
  },

  findLoginHistory(where: Prisma.LoginHistoryWhereInput, opts?: { skip?: number; take?: number; orderBy?: Prisma.LoginHistoryOrderByWithRelationInput; select?: Prisma.LoginHistorySelect }) {
    return db.loginHistory.findMany({
      where,
      ...(opts?.skip !== undefined && { skip: opts.skip }),
      ...(opts?.take !== undefined && { take: opts.take }),
      ...(opts?.orderBy && { orderBy: opts.orderBy }),
      ...(opts?.select && { select: opts.select }),
    })
  },

  countLoginHistory(where: Prisma.LoginHistoryWhereInput) {
    return db.loginHistory.count({ where })
  },
}
