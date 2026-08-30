import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { env } from '@/lib/env'
import { getContributions, getContributionSummary } from '@/services/contribution.service'
import { getMandates } from '@/services/mandate.service'
import { ContributionSummaryCards } from '@/components/contribution/SummaryCards'
import { GroupCollectionAccount } from '@/components/contribution/GroupCollectionAccount'
import { ContributionRow } from '@/components/contribution/ContributionRow'
import { RouterPagination } from '@/components/ui/RouterPagination'
import { Button } from '@/components/ui/Button'
import { Reveal } from '@xxm/ui'
import { Wallet, AlertTriangle } from 'lucide-react'

export const metadata: Metadata = { title: 'Contributions' }

const PAGE_SIZE = 12

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const userId  = session.user.id
  const roles   = session.user.roles ?? []
  const params  = await searchParams
  // `?page=abc` produced NaN, which reached Prisma as `skip: NaN` and returned
  // a 500 to a member who mistyped a URL. Anything that is not a whole number
  // at or above one is page one.
  const requestedPage = Number(params.page ?? '1')
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1

  const [summary, paginated, allMandates] = await Promise.all([
    getContributionSummary(userId, userId, roles),
    getContributions(userId, userId, roles, page, PAGE_SIZE),
    getMandates(userId, userId, roles),
  ])

  const activeMandate = allMandates.find((m) => m.status === 'ACTIVE') ?? null

  const { items: contributions, total, totalPages } = paginated

  const manualPaymentsEnabled = env.ENABLE_MANUAL_PAYMENTS

  const mandateInfo = activeMandate && manualPaymentsEnabled
    ? {
        bankName: activeMandate.bankAccount.bankName,
        accountNumberMasked: activeMandate.bankAccount.accountNumberMasked,
      }
    : null

  type RawContrib = typeof contributions[number]
  type RawTx = RawContrib['transactions'][number]

  // Named, not spread — and on the transactions especially.
  //
  // Everything handed to a client component is serialised into the RSC payload
  // and readable in the page source. `...t` sent every column on `Transaction`,
  // and one of them is `gatewayResponse`: the gateway adapters store the
  // **entire raw SOAP response** from Netcash under `raw`, so each member's
  // browser was receiving the full XML for every collection ever attempted on
  // their account — including whatever a fault echoes back of the request that
  // caused it.
  //
  // `idempotencyKey`, `gatewayRef`, `failureReason`, `mandateId` and
  // `reversalOfId` went with it. `ContributionRow` declares five fields on a
  // transaction and renders exactly those five; TypeScript's structural typing
  // accepts an object carrying thirty, so nothing complained.
  const serialized = contributions.map((c: RawContrib) => ({
    id: c.id,
    periodMonth: c.periodMonth,
    periodYear: c.periodYear,
    status: c.status,
    amountDue: c.amountDue.toString(),
    amountPaid: c.amountPaid.toString(),
    dueDate: c.dueDate.toISOString(),
    transactions: c.transactions.map((t: RawTx) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amount: t.amount.toString(),
      createdAt: t.createdAt.toISOString(),
    })),
  }))

  const hasOpen = contributions.some((c: RawContrib) =>
    ['PENDING', 'PARTIAL', 'OVERDUE'].includes(c.status),
  )

  return (
    <div className="space-y-6">

      {/* ── Header + summary + group collection account: ONE Reveal ──── */}
      {/* Round 4 merged the summary cards and the account box into one
          Reveal (see the reasoning kept below) but left the header as its
          own, separate, third Reveal right above them. Same mechanism,
          different seam: the header and the summary cards sit close enough
          together on a short mobile viewport that they cross the reveal
          threshold within the same scroll/load moment, each with its own
          IntersectionObserver and its own independently-settling
          translateY transform — which is exactly what reads as a
          torn/scratched line where the header meets the cards below it.
          This is very likely why the page still "scratched" after Round 4
          fixed the seam one row down: that fix was real, it just didn't
          cover every boundary on the page.

          Merging all three into one Reveal removes every remaining seam on
          this page's initial load, not just the one between the cards and
          the account box.

          Original reasoning, still the mechanism at work: each Reveal owns
          its own IntersectionObserver, so an identical `delay` between two
          separate Reveals only means each transform is scheduled the same
          distance behind *that element's own* threshold crossing — not the
          same distance behind each other's. One Reveal, one observer, one
          transform, one settle: there is no seam left to open. */}
      <Reveal variant="up" className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-xxm-green/10 flex items-center justify-center shrink-0">
              <Wallet size={22} className="text-xxm-green" aria-hidden />
            </div>
            <div>
              <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Contributions</h1>
              <p className="text-sm text-xxm-gray-500 mt-1">Your monthly payment history and ledger.</p>
            </div>
          </div>
          {hasOpen && (
            <Button asChild className="shrink-0">
              <Link href="/dashboard/contribute">Make a payment</Link>
            </Button>
          )}
        </div>
        <ContributionSummaryCards summary={summary} />
        <GroupCollectionAccount />
      </Reveal>

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
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-14 text-center">
          <div className="w-16 h-16 rounded-3xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <Wallet size={26} className="text-xxm-green/40" aria-hidden />
          </div>
          <p className="text-xxm-green-900 font-bold">No contribution records yet</p>
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

