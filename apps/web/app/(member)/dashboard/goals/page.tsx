import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatZAR, formatDate } from '@/lib/formatters'
import { PageHeader } from '@/components/ui/PageHeader'

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

const STATUS_CONFIG: Record<GoalStatus, { label: string; className: string }> = {
  DRAFT:    { label: 'Draft',    className: 'bg-gray-100 text-gray-600' },
  ACTIVE:   { label: 'Active',   className: 'bg-blue-100 text-blue-700' },
  ACHIEVED: { label: 'Achieved', className: 'bg-green-100 text-green-700' },
  FAILED:   { label: 'Failed',   className: 'bg-red-100 text-red-700' },
}

const TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly',
  YEARLY:  'Yearly',
  CUSTOM:  'Custom',
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await auth()
  const isAdmin = (session!.user.roles as string[] | undefined)?.includes('ADMIN') ?? false
  const params = await searchParams

  const validStatuses: GoalStatus[] = ['DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED']
  const statusFilter = params.status && validStatuses.includes(params.status as GoalStatus)
    ? (params.status as GoalStatus)
    : undefined

  const goals = await db.goal.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    orderBy: [{ status: 'asc' }, { deadline: 'asc' }],
  })

  const activeCount = (goals as unknown as GoalRow[]).filter((g) => g.status === 'ACTIVE').length
  const achievedCount = (goals as unknown as GoalRow[]).filter((g) => g.status === 'ACHIEVED').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Financial Goals"
        subtitle={`${activeCount} active · ${achievedCount} achieved`}
      />

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" href="/dashboard/goals" active={!statusFilter} />
        {validStatuses.map((s) => (
          <FilterChip
            key={s}
            label={STATUS_CONFIG[s].label}
            href={`/dashboard/goals?status=${s}`}
            active={statusFilter === s}
          />
        ))}
      </div>

      {/* Goals grid */}
      {goals.length === 0 ? (
        <div className="xxm-card p-10 text-center">
          <p className="text-gray-400 text-sm">No goals found.</p>
          {isAdmin && (
            <p className="text-gray-400 text-xs mt-1">
              Create the first goal via the admin API to start tracking progress.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(goals as unknown as GoalRow[]).map((goal) => {
            const pct = Math.min(
              100,
              Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100),
            )
            const status = goal.status as GoalStatus
            const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT
            const isOverdue =
              status === 'ACTIVE' && new Date(goal.deadline) < new Date()

            return (
              <Link
                key={goal.id}
                href={`/dashboard/goals/${goal.id}`}
                className="xxm-card p-5 space-y-4 hover:shadow-md transition-shadow block"
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xxm-green-900 truncate">{goal.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {TYPE_LABELS[goal.type] ?? goal.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {goal.lockedAt && (
                      <span className="text-xs text-amber-600 font-medium">Locked</span>
                    )}
                    <span className={`status-pill ${cfg.className}`}>{cfg.label}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="h-2.5 rounded-full bg-xxm-green-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        status === 'ACHIEVED' ? 'bg-green-500' :
                        status === 'FAILED'   ? 'bg-red-400'   :
                        'bg-xxm-green'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{formatZAR(goal.currentAmount)} raised</span>
                    <span>{pct}% of {formatZAR(goal.targetAmount)}</span>
                  </div>
                </div>

                {/* Deadline */}
                <p className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  {isOverdue ? 'Overdue · ' : 'Deadline · '}
                  {formatDate(goal.deadline)}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string
  href: Route
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-xxm-green-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </Link>
  )
}
