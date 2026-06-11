import Link from 'next/link'
import type { BadgeTier } from '@prisma/client'
import { getSession } from '@/lib/session'
import { getMyBadge } from '@/services/badge.service'
import { BADGE_TIER_CONFIG, BADGE_TIER_ORDER } from '@/lib/badge-tier'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ArrowUpRight, Crown } from 'lucide-react'

export async function DashboardBadge() {
  const session = await getSession()
  const userId = session!.user.id
  const roles = (session!.user.roles as string[] | undefined) ?? []

  const badge = await getMyBadge(userId, userId, roles)
  const cfg = BADGE_TIER_CONFIG[badge.currentBadge]
  const Icon = cfg.icon
  const isMax = badge.currentBadge === 'WORLD_CLASS'
  const nextTier = BADGE_TIER_ORDER[BADGE_TIER_ORDER.indexOf(badge.currentBadge) + 1] as BadgeTier | undefined
  const nextLabel = nextTier ? BADGE_TIER_CONFIG[nextTier].label : null

  return (
    <Link
      href="/dashboard/badges"
      className="group relative block overflow-hidden rounded-3xl bg-white border border-xxm-gold/20 shadow-xxm-sm p-5 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-slow ease-smooth"
    >
      <div className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-xxm-gold/20 to-transparent blur-2xl opacity-80 transition-opacity duration-slow group-hover:opacity-100" aria-hidden />

      <div className="relative flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-xxm-gold/20 to-xxm-gold/5 ring-1 ring-xxm-gold/30 flex items-center justify-center shrink-0 transition-transform duration-slow ease-bounce group-hover:scale-110 group-hover:-rotate-6">
          <Icon size={26} className="text-xxm-gold-dark" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-xxm-gold-dark">My Badge</span>
          <p className="font-display text-lg font-black text-xxm-green-900 leading-tight truncate">{cfg.label}</p>
          <p className="stat-number text-xs text-xxm-gray-400">{badge.overallScore.toFixed(1)} / 100 reputation</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-xxm-green shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-slow">
          View <ArrowUpRight size={13} aria-hidden />
        </span>
      </div>

      {!isMax && nextLabel ? (
        <div className="relative mt-4">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-xxm-gray-500">Progress to {nextLabel}</span>
            <span className="stat-number font-bold text-xxm-gold-dark">{badge.progressToNext.toFixed(0)}%</span>
          </div>
          <ProgressBar value={badge.progressToNext} size="sm" variant="gold" animated />
        </div>
      ) : (
        <div className="relative mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-xxm-gold-dark">
          <Crown size={13} aria-hidden /> Highest tier reached — World Class
        </div>
      )}
    </Link>
  )
}
