import type { Metadata } from 'next'
import type { BadgeTier } from '@prisma/client'
import { getSession } from '@/lib/session'
import { getMyBadge } from '@/services/badge.service'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatDate } from '@/lib/formatters'
import { BADGE_TIER_CONFIG, BADGE_TIER_ORDER } from '@/lib/badge-tier'
import { Reveal } from '@xxm/ui'
import { ArrowUpRight, CheckCircle2, Circle, History, Trophy, Crown } from 'lucide-react'

export const metadata: Metadata = { title: 'Badges' }

type Metrics = {
  overallScore: number
  consistencyScore: number
  timelinessScore: number
  generosityScore: number
  streakBonus: number
  monthsActive: number
  totalOverdue: number
  overdueInLast6: number
  currentStreak: number
}

type Requirement = { label: string; current: string; target: string; met: boolean }

function nextTierRequirements(tier: BadgeTier, m: Metrics): { tier: BadgeTier; requirements: Requirement[] } | null {
  if (tier === 'AMATEUR') {
    return {
      tier: 'SEMI_PRO',
      requirements: [
        { label: 'Months active',     current: `${m.monthsActive}`,             target: '3',  met: m.monthsActive >= 3 },
        { label: 'Overall score',     current: m.overallScore.toFixed(1),       target: '45', met: m.overallScore >= 45 },
        { label: 'Consistency score', current: m.consistencyScore.toFixed(1),   target: '70', met: m.consistencyScore >= 70 },
      ],
    }
  }
  if (tier === 'SEMI_PRO') {
    return {
      tier: 'PRO',
      requirements: [
        { label: 'Months active',          current: `${m.monthsActive}`,           target: '6',  met: m.monthsActive >= 6 },
        { label: 'Overall score',          current: m.overallScore.toFixed(1),     target: '65', met: m.overallScore >= 65 },
        { label: 'Consistency score',      current: m.consistencyScore.toFixed(1), target: '85', met: m.consistencyScore >= 85 },
        { label: 'Timeliness score',       current: m.timelinessScore.toFixed(1),  target: '80', met: m.timelinessScore >= 80 },
        { label: 'Overdue in last 6 months', current: `${m.overdueInLast6}`,       target: '0',  met: m.overdueInLast6 === 0 },
      ],
    }
  }
  if (tier === 'PRO') {
    return {
      tier: 'WORLD_CLASS',
      requirements: [
        { label: 'Months active',     current: `${m.monthsActive}`,           target: '12', met: m.monthsActive >= 12 },
        { label: 'Overall score',     current: m.overallScore.toFixed(1),     target: '82', met: m.overallScore >= 82 },
        { label: 'Consistency score', current: m.consistencyScore.toFixed(1), target: '95', met: m.consistencyScore >= 95 },
        { label: 'Timeliness score',  current: m.timelinessScore.toFixed(1),  target: '90', met: m.timelinessScore >= 90 },
        { label: 'Lifetime overdue',  current: `${m.totalOverdue}`,           target: '0',  met: m.totalOverdue === 0 },
        { label: 'Current streak',    current: `${m.currentStreak}`,          target: '6',  met: m.currentStreak >= 6 },
      ],
    }
  }
  return null
}

export default async function BadgesPage() {
  const session = await getSession()
  const userId = session!.user.id
  const roles = (session!.user.roles as string[] | undefined) ?? []

  const badge = await getMyBadge(userId, userId, roles)
  const cfg = BADGE_TIER_CONFIG[badge.currentBadge]
  const Icon = cfg.icon
  const next = nextTierRequirements(badge.currentBadge, badge)
  const isMaxTier = badge.currentBadge === 'WORLD_CLASS'

  const dimensions: { label: string; value: number; weight: string }[] = [
    { label: 'Consistency', value: badge.consistencyScore, weight: '40%' },
    { label: 'Timeliness',  value: badge.timelinessScore,  weight: '35%' },
    { label: 'Generosity',  value: badge.generosityScore,  weight: '15%' },
    { label: 'Streak bonus', value: badge.streakBonus,     weight: '10%' },
  ]

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-xxm-gold/12 flex items-center justify-center shrink-0">
          <Trophy size={22} className="text-xxm-gold-dark" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">My Badge</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            Your reputation tier is based on consistency, timeliness, generosity and streaks.
          </p>
        </div>
      </Reveal>

      {/* ── Tier card ─────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="group bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl ${cfg.iconBg} flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110`}>
            <Icon size={30} className={cfg.iconColor} aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badgeClass}`}>
              {cfg.label}
            </span>
            <p className="stat-number text-2xl font-extrabold text-xxm-green-900 mt-1">
              {badge.overallScore.toFixed(1)} <span className="text-sm font-medium text-xxm-gray-400">/ 100</span>
            </p>
          </div>
          {badge.graceUntil && (
            <div className="text-right shrink-0">
              <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">Grace period</p>
              <p className="text-xs text-xxm-gray-500 mt-0.5">until {formatDate(badge.graceUntil)}</p>
            </div>
          )}
        </div>

        {!isMaxTier && next && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-xxm-gray-600 flex items-center gap-1.5">
                <ArrowUpRight size={13} className="text-xxm-gold-dark" aria-hidden />
                Progress to {BADGE_TIER_CONFIG[next.tier].label}
              </p>
              <span className="stat-number text-xs font-bold text-xxm-gold-dark">{badge.progressToNext.toFixed(0)}%</span>
            </div>
            <ProgressBar value={badge.progressToNext} size="lg" variant="gold" animated />
          </div>
        )}

        {isMaxTier && (
          <div className="flex items-center gap-2 bg-xxm-green-50 border border-xxm-green/15 rounded-xl px-4 py-2.5">
            <Crown size={15} className="text-xxm-green" aria-hidden />
            <p className="text-sm font-semibold text-xxm-green-900">You&apos;ve reached the highest tier — World Class!</p>
          </div>
        )}
      </Reveal>

      {/* ── Dimension breakdown ─────────────────────────────── */}
      <Reveal variant="up" delay={200} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-4">
        <h2 className="font-display text-base font-bold text-xxm-green-900">Score breakdown</h2>
        <div className="space-y-4">
          {dimensions.map((d) => (
            <div key={d.label}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-xxm-gray-600">
                  {d.label} <span className="text-xxm-gray-400 font-normal">({d.weight} weight)</span>
                </p>
                <span className="stat-number text-xs font-bold text-xxm-green-700">{d.value.toFixed(1)}</span>
              </div>
              <ProgressBar value={d.value} size="sm" variant="default" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <Stat label="Months active" value={`${badge.monthsActive}`} />
          <Stat label="Current streak" value={`${badge.currentStreak} mo`} />
          <Stat label="Longest streak" value={`${badge.longestStreak} mo`} />
          <Stat label="Avg contribution" value={`R${badge.avgContribution.toFixed(0)}`} />
        </div>
      </Reveal>

      {/* ── Next tier requirements ──────────────────────────── */}
      {next && (
        <Reveal variant="up" delay={300} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-3">
          <h2 className="font-display text-base font-bold text-xxm-green-900">
            Requirements for {BADGE_TIER_CONFIG[next.tier].label}
          </h2>
          <div className="divide-y divide-xxm-gray-50">
            {next.requirements.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5">
                  {r.met
                    ? <CheckCircle2 size={16} className="text-xxm-green shrink-0" aria-hidden />
                    : <Circle size={16} className="text-xxm-gray-300 shrink-0" aria-hidden />
                  }
                  <span className={`text-sm font-medium ${r.met ? 'text-xxm-green-900' : 'text-xxm-gray-600'}`}>{r.label}</span>
                </div>
                <span className="stat-number text-xs font-semibold text-xxm-gray-400">
                  {r.current} <span className="text-xxm-gray-300">/ {r.target}</span>
                </span>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* ── History ──────────────────────────────────────────── */}
      <Reveal variant="up" delay={300} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-3">
        <h2 className="font-display text-base font-bold text-xxm-green-900 flex items-center gap-2">
          <History size={16} className="text-xxm-gray-400" aria-hidden />
          Tier history
        </h2>
        {badge.history.length === 0 ? (
          <p className="text-sm text-xxm-gray-400">No tier changes yet — keep up your contributions!</p>
        ) : (
          <div className="divide-y divide-xxm-gray-50">
            {badge.history.map((h) => {
              const toCfg = BADGE_TIER_CONFIG[h.toBadge]
              const promoted = BADGE_TIER_ORDER.indexOf(h.toBadge) > BADGE_TIER_ORDER.indexOf((h.fromBadge ?? 'AMATEUR') as BadgeTier)
              return (
                <div key={h.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${toCfg.badgeClass}`}>
                      {h.fromBadge ? `${BADGE_TIER_CONFIG[h.fromBadge].label} → ${toCfg.label}` : `Joined as ${toCfg.label}`}
                    </span>
                    <span className={`text-[11px] font-semibold ${promoted ? 'text-xxm-green' : 'text-red-500'}`}>
                      {promoted ? 'Promoted' : h.fromBadge ? 'Demoted' : ''}
                    </span>
                  </div>
                  <span className="text-[11px] text-xxm-gray-400 shrink-0">{formatDate(h.createdAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </Reveal>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-xxm-green-50/40 rounded-xl px-3 py-2.5">
      <p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">{label}</p>
      <p className="stat-number text-sm font-extrabold text-xxm-green-900 mt-0.5">{value}</p>
    </div>
  )
}
