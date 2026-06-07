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
import { Wallet, AlertTriangle } from 'lucide-react'

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

      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-xxm-green/10 flex items-center justify-center shrink-0">
            <Wallet size={22} className="text-xxm-green" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-xxm-green-900 tracking-tight">Contributions</h1>
            <p className="text-sm text-xxm-gray-500 mt-1">Your monthly payment history and ledger.</p>
          </div>
        </div>
        {hasOpen && (
          <Button asChild className="shrink-0">
            <Link href="/dashboard/contribute">Make a payment</Link>
          </Button>
        )}
      </div>

      {/* Summary */}
      <ContributionSummaryCards summary={summary} />

      {/* No active mandate warning */}
      {!mandateInfo && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-800">No active mandate</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Set up a payment mandate to enable monthly debits and manual payments.{' '}
              <Link href="/dashboard/mandates" className="underline font-bold hover:text-amber-900 transition-colors">
                Go to Mandates
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Contribution list */}
      {contributions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <Wallet size={24} className="text-xxm-green-300" aria-hidden />
          </div>
          <p className="text-xxm-gray-600 font-semibold">No contribution records yet</p>
          <p className="text-xxm-gray-400 text-xs mt-1.5 max-w-xs mx-auto">
            Records are generated automatically each month once your mandate is active.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">History</h2>
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
