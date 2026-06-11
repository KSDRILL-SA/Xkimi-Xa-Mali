import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { formatZAR, formatDate } from '@/lib/formatters'
import { Reveal } from '@xxm/ui'
import { ChevronLeft, Lock, Clock, TrendingUp, Wallet, Target as TargetIcon, Flag, CheckCircle2 } from 'lucide-react'
import { getGoal } from '@/services/goal.service'
import { GoalNotFoundError } from '@/lib/errors'
import { ProgressRing } from '@/components/goal/ProgressRing'
import { MilestoneBar } from '@/components/goal/MilestoneBar'
import { statusTheme, typeTheme, goalIcon } from '@/components/goal/goal-theme'

export const metadata: Metadata = { title: 'Goal Detail' }

type ProgressEntry = { id: string; amount: number; recordedAt: string }

function formatRelative(isoDate: string): string {
  const date = new Date(isoDate)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(date)
}

const MILESTONES = [0, 25, 50, 75, 100]

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  const { id } = await params

  let goal: Awaited<ReturnType<typeof getGoal>>
  try {
    goal = await getGoal(id, roles)
  } catch (err) {
    if (err instanceof GoalNotFoundError) notFound()
    throw err
  }

  const st = statusTheme(goal.status)
  const tt = typeTheme(goal.type)
  const Icon = goalIcon(goal.status, goal.type)
  const pct = goal.progressPct
  const remaining = goal.remaining
  const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000)
  const isOverdue = goal.status === 'ACTIVE' && daysLeft < 0
  const progressEntries: ProgressEntry[] = goal.progress

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Back link ─────────────────────────────────────────── */}
      <Link href="/dashboard/goals" className="inline-flex items-center gap-1.5 text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors">
        <ChevronLeft size={15} aria-hidden /> All goals
      </Link>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <Reveal variant="up" className="relative overflow-hidden bg-white rounded-3xl border border-xxm-green/8 shadow-xxm">
        <div className={`pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-gradient-to-br ${tt.wash} blur-3xl opacity-80`} aria-hidden />

        <div className="relative p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <ProgressRing
            value={pct}
            size={150}
            strokeWidth={12}
            colorClass={st.ring}
            labelClass={pct >= 100 ? 'text-xxm-green' : 'text-xxm-green-900'}
            sublabel="complete"
          />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${tt.chip}`}>
                <Icon size={11} aria-hidden /> {tt.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${st.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${goal.status === 'ACTIVE' ? 'animate-pulse' : ''}`} aria-hidden />
                {st.label}
              </span>
              {goal.isLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                  <Lock size={10} aria-hidden /> Locked
                </span>
              )}
            </div>

            <h1 className="mt-2.5 font-display text-xl font-black text-xxm-green-900 leading-snug">{goal.title}</h1>
            {goal.description ? (
              <p className="text-sm text-xxm-gray-500 mt-1.5 leading-relaxed">{goal.description}</p>
            ) : (
              <p className="text-sm text-xxm-gray-400 mt-1.5 italic">{tt.blurb}</p>
            )}

            <div className="mt-4 flex items-baseline justify-center sm:justify-start gap-1.5">
              <span className="stat-number text-3xl font-black text-xxm-green-900">{formatZAR(goal.currentAmount)}</span>
              <span className="text-xs text-xxm-gray-400">raised of {formatZAR(goal.targetAmount)}</span>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-px bg-xxm-gray-100 border-t border-xxm-gray-100">
          <StatCell icon={<Wallet size={13} className="text-xxm-green" aria-hidden />} label="Raised" value={formatZAR(goal.currentAmount)} />
          <StatCell icon={<TargetIcon size={13} className="text-xxm-gold-dark" aria-hidden />} label="Target" value={formatZAR(goal.targetAmount)} />
          <StatCell icon={<TrendingUp size={13} className="text-sky-600" aria-hidden />} label="Remaining" value={formatZAR(remaining)} />
          <StatCell
            icon={<Clock size={13} className={isOverdue ? 'text-red-500' : 'text-violet-600'} aria-hidden />}
            label={isOverdue ? 'Overdue by' : 'Days left'}
            value={isOverdue ? `${Math.abs(daysLeft)}d` : daysLeft > 0 ? `${daysLeft}d` : 'Today'}
            highlight={isOverdue}
          />
        </div>
      </Reveal>

      {/* ── Milestones ────────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">Milestones</h2>
          <span className="text-xs text-xxm-gray-400 flex items-center gap-1">
            <Clock size={11} aria-hidden /> {isOverdue ? 'Overdue · ' : 'Deadline · '}{formatDate(goal.deadline)}
          </span>
        </div>

        <MilestoneBar value={pct} fromClass={st.barFrom} toClass={st.barTo} height="h-3" />

        <div className="flex justify-between">
          {MILESTONES.map((m) => {
            const reached = pct >= m
            return (
              <div key={m} className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${reached ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-400'}`}>
                  {reached ? <CheckCircle2 size={13} aria-hidden /> : <Flag size={11} aria-hidden />}
                </div>
                <span className={`text-[10px] font-semibold ${reached ? 'text-xxm-green-900' : 'text-xxm-gray-400'}`}>{m}%</span>
              </div>
            )
          })}
        </div>
      </Reveal>

      {/* ── Status banners ────────────────────────────────────── */}
      {goal.status === 'ACHIEVED' && (
        <Reveal variant="up" delay={150} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-xxm-green-50 to-xxm-gold/10 border border-xxm-green/15 px-5 py-4">
          <div className="w-10 h-10 rounded-2xl bg-xxm-green/10 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-xxm-green" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold text-xxm-green-800">Goal achieved! 🎉</p>
            <p className="text-xs text-xxm-green-700/80">The brotherhood reached this target together.</p>
          </div>
        </Reveal>
      )}
      {goal.status === 'FAILED' && (
        <Reveal variant="up" delay={150} className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-100 px-5 py-4">
          <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
            <Flag size={18} className="text-red-500" aria-hidden />
          </div>
          <p className="text-sm font-medium text-red-700">This goal wasn&apos;t reached by the deadline.</p>
        </Reveal>
      )}

      {/* ── Progress history ──────────────────────────────────── */}
      <Reveal variant="up" delay={200}>
        <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest mb-3">
          Contribution history ({goal.progress.length})
        </h2>

        {progressEntries.length === 0 ? (
          <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm-sm p-10 text-center">
            <div className="w-11 h-11 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-3">
              <TrendingUp size={18} className="text-xxm-green-300" aria-hidden />
            </div>
            <p className="text-xxm-gray-400 text-sm font-medium">No contributions recorded yet.</p>
            <p className="text-xxm-gray-400 text-xs mt-1">Progress will appear here as the goal grows.</p>
          </div>
        ) : (
          <div className="relative pl-5">
            {/* timeline rail */}
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-xxm-gray-100" aria-hidden />
            <div className="space-y-2.5">
              {progressEntries.map((entry, idx) => {
                const cumulative = progressEntries.slice(idx).reduce((s, p) => s + Number(p.amount), 0)
                return (
                  <div key={entry.id} className="relative bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm px-4 py-3 flex items-center justify-between hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-slow">
                    <span className="absolute -left-[14px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-xxm-green ring-4 ring-white" aria-hidden />
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
                        <TrendingUp size={14} className="text-xxm-green" aria-hidden />
                      </div>
                      <div>
                        <p className="stat-number text-sm font-bold text-xxm-green-900">+{formatZAR(entry.amount)}</p>
                        <p className="text-[11px] text-xxm-gray-400">{formatRelative(entry.recordedAt)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-xxm-gray-400 uppercase tracking-wide font-semibold">Running total</p>
                      <p className="stat-number text-sm font-bold text-xxm-green-700">{formatZAR(cumulative)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Reveal>
    </div>
  )
}

function StatCell({ icon, label, value, highlight = false }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-1.5 mb-1">{icon}<p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">{label}</p></div>
      <p className={`stat-number text-base font-extrabold ${highlight ? 'text-red-600' : 'text-xxm-green-900'}`}>{value}</p>
    </div>
  )
}
