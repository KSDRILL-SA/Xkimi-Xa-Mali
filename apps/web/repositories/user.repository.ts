import { db } from '@/lib/db'
import type { PrismaClient, Prisma } from '@prisma/client'

export type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export async function runTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return db.$transaction(fn)
}

export const userRepo = {
  findById(id: string, include?: Prisma.UserInclude) {
    return db.user.findUnique({
      where: { id },
      ...(include && { include }),
    })
  },

  findByEmail(email: string) {
    return db.user.findUnique({ where: { email } })
  },

  findByEmailOrPhone(email: string, phone: string) {
    return db.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    })
  },

  findByIdOrThrow(id: string) {
    return db.user.findUniqueOrThrow({ where: { id } })
  },

  create(data: Prisma.UserCreateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.user.create({ data })
  },

  update(id: string, data: Prisma.UserUpdateInput, select?: Prisma.UserSelect) {
    return db.user.update({
      where: { id },
      data,
      ...(select && { select }),
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
    return (db.user.groupBy as CallableFunction)(args)
  },

  // ─── Role-related ──────────────────────────────────────────────────────────

  findRole(name: string) {
    return db.role.findUnique({ where: { name } })
  },

  findRoleOrThrow(name: string) {
    return db.role.findUniqueOrThrow({ where: { name } })
  },

  createUserRole(data: Prisma.UserRoleUncheckedCreateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.userRole.create({ data })
  },

  upsertUserRole(where: Prisma.UserRoleWhereUniqueInput, create: Prisma.UserRoleUncheckedCreateInput, update: Prisma.UserRoleUpdateInput) {
    return db.userRole.upsert({ where, create, update })
  },

  deleteUserRoles(where: Prisma.UserRoleWhereInput) {
    return db.userRole.deleteMany({ where })
  },

  countUserRoles(where: Prisma.UserRoleWhereInput) {
    return db.userRole.count({ where })
  },

  // ─── Login history ─────────────────────────────────────────────────────────

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
