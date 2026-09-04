import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getContributions, getContributionSummary } from '@/services/contribution.service'
import { getMandates } from '@/services/mandate.service'
import { ContributionHero } from '@/components/contribution/ContributionHero'
import { NextPaymentCard } from '@/components/contribution/NextPaymentCard'
import { GroupCollectionAccount } from '@/components/contribution/GroupCollectionAccount'
import { ContributionLedger } from '@/components/contribution/ContributionLedger'
import { RouterPagination } from '@/components/ui/RouterPagination'
import { Wallet, AlertTriangle } from 'lucide-react'
import { MEMBER_PAYMENTS_ENABLED } from '@/lib/payments-enabled'

export const metadata: Metadata = { title: 'Contributions' }

const PAGE_SIZE = 12

/**
 * ── Rebuilt from scratch, 2026-09-04 ───────────────────────────────────────
 *
 * Seven rounds of patching failed to stop this page tearing on Android. The
 * cause is written up in full in `ContributionHero`: it was never anything on
 * this page. `<main>` in the app shell animated a **translateY** for 400ms on
 * every navigation, and the count-up hooks repainted at 60fps inside that
 * moving layer. Contributions and the dashboard were the only two pages that
 * ran count-ups, and they were the only two pages that ever tore. The shell now
 * fades with opacity alone.
 *
 * With the cause removed, the layout is free to be designed for reading rather
 * than for placating a compositor.
 *
 * ── The order is the argument ──────────────────────────────────────────────
 *
 *   1. What you have saved      — the hero. One number, at the top, unmissable.
 *   2. What you owe next        — the one period that needs action, with the
 *                                 amount on the button.
 *   3. Your record              — the ledger, grouped by year.
 *   4. Where the money goes     — the group account, as reference.
 *
 * The previous order put four equally weighted stat cards first (so no figure
 * led), then bank details, then a mandate warning, then history — with the pay
 * action buried inside whichever of twelve rows happened to be outstanding.
 * Reference material sat above the member's own record, and the primary action
 * was the hardest thing on the page to find.
 *
 * Mobile-first: base styles target a 360px viewport and widen at `sm:`.
 */
export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const roles = session.user.roles ?? []
  const params = await searchParams

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

  const mandateInfo =
    activeMandate && MEMBER_PAYMENTS_ENABLED
      ? {
          bankName: activeMandate.bankAccount.bankName,
          accountNumberMasked: activeMandate.bankAccount.accountNumberMasked,
        }
      : null

  type RawContrib = (typeof contributions)[number]
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
  // `reversalOfId` went with it. The row component declares five fields on a
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

  // The oldest outstanding period, not the newest: arrears are what a stokvel
  // chases, and clearing the oldest month first is what protects a member's
  // standing. The service returns newest first, so the last match is oldest.
  const openPeriods = serialized.filter((c) =>
    ['PENDING', 'PARTIAL', 'OVERDUE'].includes(c.status),
  )
  const nextDue = openPeriods.length > 0 ? openPeriods[openPeriods.length - 1]! : null

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex items-start gap-3 sm:gap-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-1 ring-xxm-green/10 sm:h-12 sm:w-12"
          aria-hidden
        >
          <Wallet size={20} className="text-xxm-green" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-xxm-green-900 sm:text-2xl">
            Contributions
          </h1>
          <p className="mt-0.5 text-[13px] text-xxm-gray-500 sm:text-sm">
            {total > 0
              ? `${total} ${total === 1 ? 'period' : 'periods'} on record`
              : 'Your monthly payment history and ledger.'}
          </p>
        </div>
      </header>

      <ContributionHero summary={summary} />

      {nextDue && (
        <NextPaymentCard
          contribution={nextDue}
          mandate={mandateInfo}
          paymentsEnabled={MEMBER_PAYMENTS_ENABLED}
        />
      )}

      {/* Only when a mandate is a thing a member can act on. With no gateway
          there is nothing to set up, and telling everyone to "enable monthly
          debits" would be an instruction that cannot be followed. */}
      {MEMBER_PAYMENTS_ENABLED && !mandateInfo && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:px-5 sm:py-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800">No active mandate</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Set up a payment mandate to enable monthly debits and manual payments.{' '}
              <Link
                href="/dashboard/mandates"
                className="font-bold underline transition-colors hover:text-amber-900"
              >
                Go to Mandates
              </Link>
            </p>
          </div>
        </div>
      )}

      {contributions.length === 0 ? (
        // p-14 was 56px of padding on every side — on a 360px screen that
        // leaves under 250px for the content it is meant to frame.
        <div className="rounded-3xl border border-xxm-green/8 bg-white p-8 text-center shadow-xxm-sm sm:p-14 sm:shadow-xxm">
          <span
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-1 ring-xxm-green/10"
            aria-hidden
          >
            <Wallet size={26} className="text-xxm-green/50" />
          </span>
          <p className="font-bold text-xxm-green-900">No contribution records yet</p>
          <p className="mx-auto mt-1.5 max-w-xs text-xs text-xxm-gray-400">
            Records are generated automatically each month once your mandate is active.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="px-1 text-xs font-bold uppercase tracking-widest text-xxm-gray-400">
            Payment record
          </h2>
          <ContributionLedger contributions={serialized} mandate={mandateInfo} />
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

      {/* Reference, so it sits below the member's own record rather than
          interrupting it. */}
      <section className="space-y-3">
        <h2 className="px-1 text-xs font-bold uppercase tracking-widest text-xxm-gray-400">
          Where your money goes
        </h2>
        <GroupCollectionAccount />
      </section>
    </div>
  )
}
