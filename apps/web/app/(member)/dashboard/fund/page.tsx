import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getFundOverview, getMemberFundShare } from '@/services/ledger.service'
import { FundHero } from '@/components/fund/FundHero'
import { MyShareCard } from '@/components/fund/MyShareCard'
import { FundSourceTable } from '@/components/fund/FundSourceTable'
import { GoalBreakdown } from '@/components/fund/GoalBreakdown'
import { SectionHeading } from '@/components/contribution/SectionHeading'
import { ENTER, enterDelay } from '@/components/contribution/motion'
import { Landmark, PiggyBank, ArrowLeftRight, Target, ShieldCheck } from 'lucide-react'

export const metadata: Metadata = { title: 'The Fund' }

/**
 * ── Where the money is ─────────────────────────────────────────────────────
 *
 * This page did not exist, and the figures on it were spread across three
 * other pages or nowhere at all:
 *
 *   - the **total pool** was reachable only through `/api/v1/admin/ledger`,
 *     so no member could ever see what the Foundation holds
 *   - the **split between monthly money and goal money** had been recorded on
 *     every ledger entry since the ledger was written, and nothing read it
 *   - a member's **own goal payments** appeared in no total anywhere: the
 *     dashboard's "Total contributed" sums `Contribution.amountPaid`, and
 *     `GoalPayment` is a different table
 *
 * That last one was the reason to build this now. A member who paid R6 000 in
 * months and R2 000 into goals was shown R6 000 under a label that plainly
 * means everything they had given. The fix is here, and the labels that were
 * wrong elsewhere now say "Monthly contributions" and point at this page.
 *
 * ── Why a page and not a section ───────────────────────────────────────────
 *
 * The group's money and a member's own money are two subjects, and mixing them
 * is what made the numbers confusing in the first place. This page answers
 * them in order — the whole fund, then your share of it, then where it sits —
 * and the pages that were showing fragments now show their own subject only.
 *
 * A stokvel runs on members believing the pot is real. This is the page that
 * shows it.
 *
 * Motion follows `components/contribution/motion.ts` unchanged: opacity-only
 * entrances, transforms on leaves and decorative siblings only.
 */
export default async function FundPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const [fund, share] = await Promise.all([
    getFundOverview(),
    getMemberFundShare(session.user.id),
  ])

  return (
    <div className="space-y-5 sm:space-y-7">
      <header className={`flex items-start gap-3 sm:gap-4 ${ENTER}`}>
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-1 ring-xxm-green/10 sm:h-12 sm:w-12"
          aria-hidden
        >
          <Landmark size={20} className="text-xxm-green" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-xxm-green-900 sm:text-2xl">
            The Fund
          </h1>
          <p className="mt-0.5 text-[13px] text-xxm-gray-500 sm:text-sm">
            Everything the Foundation holds, and where it came from.
          </p>
        </div>
      </header>

      <div className={ENTER} style={enterDelay(60)}>
        <FundHero
          balance={fund.balance}
          monthly={fund.monthly.net}
          goals={fund.goals.net}
        />
      </div>

      <section className={ENTER} style={enterDelay(120)}>
        <SectionHeading
          icon={PiggyBank}
          title="Your share"
          subtitle="What you have given, in full"
        />
        <MyShareCard
          monthly={share.monthly}
          goals={share.goals}
          total={share.total}
          fundBalance={fund.balance}
        />
      </section>

      <section className={ENTER} style={enterDelay(180)}>
        <SectionHeading
          icon={ArrowLeftRight}
          title="Fund movement"
          subtitle="Received, reversed and remaining"
        />
        <FundSourceTable
          monthly={fund.monthly}
          goals={fund.goals}
          balance={fund.balance}
        />
      </section>

      <section className={ENTER} style={enterDelay(240)}>
        <SectionHeading
          icon={Target}
          title="Goals"
          subtitle="What each goal has raised, on its own terms"
          href="/dashboard/goals"
          hrefLabel="All goals"
        />
        <GoalBreakdown goals={fund.perGoal} />
      </section>

      {/* Says where the numbers come from. A total nobody can account for is
          a total nobody trusts, and "the ledger is append-only" is the single
          most reassuring fact about this page. */}
      <section
        className={`flex items-start gap-3 rounded-2xl border border-xxm-green/12 bg-gradient-to-b from-xxm-green-50 to-white px-4 py-3.5 sm:px-5 sm:py-4 ${ENTER}`}
        style={enterDelay(300)}
      >
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-xxm-green" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-xxm-green-900">
            Every figure comes from one record
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-xxm-gray-500">
            The total above and the fund movement table are built from an append-only ledger of{' '}
            {fund.entries.toLocaleString('en-ZA')}{' '}
            {fund.entries === 1 ? 'entry' : 'entries'} — one for every payment received and one
            for every payment reversed. Nothing in it is ever edited or deleted. Your own{' '}
            <Link
              href="/dashboard/transactions"
              className="font-semibold text-xxm-green underline decoration-xxm-green/30 underline-offset-2 transition-colors hover:text-xxm-canopy"
            >
              transaction history
            </Link>{' '}
            lists the monthly payments behind your share of it.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-xxm-gray-500">
            The goals table above is measured differently and is not part of that sum: a goal
            counts what has been raised toward it, and the main fund counts every monthly
            contribution — so the same rand appears in both places by design. Only the fund
            movement table adds up to the total.
          </p>
        </div>
      </section>
    </div>
  )
}
