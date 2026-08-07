import { db } from '@/lib/db'
import type { PrismaClient, Prisma } from '@prisma/client'

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export const bankAccountRepo = {
  findByUser(userId: string, orderBy?: Prisma.BankAccountOrderByWithRelationInput | Prisma.BankAccountOrderByWithRelationInput[]) {
    return db.bankAccount.findMany({
      where: { userId },
      ...(orderBy && { orderBy }),
    })
  },

  findById(id: string, include?: Prisma.BankAccountInclude) {
    return db.bankAccount.findUnique({
      where: { id },
      ...(include && { include }),
    })
  },

  findByIdAndUser(id: string, userId: string, include?: Prisma.BankAccountInclude) {
    return db.bankAccount.findFirst({
      where: { id, userId },
      ...(include && { include }),
    })
  },

  findFirst(where: Prisma.BankAccountWhereInput, orderBy?: Prisma.BankAccountOrderByWithRelationInput, tx?: TxClient) {
    const client = tx ?? db
    return client.bankAccount.findFirst({
      where,
      ...(orderBy && { orderBy }),
    })
  },

  findPrimaryByUser(userId: string) {
    return db.bankAccount.findFirst({
      where: { userId, isPrimary: true },
    })
  },

  create(data: Prisma.BankAccountUncheckedCreateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.bankAccount.create({ data })
  },

  update(id: string, data: Prisma.BankAccountUpdateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.bankAccount.update({ where: { id }, data })
  },

  updateManyByUser(userId: string, data: Prisma.BankAccountUpdateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.bankAccount.updateMany({ where: { userId }, data })
  },

  delete(id: string, tx?: TxClient) {
    const client = tx ?? db
    return client.bankAccount.delete({ where: { id } })
  },

  count(where: Prisma.BankAccountWhereInput) {
    return db.bankAccount.count({ where })
  },
}
