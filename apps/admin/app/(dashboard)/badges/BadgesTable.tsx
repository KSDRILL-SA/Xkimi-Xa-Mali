'use client'

import { useState } from 'react'
import { DataTable, type Column, ProgressBar } from '@xxm/ui'
import { Gem } from 'lucide-react'
import { BADGE_TIER_LABELS, BADGE_TIER_CLASS } from '@/lib/badge-tier'

export type BadgeRow = {
  userId: string
  name: string
  email: string
  currentBadge: string
  /** Conferred by an admin, not computed. Sits beside the tier. */
  isFounder: boolean
  overallScore: number
  consistencyScore: number
  timelinessScore: number
  generosityScore: number
  streakBonus: number
  progressToNext: number
  currentStreak: number
  monthsActive: number
  /**
   * When these figures were last worked out.
   *
   * A badge is a judgement about how reliable a member has been, and leadership
   * reads this table to make decisions. The figures are recalculated when a
   * contribution changes status and once a month by cron — so they are a month
   * old in ordinary operation, and older than that if the event is ever lost.
   * That is not hypothetical: one member's badge sat unchanged from 11 June to
   * 9 August while they were paying, because the event that triggers the
   * recalculation was failing silently.
   *
   * The table cannot be wrong about the numbers. It could be silent about how
   * old they are, which is its own way of being misleading.
   */
  calculatedAt: string | null
  isStale: boolean
}

export function BadgesTable({ rows }: { rows: BadgeRow[] }) {
  const [data, setData] = useState(rows)

  const handleSort = (key: string, dir: 'asc' | 'desc') => {
    setData((prev) =>
      [...prev].sort((a, b) => {
        const av = a[key as keyof BadgeRow]
        const bv = b[key as keyof BadgeRow]
        if (typeof av === 'number' && typeof bv === 'number') {
          return dir === 'asc' ? av - bv : bv - av
        }
        return dir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av))
      }),
    )
  }

  const columns: Column<BadgeRow>[] = [
    { key: 'name', header: 'Member', sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-xxm-green-900 flex items-center gap-1.5">
            {r.name}
            {/* Beside the name rather than in the Tier column: it is not a tier,
                and putting it there would imply it can be earned or lost. */}
            {r.isFounder ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-xxm-gold/40 bg-xxm-gold/10 text-[9px] font-bold text-xxm-gold-dark"
                title="Founder of the collective"
              >
                <Gem size={9} aria-hidden />
                Founder
              </span>
            ) : null}
          </p>
          <p className="text-xs text-xxm-gray-400">{r.email}</p>
        </div>
      ),
    },
    {
      key: 'currentBadge', header: 'Tier', align: 'center', sortable: true,
      render: (r) => (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${BADGE_TIER_CLASS[r.currentBadge as keyof typeof BADGE_TIER_CLASS]}`}>
          {BADGE_TIER_LABELS[r.currentBadge as keyof typeof BADGE_TIER_LABELS]}
        </span>
      ),
    },
    { key: 'overallScore', header: 'Overall', align: 'right', sortable: true, render: (r) => r.overallScore.toFixed(1) },
    {
      key: 'calculatedAt', header: 'Worked out', align: 'right', sortable: false,
      render: (r: BadgeRow) => (
        <span className={r.isStale ? 'text-amber-700 font-semibold' : 'text-xxm-gray-400'}>
          {r.calculatedAt ?? 'never'}
          {r.isStale ? ' · stale' : ''}
        </span>
      ),
    },
    { key: 'consistencyScore', header: 'Consistency', align: 'right', sortable: true, render: (r) => r.consistencyScore.toFixed(1) },
    { key: 'timelinessScore', header: 'Timeliness', align: 'right', sortable: true, render: (r) => r.timelinessScore.toFixed(1) },
    { key: 'generosityScore', header: 'Generosity', align: 'right', sortable: true, render: (r) => r.generosityScore.toFixed(1) },
    { key: 'currentStreak', header: 'Streak', align: 'center', sortable: true, render: (r) => `${r.currentStreak} mo` },
    { key: 'monthsActive', header: 'Active', align: 'center', sortable: true, render: (r) => `${r.monthsActive} mo` },
    {
      key: 'progressToNext', header: 'Progress to next', align: 'center', sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2 min-w-[120px]">
          <ProgressBar value={r.progressToNext} max={100} size="sm" variant="gold" className="flex-1" />
          <span className="text-xs text-xxm-gray-500 shrink-0">{r.progressToNext.toFixed(0)}%</span>
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} data={data} keyExtractor={(r) => r.userId} onSort={handleSort} stickyHeader striped caption="Badges" />
}
