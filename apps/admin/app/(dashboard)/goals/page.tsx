import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { listAllGoals } from '@/lib/services'
import { formatZAR, formatDate } from '@xxm/utils'
import { Breadcrumb, DataTable, type Column, RouterPagination, PageHeader, ProgressBar } from '@xxm/ui'

export const metadata: Metadata = { title: 'Goals' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT:    { label: 'Draft',    className: 'xxm-status-pending' },
  ACTIVE:   { label: 'Active',   className: 'xxm-status-success' },
  ACHIEVED: { label: 'Achieved', className: 'xxm-status-success' },
  FAILED:   { label: 'Failed',   className: 'xxm-status-danger'  },
}

type GoalRow = {
  id: string; title: string; type: string; status: string; statusClass: string
  target: string; current: string; progress: number; deadline: string; locked: boolean
}

const columns: Column<GoalRow>[] = [
  { key: 'title', header: 'Goal', sortable: true },
  { key: 'type',  header: 'Type' },
  { key: 'status', header: 'Status', align: 'center', render: (r) => <span className={r.statusClass}>{r.status}</span> },
  { key: 'target',  header: 'Target',  align: 'right' },
  { key: 'current', header: 'Current', align: 'right' },
  {
    key: 'progress', header: 'Progress', align: 'center',
    render: (r) => (
      <div className="flex items-center gap-2 min-w-[120px]">
        <ProgressBar value={r.progress} max={100} size="sm" variant="success" className="flex-1" />
        <span className="text-xs text-xxm-gray-500 shrink-0">{r.progress}%</span>
      </div>
    ),
  },
  { key: 'deadline', header: 'Deadline' },
  { key: 'locked',   header: 'Locked', align: 'center', render: (r) => <span>{r.locked ? '🔒' : '—'}</span> },
]

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total } = await listAllGoals(roles, page)

  type RawItem = { id: string; title: string; type: string; status: string; targetAmount: unknown; currentAmount: unknown; deadline: Date | null; lockedAt: Date | null }

  const rows: GoalRow[] = (items as unknown as RawItem[]).map((g) => {
    const sc       = STATUS_CONFIG[g.status] ?? { label: g.status, className: 'xxm-status-pending' }
    const target   = Number(g.targetAmount)
    const current  = Number(g.currentAmount)
    const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0

    return {
      id: g.id, title: g.title, type: g.type,
      status: sc.label, statusClass: sc.className,
      target: formatZAR(target), current: formatZAR(current), progress,
      deadline: g.deadline ? formatDate(g.deadline) : '—',
      locked: !!g.lockedAt,
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Goals' }]} />
      <PageHeader title="Goals" subtitle={`${total} total`} />
      <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Goals" />
      <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl="/goals" className="justify-center" />
    </div>
  )
}
