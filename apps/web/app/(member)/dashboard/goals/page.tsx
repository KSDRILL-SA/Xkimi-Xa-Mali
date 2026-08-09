import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { formatZAR } from '@/lib/formatters'
import { Reveal } from '@xxm/ui'
import { Target, Trophy, Sparkles, TrendingUp, Star, ArrowRight } from 'lucide-react'
import { getGoals, getGoalStatusCounts } from '@/services/goal.service'
import { isAdmin } from '@/lib/authorization'
import { primaryFundFirst } from '@/lib/goal-order'
import { GoalCard, type GoalCardData } from '@/components/goal/GoalCard'
import { ProposeGoalForm } from '@/components/goal/ProposeGoalForm'

export const metadata: Metadata = { title: 'Goals' }

type GoalStatus = 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED'

const FILTER_LABELS: Record<GoalStatus, string> = {
  DRAFT: 'Draft', ACTIVE: 'Active', ACHIEVED: 'Achieved', FAILED: 'Failed',
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const roles = (session.user.roles as string[] | undefined) ?? []
  const admin = isAdmin(roles)
  const params = await searchParams

  const validStatuses: GoalStatus[] = admin
    ? ['DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED']
    : ['ACTIVE', 'ACHIEVED', 'FAILED']

  const statusFilter = params.status && validStatuses.includes(params.status as GoalStatus)
    ? (params.status as GoalStatus)
    : undefined

  const [{ items }, { active: activeCount, achieved: achievedCount }] = await Promise.all([
    getGoals(statusFilter, 1, 100, roles),
    getGoalStatusCounts(),
  ])

  // The fund a member's monthly contribution actually flows into leads the list.
  const goals = primaryFundFirst(items)
  const primaryFund = goals.find((g) => g.isPrimary)

  // Combined momentum across active goals — the collective "how close are we".
  const activeGoals = goals.filter((g) => g.status === 'ACTIVE')
  const combinedRaised = activeGoals.reduce((s, g) => s + g.currentAmount, 0)
  const combinedTarget = activeGoals.reduce((s, g) => s + g.targetAmount, 0)
  const combinedPct = combinedTarget > 0 ? Math.min(100, Math.round((combinedRaised / combinedTarget) * 100)) : 0

  return (
    <div className="space-y-6">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <Reveal variant="up">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 p-6 md:p-8 text-white shadow-xxm-lg">
          <div className="noise-overlay" aria-hidden />
          <div className="absolute top-0 right-0 w-64 h-64 bg-xxm-gold/10 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none animate-orb-drift-1" aria-hidden />
          <div className="absolute -bottom-12 left-1/4 w-44 h-44 bg-white/5 rounded-full pointer-events-none animate-orb-drift-2" aria-hidden />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 mb-3 glass-gold rounded-full px-3 py-1.5">
              <Sparkles size={12} className="text-xxm-gold" aria-hidden />
              <p className="text-xxm-gold text-[11px] font-bold tracking-widest uppercase">Brotherhood Goals</p>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-black tracking-tight">Financial Goals</h1>
            <p className="text-green-100/75 mt-1.5 text-sm max-w-md leading-relaxed">
              Every contribution moves us closer. Track what we&apos;re building together.
            </p>

            <div className="mt-6 flex flex-wrap items-stretch gap-3">
              <HeroStat icon={<Target size={15} className="text-xxm-gold" aria-hidden />} value={String(activeCount)} label="Active" />
              <HeroStat icon={<Trophy size={15} className="text-xxm-gold" aria-hidden />} value={String(achievedCount)} label="Achieved" />
              <HeroStat
                icon={<TrendingUp size={15} className="text-xxm-gold" aria-hidden />}
                value={`${combinedPct}%`}
                label="Combined progress"
                sub={combinedTarget > 0 ? `${formatZAR(combinedRaised)} of ${formatZAR(combinedTarget)}` : undefined}
              />
            </div>
          </div>
        </div>
      </Reveal>

      {/* ── The fund your contributions flow into ─────────────── */}
      {primaryFund && (
        <Reveal variant="up" delay={60}>
          <Link
            href={`/dashboard/goals/${primaryFund.id}` as Route}
            className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-gradient-to-r from-xxm-gold/12 to-xxm-gold/4 border border-xxm-gold/30 px-5 py-4 transition-all duration-slow hover:border-xxm-gold/50 hover:shadow-gold-sm"
          >
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-xxm-gold-dark">
              <Star size={12} aria-hidden /> Our fund
            </span>
            <span className="font-display text-sm font-extrabold text-xxm-green-900 min-w-0 truncate">{primaryFund.title}</span>
            <span className="text-xs text-xxm-gray-500">
              <span className="stat-number font-bold text-xxm-green-900">{formatZAR(primaryFund.currentAmount)}</span>
              {' '}of {formatZAR(primaryFund.targetAmount)} · {primaryFund.progressPct}%
            </span>
            <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-xxm-green">
              View <ArrowRight size={12} className="transition-transform duration-slow group-hover:translate-x-0.5" aria-hidden />
            </span>
            <p className="w-full text-[11px] text-xxm-gray-500">
              Your monthly contribution lands here automatically — no extra step needed.
            </p>
          </Link>
        </Reveal>
      )}

      {/* ── Propose a Goal ────────────────────────────────────── */}
      {/* Step 1 of the guide's six-step flow. Shown to everyone: a leader is
          also a member, and nothing is lost by their proposal going through
          the same review queue. */}
      <Reveal variant="up" delay={150}>
        <ProposeGoalForm />
      </Reveal>

      {/* ── Filter chips ──────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="flex flex-wrap gap-1.5">
        <FilterChip label="All" href="/dashboard/goals" active={!statusFilter} />
        {validStatuses.map((s) => (
          <FilterChip key={s} label={FILTER_LABELS[s]} href={`/dashboard/goals?status=${s}`} active={statusFilter === s} />
        ))}
      </Reveal>

      {/* ── Goals grid ────────────────────────────────────────── */}
      {goals.length === 0 ? (
        <Reveal variant="up" delay={200}>
          <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-14 text-center">
            <div className="w-16 h-16 rounded-3xl bg-xxm-gold/10 flex items-center justify-center mx-auto mb-4">
              <Target size={26} className="text-xxm-gold-dark/50" aria-hidden />
            </div>
            <p className="text-xxm-green-900 font-bold">No goals here yet</p>
            <p className="text-xxm-gray-400 text-xs mt-1.5 max-w-xs mx-auto">
              {admin
                ? 'Create the first goal from the admin portal to start tracking collective progress.'
                : 'New goals set by the brotherhood will appear here.'}
            </p>
          </div>
        </Reveal>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal, i) => (
            <GoalCard key={goal.id} goal={goal as GoalCardData} index={i} />
          ))}
        </div>
      )}

    </div>
  )
}

function HeroStat({ icon, value, label, sub }: { icon: React.ReactNode; value: string; label: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-[130px] rounded-2xl bg-white/10 border border-white/10 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-[11px] font-semibold text-green-100/70 uppercase tracking-wide">{label}</span></div>
      <p className="stat-number text-xl font-black leading-none">{value}</p>
      {sub && <p className="text-[10px] text-green-100/60 mt-1">{sub}</p>}
    </div>
  )
}

function FilterChip({ label, href, active }: { label: string; href: Route; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-fast ${
        active
          ? 'bg-xxm-green text-white shadow-sm'
          : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200 hover:-translate-y-0.5'
      }`}
    >
      {label}
    </Link>
  )
}
