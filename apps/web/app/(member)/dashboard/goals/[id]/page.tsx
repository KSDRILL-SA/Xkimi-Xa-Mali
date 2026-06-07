import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { formatZAR, formatDate } from '@/lib/formatters'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ChevronLeft, Target, Trophy, Lock, Clock, TrendingUp } from 'lucide-react'

export const metadata: Metadata = { title: 'Goal Detail' }

type GoalStatus = 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED'

type ProgressEntry = {
  id: string
  amount: number | string
  recordedAt: Date
}

const STATUS_CONFIG: Record<GoalStatus, {
  label: string
  dot: string
  badge: string
  barVariant: 'default' | 'gold' | 'success' | 'danger'
  iconBg: string
  iconColor: string
}> = {
  DRAFT:    { label: 'Draft',    dot: 'bg-xxm-gray-400',  badge: 'bg-xxm-gray-100 text-xxm-gray-600',    barVariant: 'default', iconBg: 'bg-xxm-gray-100',  iconColor: 'text-xxm-gray-500'  },
  ACTIVE:   { label: 'Active',   dot: 'bg-xxm-gold',      badge: 'bg-amber-100 text-amber-700',           barVariant: 'gold',    iconBg: 'bg-xxm-gold/12',   iconColor: 'text-xxm-gold-dark' },
  ACHIEVED: { label: 'Achieved', dot: 'bg-xxm-green',     badge: 'bg-xxm-green-100 text-xxm-green-700',   barVariant: 'success', iconBg: 'bg-xxm-green/10',  iconColor: 'text-xxm-green'     },
  FAILED:   { label: 'Failed',   dot: 'bg-red-500',       badge: 'bg-red-100 text-red-700',               barVariant: 'danger',  iconBg: 'bg-red-50',         iconColor: 'text-red-500'       },
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(date)
}

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  const { id } = await params

  const goal = await db.goal.findFirst({
    where: { id, ...(roles.includes('ADMIN') ? {} : { status: { not: 'DRAFT' } }) },
    include: {
      progress: {
        orderBy: { recordedAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!goal) notFound()

  const progressEntries: ProgressEntry[] = goal.progress.map((p) => ({
    id: p.id,
    amount: p.amount.toString(),
    recordedAt: p.recordedAt,
  }))

  const status = goal.status as GoalStatus
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT
  const pct = Math.min(
    100,
    Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100),
  )
  const remaining = Math.max(0, Number(goal.targetAmount) - Number(goal.currentAmount))
  const daysLeft = Math.ceil(
    (new Date(goal.deadline).getTime() - Date.now()) / 86_400_000,
  )
  const isOverdue = status === 'ACTIVE' && daysLeft < 0

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Back link ──────────────────────────────── */}
      <Link
        href="/dashboard/goals"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
      >
        <ChevronLeft size={15} aria-hidden />
        All goals
      </Link>

      {/* ── Goal header card ───────────────────────── */}
      <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 px-5 py-5 border-b border-xxm-gray-50">
          <div className="flex items-start gap-4 min-w-0">
            <div className={`w-11 h-11 rounded-2xl ${cfg.iconBg} flex items-center justify-center shrink-0`}>
              {status === 'ACHIEVED'
                ? <Trophy size={20} className={cfg.iconColor} aria-hidden />
                : <Target  size={20} className={cfg.iconColor} aria-hidden />
              }
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-xxm-green-900 leading-snug">{goal.title}</h1>
              {goal.description && (
                <p className="text-sm text-xxm-gray-500 mt-1 leading-relaxed">{goal.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {goal.lockedAt && (
              <div className="w-6 h-6 rounded-md bg-amber-100 flex items-center justify-center" title="Locked">
                <Lock size={11} className="text-amber-600" aria-hidden />
              </div>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden />
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-xxm-gray-50">
          <StatCell label="Raised"   value={formatZAR(goal.currentAmount)} />
          <StatCell label="Target"   value={formatZAR(goal.targetAmount)} />
          <StatCell label="Remaining" value={formatZAR(remaining)} />
          <StatCell
            label={isOverdue ? 'Overdue by' : 'Days left'}
            value={isOverdue ? `${Math.abs(daysLeft)}d` : daysLeft > 0 ? `${daysLeft}d` : 'Today'}
            highlight={isOverdue}
          />
        </div>

        {/* Progress bar section */}
        <div className="px-5 py-5 space-y-3 border-t border-xxm-gray-50">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-xxm-green-900 text-base tabular-nums">{pct}%</span>
            <span className="text-xxm-gray-400">of {formatZAR(goal.targetAmount)}</span>
          </div>
          <ProgressBar value={pct} size="lg" variant={cfg.barVariant} animated={status === 'ACTIVE' && pct < 100} />
          <div className="flex items-center justify-between text-xs text-xxm-gray-400">
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : ''}`}>
              <Clock size={11} aria-hidden />
              {isOverdue ? 'Overdue · ' : 'Deadline · '}
              {formatDate(goal.deadline)}
            </span>
            <span>{formatZAR(goal.currentAmount)} raised</span>
          </div>
        </div>

        {/* Status banners */}
        {status === 'ACHIEVED' && (
          <div className="mx-5 mb-5 flex items-center gap-2.5 rounded-2xl bg-xxm-green-50 border border-xxm-green/15 px-4 py-3">
            <Trophy size={15} className="text-xxm-green shrink-0" aria-hidden />
            <p className="text-sm font-semibold text-xxm-green-800">Congratulations — this goal has been achieved!</p>
          </div>
        )}
        {status === 'FAILED' && (
          <div className="mx-5 mb-5 flex items-center gap-2.5 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
            <Target size={15} className="text-red-400 shrink-0" aria-hidden />
            <p className="text-sm font-medium text-red-700">This goal was not achieved by the deadline.</p>
          </div>
        )}
      </div>

      {/* ── Progress history ───────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">
          Progress history ({goal.progress.length})
        </h2>

        {goal.progress.length === 0 ? (
          <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-10 text-center">
            <div className="w-11 h-11 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-3">
              <TrendingUp size={18} className="text-xxm-green-300" aria-hidden />
            </div>
            <p className="text-xxm-gray-400 text-sm font-medium">No progress recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden divide-y divide-xxm-gray-50">
            {progressEntries.map((entry, idx) => {
              const runningTotal = progressEntries
                .slice(idx)
                .reduce((sum: number, p: ProgressEntry) => sum + Number(p.amount), 0)

              return (
                <div key={entry.id} className="flex items-center justify-between px-5 py-4 hover:bg-xxm-green-50/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-xxm-green-50 flex items-center justify-center shrink-0">
                      <TrendingUp size={13} className="text-xxm-green" aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-xxm-green-900 tabular-nums">
                        {formatZAR(entry.amount)}
                      </p>
                      <p className="text-[11px] text-xxm-gray-400 mt-0.5">
                        {formatRelative(entry.recordedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-xxm-gray-400 uppercase tracking-wide font-semibold">Cumulative</p>
                    <p className="text-sm font-bold text-xxm-green-700 tabular-nums">
                      {formatZAR(runningTotal)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCell({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${highlight ? 'text-red-600' : 'text-xxm-green-900'}`}>
        {value}
      </p>
    </div>
  )
}
