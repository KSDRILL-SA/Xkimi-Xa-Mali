import { InvitationStatus, type Prisma, type PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export const invitationRepo = {
  findByCodeHash(codeHash: string, select?: Prisma.InvitationSelect) {
    return db.invitation.findUnique({
      where: { codeHash },
      ...(select && { select }),
    })
  },

  findById(id: string, select?: Prisma.InvitationSelect) {
    return db.invitation.findUnique({
      where: { id },
      ...(select && { select }),
    })
  },

  findByEmailOrPhone(email: string, phone: string, opts?: { status?: InvitationStatus; select?: Prisma.InvitationSelect }) {
    return db.invitation.findFirst({
      where: {
        OR: [{ email }, { phone }],
        ...(opts?.status && { status: opts.status }),
      },
      ...(opts?.select && { select: opts.select }),
    })
  },

  findMany(where: Prisma.InvitationWhereInput, opts?: { skip?: number; take?: number; orderBy?: Prisma.InvitationOrderByWithRelationInput; select?: Prisma.InvitationSelect }) {
    return db.invitation.findMany({
      ...(where && { where }),
      ...(opts?.skip !== undefined && { skip: opts.skip }),
      ...(opts?.take !== undefined && { take: opts.take }),
      ...(opts?.orderBy && { orderBy: opts.orderBy }),
      ...(opts?.select && { select: opts.select }),
    })
  },

  create(data: Prisma.InvitationUncheckedCreateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.invitation.create({ data })
  },

  update(
    id: string,
    data: Prisma.InvitationUpdateInput | Prisma.InvitationUncheckedUpdateInput,
    tx?: TxClient,
  ) {
    const client = tx ?? db
    return client.invitation.update({ where: { id }, data })
  },

  count(where?: Prisma.InvitationWhereInput, tx?: TxClient) {
    const client = tx ?? db
    return client.invitation.count({ ...(where && { where }) })
  },
}
