/**
 * One contribution period that exercises the whole statement.
 *
 * The statement design had never been seen carrying content. The only periods
 * on the test member were dated 2031, the statement API refuses a future
 * period, so every PDF anybody generated came out empty — R 0.00 in every
 * total and both tables showing their empty state. A document cannot be judged
 * on that.
 *
 * This writes a single past month that puts something in every element of the
 * design at once:
 *
 *   - a **successful** debit order, so the money-in row and the SUCCESS pill render
 *   - a **failed** collection with a reason, so the failure pill and reason column render
 *   - a **manual** payment, so a second transaction type appears
 *   - a **partial** balance, so the outstanding total and the amber
 *     "balance outstanding" state render rather than the settled one
 *
 * Run: npm run seed:statement --workspace=@xxm/database
 *
 * Idempotent on the period: re-running replaces the sample rather than
 * stacking a second set of transactions on top.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/** The month the sample lands in — last month, so it is never in the future. */
function lastMonth(): { month: number; year: number } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

async function main() {
  const email = process.env.MEMBER_EMAIL
  if (!email) throw new Error('MEMBER_EMAIL is not set — nothing to seed against')

  const user = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) throw new Error(`No member found for ${email}`)

  const mandate = await db.paymentMandate.findFirst({
    where: { userId: user.id },
    select: { id: true },
  })

  const { month, year } = lastMonth()
  const amountDue = 400
  const amountPaid = 250 // deliberately partial — the outstanding state is the harder one to render

  const existing = await db.contribution.findUnique({
    where: { userId_periodMonth_periodYear: { userId: user.id, periodMonth: month, periodYear: year } },
    select: { id: true },
  })
  if (existing) {
    await db.transaction.deleteMany({ where: { contributionId: existing.id } })
    await db.contribution.delete({ where: { id: existing.id } })
  }

  const contribution = await db.contribution.create({
    data: {
      userId: user.id,
      periodMonth: month,
      periodYear: year,
      amountDue,
      amountPaid,
      dueDate: new Date(year, month - 1, 25),
      status: 'PARTIAL',
    },
  })

  const stamp = (day: number, hour: number) => new Date(year, month - 1, day, hour, 0, 0)

  await db.transaction.createMany({
    data: [
      {
        contributionId: contribution.id,
        mandateId: mandate?.id ?? null,
        amount: 150,
        type: 'DEBIT_ORDER',
        status: 'FAILED',
        failureReason: 'Insufficient funds',
        idempotencyKey: `sample:${contribution.id}:failed`,
        createdAt: stamp(25, 18),
      },
      {
        contributionId: contribution.id,
        mandateId: mandate?.id ?? null,
        amount: 150,
        type: 'DEBIT_ORDER',
        status: 'SUCCESS',
        gatewayRef: 'XMM-SAMPLE-DO-0001',
        processedAt: stamp(26, 18),
        idempotencyKey: `sample:${contribution.id}:debit`,
        createdAt: stamp(26, 18),
      },
      {
        contributionId: contribution.id,
        mandateId: mandate?.id ?? null,
        amount: 100,
        type: 'MANUAL',
        status: 'SUCCESS',
        gatewayRef: 'XMM-SAMPLE-MAN-0001',
        processedAt: stamp(28, 10),
        idempotencyKey: `sample:${contribution.id}:manual`,
        createdAt: stamp(28, 10),
      },
    ],
  })

  console.log(`Sample period seeded: ${month}/${year}`)
  console.log(`  due R${amountDue} · paid R${amountPaid} · outstanding R${amountDue - amountPaid}`)
  console.log('  transactions: 1 FAILED (insufficient funds), 1 SUCCESS debit order, 1 SUCCESS manual')
  console.log(`\n  Statement: /api/v1/transactions/statement?month=${month}&year=${year}`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
