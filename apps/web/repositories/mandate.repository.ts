import { db } from '@/lib/db'
import type { PrismaClient, Prisma } from '@prisma/client'

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export const mandateRepo = {
  findMany(
    where: Prisma.PaymentMandateWhereInput,
    opts: {
      orderBy?: Prisma.PaymentMandateOrderByWithRelationInput | Prisma.PaymentMandateOrderByWithRelationInput[]
      skip?: number
      take?: number
      include?: Prisma.PaymentMandateInclude
      select?: Prisma.PaymentMandateSelect
    } = {},
  ) {
    if (opts.select) {
      return db.paymentMandate.findMany({
        where,
        orderBy: opts.orderBy,
        skip: opts.skip,
        take: opts.take,
        select: opts.select,
      })
    }
    return db.paymentMandate.findMany({
      where,
      orderBy: opts.orderBy,
      skip: opts.skip,
      take: opts.take,
      include: opts.include,
    })
  },

  findByUser(userId: string, options?: { orderBy?: Prisma.PaymentMandateOrderByWithRelationInput; include?: Prisma.PaymentMandateInclude }) {
    return db.paymentMandate.findMany({
      where: { userId },
      orderBy: options?.orderBy,
      include: options?.include,
    })
  },

  findById(id: string, include?: Prisma.PaymentMandateInclude) {
    return db.paymentMandate.findUnique({
      where: { id },
      ...(include && { include }),
    })
  },

  findByIdWithSelect(id: string, select: Prisma.PaymentMandateSelect) {
    return db.paymentMandate.findUnique({
      where: { id },
      select,
    })
  },

  findActiveByUser(userId: string, select?: Prisma.PaymentMandateSelect) {
    return db.paymentMandate.findFirst({
      where: { userId, status: 'ACTIVE' },
      ...(select && { select }),
    })
  },

  findAllActive(include?: Prisma.PaymentMandateInclude) {
    return db.paymentMandate.findMany({
      where: { status: 'ACTIVE' },
      ...(include && { include }),
    })
  },

  findFirst(where: Prisma.PaymentMandateWhereInput) {
    return db.paymentMandate.findFirst({ where })
  },

  create(data: Prisma.PaymentMandateUncheckedCreateInput) {
    return db.paymentMandate.create({ data })
  },

  update(id: string, data: Prisma.PaymentMandateUpdateInput, opts?: { select?: Prisma.PaymentMandateSelect; tx?: TxClient }) {
    const client = opts?.tx ?? db
    return client.paymentMandate.update({
      where: { id },
      data,
      ...(opts?.select && { select: opts.select }),
    })
  },

  count(where: Prisma.PaymentMandateWhereInput) {
    return db.paymentMandate.count({ where })
  },

  groupBy<T extends Prisma.PaymentMandateGroupByArgs>(args: T) {
    return (db.paymentMandate.groupBy as CallableFunction)(args)
  },
}
