import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatZAR, formatDate } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Goal Detail' }

type GoalStatus = 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED'

type ProgressEntry = {
  id: string
  amount: number | string
  recordedAt: Date
}

const STATUS_CONFIG: Record<GoalStatus, { label: string; barClass: string; badgeClass: string }> = {
  DRAFT:    { label: 'Draft',    barClass: 'bg-xxm-gray-300',  badgeClass: 'xxm-status-info'    },
  ACTIVE:   { label: 'Active',   barClass: 'bg-xxm-gold',      badgeClass: 'xxm-status-pending' },
  ACHIEVED: { label: 'Achieved', barClass: 'bg-xxm-green',     badgeClass: 'xxm-status-success' },
  FAILED:   { label: 'Failed',   barClass: 'bg-red-400',       badgeClass: 'xxm-status-danger'  },
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
  await auth()
  const { id } = await params

  const goal = await db.goal.findUnique({
    where: { id },
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
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/goals"
        className="text-sm text-xxm-green-700 hover:text-xxm-green-900 underline underline-offset-2"
      >
        ← All goals
      </Link>

      {/* Goal header */}
      <div className="xxm-card p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-xxm-green-900">{goal.title}</h1>
            {goal.description && (
              <p className="text-sm text-xxm-gray-500 mt-1">{goal.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {goal.lockedAt && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                Locked
              </span>
            )}
            <span className={`status-pill ${cfg.badgeClass}`}>{cfg.label}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Raised" value={formatZAR(goal.currentAmount)} />
          <Stat label="Target" value={formatZAR(goal.targetAmount)} />
          <Stat label="Remaining" value={formatZAR(remaining)} />
          <Stat
            label={isOverdue ? 'Overdue' : 'Days left'}
            value={isOverdue ? `${Math.abs(daysLeft)}d` : daysLeft > 0 ? `${daysLeft}d` : 'Today'}
            highlight={isOverdue}
          />
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-xxm-green-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${cfg.barClass}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-xxm-gray-500">
            <span>{pct}% complete</span>
            <span>Deadline: {formatDate(goal.deadline)}</span>
          </div>
        </div>

        {/* Achieved banner */}
        {status === 'ACHIEVED' && (
          <div className="rounded-lg bg-xxm-green-50 border border-xxm-green/20 px-4 py-3 text-sm text-xxm-green font-medium">
            This goal has been achieved.
          </div>
        )}

        {/* Failed banner */}
        {status === 'FAILED' && (
          <div className="rounded-lg bg-xxm-champagne-200 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
            This goal was not achieved by the deadline.
          </div>
        )}
      </div>

      {/* Progress history */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-xxm-gray-500 uppercase tracking-wide">
          Progress history ({goal.progress.length})
        </h2>

        {goal.progress.length === 0 ? (
          <div className="xxm-card p-8 text-center">
            <p className="text-xxm-gray-400 text-sm">No progress recorded yet.</p>
          </div>
        ) : (
          <div className="xxm-card divide-y divide-gray-100">
            {progressEntries.map((entry, idx) => {
              const runningTotal = progressEntries
                .slice(idx)
                .reduce((sum: number, p: ProgressEntry) => sum + Number(p.amount), 0)

              return (
                <div key={entry.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-medium text-xxm-green-900">
                      {formatZAR(entry.amount)}
                    </p>
                    <p className="text-xs text-xxm-gray-400 mt-0.5">
                      {formatRelative(entry.recordedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-xxm-gray-400">Cumulative</p>
                    <p className="text-sm font-semibold text-xxm-green-700">
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

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="xxm-card p-3">
      <p className="text-xs text-xxm-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${highlight ? 'text-red-600' : 'text-xxm-green-900'}`}>
        {value}
      </p>
    </div>
  )
}
