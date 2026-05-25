import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { getContributionSummary } from '@/services/contribution.service'
import { ContributionSummaryCards } from '@/components/contribution/SummaryCards'
import { ContributionRow } from '@/components/contribution/ContributionRow'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = { title: 'Contributions' }

export default async function ContributionsPage() {
  const session = await auth()
  const userId = session!.user.id
  const roles = session!.user.roles ?? []

  const [summary, contributions, activeMandate] = await Promise.all([
    getContributionSummary(userId, userId, roles),
    db.contribution.findMany({
      where: { userId },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 10 } },
    }),
    db.paymentMandate.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        bankAccount: { select: { bankName: true, accountNumber: true } },
      },
    }),
  ])

  // Mask encrypted account number before passing to client components
  const mandateInfo = activeMandate
    ? {
        bankName: activeMandate.bankAccount.bankName,
        accountNumberMasked: maskAccount(activeMandate.bankAccount.accountNumber),
      }
    : null

  // Serialize Decimal/Date fields for client components
  const serialized = contributions.map((c) => ({
    ...c,
    amountDue: c.amountDue.toString(),
    amountPaid: c.amountPaid.toString(),
    dueDate: c.dueDate.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    transactions: c.transactions.map((t) => ({
      ...t,
      amount: t.amount.toString(),
      createdAt: t.createdAt.toISOString(),
      processedAt: t.processedAt?.toISOString() ?? null,
    })),
  }))

  const hasOpen = contributions.some((c) =>
    ['PENDING', 'PARTIAL', 'OVERDUE'].includes(c.status),
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green-900">Contributions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Your monthly payment history and ledger.
          </p>
        </div>
        {hasOpen && (
          <Button asChild>
            <Link href="/dashboard/contribute">Make a payment</Link>
          </Button>
        )}
      </div>

      {/* Summary */}
      <ContributionSummaryCards summary={summary} />

      {/* No active mandate warning */}
      {!mandateInfo && (
        <div className="xxm-card p-4 border-l-4 border-amber-400 bg-amber-50">
          <p className="text-sm text-amber-800 font-medium">No active mandate</p>
          <p className="text-xs text-amber-700 mt-1">
            Set up a payment mandate to enable monthly debits and manual payments.{' '}
            <Link href="/dashboard/mandates" className="underline font-semibold">
              Go to Mandates
            </Link>
          </p>
        </div>
      )}

      {/* Contribution list */}
      {contributions.length === 0 ? (
        <div className="xxm-card p-10 text-center">
          <p className="text-gray-400 text-sm">No contribution records yet.</p>
          <p className="text-gray-400 text-xs mt-1">
            Records are generated automatically each month once your mandate is active.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            History
          </h2>
          <div className="space-y-2">
            {serialized.map((c) => (
              <ContributionRow key={c.id} contribution={c} mandate={mandateInfo} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function maskAccount(encrypted: string): string {
  const plain = decrypt(encrypted)
  return plain.slice(-4).padStart(plain.length, '*')
}
