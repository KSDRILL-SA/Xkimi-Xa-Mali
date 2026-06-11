import type { Metadata } from 'next'
import type { BadgeTier } from '@prisma/client'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllBadges } from '@/lib/services'
import { Breadcrumb, PageHeader, Reveal, RouterPagination } from '@xxm/ui'
import { Trophy } from 'lucide-react'
import { BADGE_TIERS, BADGE_TIER_LABELS } from '@/lib/badge-tier'
import { BadgesTable, type BadgeRow } from './BadgesTable'

export const metadata: Metadata = { title: 'Badges' }

export default async function BadgesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tier?: string }>
}) {
  const session = await auth()
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const tier = params.tier && BADGE_TIERS.includes(params.tier as BadgeTier) ? (params.tier as BadgeTier) : undefined

  const { items, total } = await listAllBadges(roles, { page, limit: 20, tier })

  const rows: BadgeRow[] = items.map((b) => ({
    userId: b.userId,
    name: `${b.user.firstName} ${b.user.lastName}`,
    email: b.user.email,
    currentBadge: b.currentBadge,
    overallScore: b.overallScore,
    consistencyScore: b.consistencyScore,
    timelinessScore: b.timelinessScore,
    generosityScore: b.generosityScore,
    streakBonus: b.streakBonus,
    progressToNext: b.progressToNext,
    currentStreak: b.currentStreak,
    monthsActive: b.monthsActive,
  }))

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Badges' }]} />
      <Reveal variant="up">
        <PageHeader title="Badges" subtitle={`${total} member${total !== 1 ? 's' : ''}`} icon={<Trophy size={22} className="text-xxm-green" aria-hidden />} />
      </Reveal>

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
