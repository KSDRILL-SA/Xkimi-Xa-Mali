import type { Metadata } from 'next'
import { formatDate } from '@xxm/utils'
import type { BadgeTier } from '@prisma/client'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllBadges, recalculateBadges } from '@/lib/services'
import { requireAdmin } from '@/lib/admin-action'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'
import { Alert } from '@xxm/ui'
import { Breadcrumb, PageHeader, Reveal, RouterPagination } from '@xxm/ui'
import { Trophy, RefreshCw } from 'lucide-react'
import { BADGE_TIERS, BADGE_TIER_LABELS } from '@/lib/badge-tier'
import { BadgesTable, type BadgeRow } from './BadgesTable'

export const metadata: Metadata = { title: 'Badges' }

export default async function BadgesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tier?: string; recalculated?: string; recalcError?: string }>
}) {
  const session = await auth()
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const tier = params.tier && BADGE_TIERS.includes(params.tier as BadgeTier) ? (params.tier as BadgeTier) : undefined

  const { items, total } = await listAllBadges(roles, { page, limit: 20, tier })

  /**
   * Re-derive every badge from the contribution rows.
   *
   * Badges move on a contribution status change and on the first of each month.
   * Neither reaches a badge that is already wrong — a reversal recorded before
   * the recalculation job was fixed left a member scored on money that had been
   * taken back, with no way to ask for a correction short of waiting a month.
   *
   * Safe to press again: it derives rather than decides, so a second press is
   * the same answer twice. It cannot promote anybody the data does not already
   * support.
   */
  async function recalculate(fd: FormData) {
    'use server'
    const { userId, roles: r, ip } = await requireAdmin('badges.recalculate', { bulk: true })
    const t = String(fd.get('tier') ?? '')
    const back = (extra: string) => `/badges${t ? `?tier=${t}&` : '?'}${extra}`.replace('?&', '?')

    try {
      const res = await recalculateBadges(userId, r, undefined, ip)
      redirect(back(`recalculated=${res.recalculated}`))
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
      redirect(back(`recalcError=${encodeURIComponent(err instanceof Error ? err.message : 'That did not go through')}`))
    }
  }

  const rows: BadgeRow[] = items.map((b) => ({
    userId: b.userId,
    name: `${b.user.firstName} ${b.user.lastName}`,
    email: b.user.email,
    currentBadge: b.currentBadge,
    isFounder: b.isFounder,
    overallScore: b.overallScore,
    consistencyScore: b.consistencyScore,
    timelinessScore: b.timelinessScore,
    generosityScore: b.generosityScore,
    calculatedAt: b.lastCalculatedAt ? formatDate(b.lastCalculatedAt) : null,
    isStale: b.isStale,
    streakBonus: b.streakBonus,
    progressToNext: b.progressToNext,
    currentStreak: b.currentStreak,
    monthsActive: b.monthsActive,
  }))

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Badges' }]} />
      <Reveal variant="up" className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Badges" subtitle={`${total} member${total !== 1 ? 's' : ''}`} icon={<Trophy size={22} className="text-xxm-green" aria-hidden />} />
        {/* Badges move on their own when a contribution changes and on the
            first of the month. This is for the case neither covers: a badge
            that is already wrong, and a month is too long to wait. */}
        <form action={recalculate}>
          <input type="hidden" name="tier" value={tier ?? ''} />
          <ConfirmSubmitButton
            title="Recalculate every badge?"
            message="This re-derives each member's score from their contribution history. It works out the same answer the monthly job would, so pressing it twice changes nothing — it cannot promote anybody the data does not already support."
            confirmLabel="Recalculate"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-xxm-gray-200 text-sm font-semibold text-xxm-gray-700 hover:bg-xxm-gray-50 transition-colors"
          >
            <RefreshCw size={14} aria-hidden />
            Recalculate badges
          </ConfirmSubmitButton>
        </form>
      </Reveal>

      {params.recalculated && (
        <Alert variant="success" title="Badges recalculated">
          {params.recalculated} member{params.recalculated === '1' ? '' : 's'} re-scored from their
          contribution history. A tier a member no longer qualifies for is not dropped on the spot —
          it enters a 60-day grace period first.
        </Alert>
      )}

      {params.recalcError && (
        <Alert variant="error" title="That did not go through">{params.recalcError}</Alert>
      )}

      <Reveal variant="up" delay={100} className="flex flex-wrap gap-1.5">
        <FilterChip label="All" href="/badges" active={!tier} />
        {BADGE_TIERS.map((t) => (
          <FilterChip key={t} label={BADGE_TIER_LABELS[t]} href={`/badges?tier=${t}`} active={tier === t} />
        ))}
      </Reveal>

      <Reveal variant="up" delay={200} className="space-y-4">
        <BadgesTable rows={rows} />
        <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl="/badges" className="justify-center" />
      </Reveal>
    </div>
  )
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        active
          ? 'bg-xxm-green text-white shadow-sm'
          : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'
      }`}
    >
      {label}
    </Link>
  )
}
