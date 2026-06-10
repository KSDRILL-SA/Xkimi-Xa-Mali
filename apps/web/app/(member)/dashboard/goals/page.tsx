import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { formatZAR, formatDate } from '@/lib/formatters'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Reveal } from '@xxm/ui'
import { Target, Trophy, Clock, Lock } from 'lucide-react'

export const metadata: Metadata = { title: 'Goals' }

type GoalStatus = 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED'

type GoalRow = {
  id: string
  title: string
  description: string | null
  type: string
  targetAmount: number | string
  currentAmount: number | string
  deadline: Date
  status: string
  lockedAt: Date | null
}

const STATUS_CONFIG: Record<GoalStatus, {
  label: string
  dot: string
  badge: string
  barVariant: 'default' | 'gold' | 'success' | 'danger'
  cardBorder: string
  iconBg: string
  iconColor: string
}> = {
  DRAFT:    { label: 'Draft',    dot: 'bg-xxm-gray-400',  badge: 'bg-xxm-gray-100 text-xxm-gray-600', barVariant: 'default', cardBorder: 'border-xxm-gray-200',    iconBg: 'bg-xxm-gray-100',  iconColor: 'text-xxm-gray-500' },
  ACTIVE:   { label: 'Active',   dot: 'bg-xxm-gold',      badge: 'bg-amber-100 text-amber-700',       barVariant: 'gold',    cardBorder: 'border-xxm-gold/30',     iconBg: 'bg-xxm-gold/12',  iconColor: 'text-xxm-gold-dark' },
  ACHIEVED: { label: 'Achieved', dot: 'bg-xxm-green',     badge: 'bg-xxm-green-100 text-xxm-green-700', barVariant: 'success', cardBorder: 'border-xxm-green/20', iconBg: 'bg-xxm-green/10', iconColor: 'text-xxm-green' },
  FAILED:   { label: 'Failed',   dot: 'bg-red-500',       badge: 'bg-red-100 text-red-700',           barVariant: 'danger',  cardBorder: 'border-red-200',         iconBg: 'bg-red-50',        iconColor: 'text-red-500' },
}

const TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly goal',
  YEARLY:  'Yearly goal',
  CUSTOM:  'Custom goal',
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await getSession()
  const isAdmin = (session!.user.roles as string[] | undefined)?.includes('ADMIN') ?? false
  const params  = await searchParams

  const validStatuses: GoalStatus[] = ['DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED']
  const statusFilter = params.status && validStatuses.includes(params.status as GoalStatus)
    ? (params.status as GoalStatus)
    : undefined

  const goals = await db.goal.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    orderBy: [{ status: 'asc' }, { deadline: 'asc' }],
  }) as unknown as GoalRow[]

  const activeCount   = goals.filter((g) => g.status === 'ACTIVE').length
  const achievedCount = goals.filter((g) => g.status === 'ACHIEVED').length

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-xxm-gold/12 flex items-center justify-center shrink-0">
          <Target size={22} className="text-xxm-gold-dark" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Financial Goals</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            <span className="font-semibold text-xxm-gold-dark">{activeCount}</span> active &middot;{' '}
            <span className="font-semibold text-xxm-green">{achievedCount}</span> achieved
          </p>
        </div>
      </Reveal>

      {/* ── Filter tabs ───────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="flex flex-wrap gap-1.5">
        <FilterChip label="All" href="/dashboard/goals" active={!statusFilter} />
        {validStatuses.map((s) => (
          <FilterChip
            key={s}
            label={STATUS_CONFIG[s].label}
            href={`/dashboard/goals?status=${s}`}
            active={statusFilter === s}
          />
        ))}
      </Reveal>

      {/* ── Goals grid ────────────────────────────────────── */}
      <Reveal variant="up" delay={200}>
      {goals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-xxm-gold/10 flex items-center justify-center mx-auto mb-4">
            <Target size={24} className="text-xxm-gold-dark/50" aria-hidden />
          </div>
          <p className="text-xxm-gray-600 font-medium">No goals found</p>
          {isAdmin && (
            <p className="text-xxm-gray-400 text-xs mt-1.5 max-w-xs mx-auto">
              Create the first goal from the admin portal to start tracking collective progress.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goals.map((goal) => {
            const pct      = Math.min(100, Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100))
            const status   = goal.status as GoalStatus
            const cfg      = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT
            const isOverdue = status === 'ACTIVE' && new Date(goal.deadline) < new Date()

            return (
              <Link
                key={goal.id}
                href={`/dashboard/goals/${goal.id}`}
                className={`group block bg-white rounded-2xl border ${cfg.cardBorder} shadow-xxm-sm p-5 space-y-4 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-fast ease-smooth`}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl ${cfg.iconBg} flex items-center justify-center shrink-0 mt-0.5 transition-transform duration-slow group-hover:scale-110`}>
                      {status === 'ACHIEVED'
                        ? <Trophy size={15} className={cfg.iconColor} aria-hidden />
                        : <Target  size={15} className={cfg.iconColor} aria-hidden />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xxm-green-900 leading-snug truncate">{goal.title}</p>
                      <p className="text-[11px] text-xxm-gray-400 mt-0.5">{TYPE_LABELS[goal.type] ?? goal.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {goal.lockedAt && (
                      <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center" title="Locked">
                        <Lock size={10} className="text-amber-600" aria-hidden />
                      </div>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden />
                      {cfg.label}
                    </span>
                  </div>
                </div>

                {/* Amounts */}
                <div className="flex items-end justify-between">
                  <div>
                    <p className="stat-number text-xl font-extrabold text-xxm-green-900">{formatZAR(goal.currentAmount)}</p>
                    <p className="text-[11px] text-xxm-gray-400">of {formatZAR(goal.targetAmount)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`stat-number text-xl font-extrabold ${pct >= 100 ? 'text-xxm-green' : 'text-xxm-gold-dark'}`}>{pct}%</p>
                    <p className="text-[11px] text-xxm-gray-400">complete</p>
                  </div>
                </div>

                {/* Progress bar */}
                <ProgressBar
                  value={pct}
                  size="md"
                  variant={cfg.barVariant}
                  animated={status === 'ACTIVE' && pct < 100}
                />

                {/* Deadline */}
                <div className={`flex items-center gap-1.5 text-[11px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-xxm-gray-400'}`}>
                  <Clock size={11} aria-hidden />
                  {isOverdue ? 'Overdue · ' : 'Deadline · '}
                  {formatDate(goal.deadline)}
                </div>
              </Link>
            )
          })}
        </div>
      )}
      </Reveal>

    </div>
  )
}

function FilterChip({ label, href, active }: { label: string; href: Route; active: boolean }) {
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
