import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { env } from '@/lib/env'
import { getContributions, getContributionSummary } from '@/services/contribution.service'
import { ContributionSummaryCards } from '@/components/contribution/SummaryCards'
import { ContributionRow } from '@/components/contribution/ContributionRow'
import { RouterPagination } from '@/components/ui/RouterPagination'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'

export const metadata: Metadata = { title: 'Contributions' }

const PAGE_SIZE = 12

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await getSession()
  const userId  = session!.user.id
  const roles   = session!.user.roles ?? []
  const params  = await searchParams
  const page    = Math.max(1, Number(params.page ?? '1'))

  const [summary, paginated, activeMandate] = await Promise.all([
    getContributionSummary(userId, userId, roles),
    getContributions(userId, userId, roles, page, PAGE_SIZE),
    db.paymentMandate.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        bankAccount: { select: { bankName: true, accountNumber: true } },
      },
    }),
  ])

  const { items: contributions, total, totalPages } = paginated

  const manualPaymentsEnabled = env.ENABLE_MANUAL_PAYMENTS

  const mandateInfo = activeMandate && manualPaymentsEnabled
    ? {
        bankName: activeMandate.bankAccount.bankName,
        accountNumberMasked: maskAccount(activeMandate.bankAccount.accountNumber),
      }
    : null

  type RawContrib = typeof contributions[number]
  type RawTx = RawContrib['transactions'][number]

  // Serialize Decimal/Date fields for client components
  const serialized = contributions.map((c: RawContrib) => ({
    ...c,
    amountDue: c.amountDue.toString(),
    amountPaid: c.amountPaid.toString(),
    dueDate: c.dueDate.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    transactions: c.transactions.map((t: RawTx) => ({
      ...t,
      amount: t.amount.toString(),
      createdAt: t.createdAt.toISOString(),
      processedAt: t.processedAt?.toISOString() ?? null,
    })),
  }))

  const hasOpen = contributions.some((c: RawContrib) =>
    ['PENDING', 'PARTIAL', 'OVERDUE'].includes(c.status),
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Contributions"
        subtitle="Your monthly payment history and ledger."
        action={
          hasOpen ? (
            <Button asChild>
              <Link href="/dashboard/contribute">Make a payment</Link>
            </Button>
          ) : undefined
        }
      />

      {/* Summary */}
      <ContributionSummaryCards summary={summary} />

      {/* No active mandate warning */}
      {!mandateInfo && (
        <div className="xxm-card p-4 xxm-banner-warning">
          <p className="text-sm font-medium">No active mandate</p>
          <p className="text-xs mt-1">
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
            {serialized.map((c: (typeof serialized)[number]) => (
              <ContributionRow key={c.id} contribution={c} mandate={mandateInfo} />
            ))}
          </div>
          {totalPages > 1 && (
            <RouterPagination
              totalItems={total}
              itemsPerPage={PAGE_SIZE}
              currentPage={page}
              baseUrl="/dashboard/contributions"
            />
          )}
        </section>
      )}
    </div>
  )
}

function maskAccount(encrypted: string): string {
  const plain = decrypt(encrypted)
  return plain.slice(-4).padStart(plain.length, '*')
}
