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
    <div className="space-y-5 sm:space-y-6">

      {/* ── Header + summary + group collection account: ONE Reveal ────
          One `<Reveal>` for the whole block, not one per section. Each
          Reveal owns its own IntersectionObserver, so adjacent Reveals
          settle their transforms independently — a frame or two apart on a
          slow phone, which reads as a torn seam where two sections meet.
          One observer, one transform, one settle: no seam to open.

          The other half of that bug lived in the children: cards and rows
          declared `transition-all` next to a `hover:-translate-y`, which
          arms a `transform` transition on every child while this ancestor
          is animating one. Fixed in SummaryCards.tsx / ContributionRow.tsx
          by transitioning only the properties that actually change. Both
          halves had to go — that is why earlier passes at this did not
          hold. */}
      <Reveal variant="up" className="space-y-5 sm:space-y-6">
        {/* Header stacks on mobile: at 360px a heading, a subtitle and a
            button cannot share a row without the button crushing the text. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-xxm-green/10 sm:h-12 sm:w-12">
              <Wallet size={20} className="text-xxm-green sm:hidden" aria-hidden />
              <Wallet size={22} className="hidden text-xxm-green sm:block" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl font-extrabold tracking-tight text-xxm-green-900 sm:text-2xl">
                Contributions
              </h1>
              <p className="mt-1 text-[13px] text-xxm-gray-500 sm:text-sm">
                Your monthly payment history and ledger.
              </p>
            </div>
          </div>
          {hasOpen && (
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <Link href="/dashboard/contribute">Make a payment</Link>
            </Button>
          )}
        </div>
        <ContributionSummaryCards summary={summary} />
        <GroupCollectionAccount />
      </Reveal>

      {/* No active mandate warning */}
      {!mandateInfo && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:px-5 sm:py-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800">No active mandate</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Set up a payment mandate to enable monthly debits and manual payments.{' '}
              <Link href="/dashboard/mandates" className="font-bold underline transition-colors hover:text-amber-900">
                Go to Mandates
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Contribution list */}
      {contributions.length === 0 ? (
        // p-14 was 56px of padding on every side — on a 360px screen that
        // leaves under 250px for the content it is meant to frame.
        <div className="rounded-3xl border border-xxm-green/8 bg-white p-8 text-center shadow-xxm sm:p-14">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-xxm-green-50">
            <Wallet size={26} className="text-xxm-green/40" aria-hidden />
          </div>
          <p className="font-bold text-xxm-green-900">No contribution records yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-xs text-xxm-gray-400">
            Records are generated automatically each month once your mandate is active.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-xxm-gray-400">History</h2>
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

