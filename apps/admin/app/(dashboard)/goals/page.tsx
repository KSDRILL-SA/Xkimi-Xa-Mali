import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllGoals, createGoal, activateGoal, lockGoal, deleteGoal } from '@/lib/services'
import { formatZAR, formatDate, MONTHS } from '@xxm/utils'
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
  {
    key: 'id', header: 'Actions', align: 'center',
    render: (r) => (
      <div className="flex items-center gap-2 justify-center flex-wrap">
        {r.status === 'Draft' && (
          <>
            <form action={async () => {
              'use server'
              const s = await auth()
              await activateGoal(s!.user.id, s!.user.roles as string[], r.id)
              revalidatePath('/goals')
            }}>
              <button type="submit" className="text-xs text-xxm-green hover:underline font-medium">Activate</button>
            </form>
            <form action={async () => {
              'use server'
              const s = await auth()
              await deleteGoal(s!.user.id, s!.user.roles as string[], r.id)
              revalidatePath('/goals')
            }}>
              <button type="submit" className="text-xs text-red-500 hover:underline font-medium">Delete</button>
            </form>
          </>
        )}
        {r.status === 'Active' && !r.locked && (
          <form action={async () => {
            'use server'
            const s = await auth()
            await lockGoal(s!.user.id, s!.user.roles as string[], r.id)
            revalidatePath('/goals')
          }}>
            <button type="submit" className="text-xs text-xxm-gray-500 hover:underline font-medium">Lock</button>
          </form>
        )}
        {r.locked && <span className="text-xs text-xxm-gray-400">Locked</span>}
      </div>
    ),
  },
]

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; created?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))
  const created = params.created === '1'

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

  const now = new Date()
  const currentYear = now.getFullYear()
  const yearOpts = [currentYear, currentYear + 1, currentYear + 2]

  async function handleCreate(fd: FormData) {
    'use server'
    const s = await auth()
    const r = (s!.user.roles as string[] | undefined) ?? []
    const title         = (fd.get('title') as string)?.trim()
    const description   = (fd.get('description') as string)?.trim() || undefined
    const type          = fd.get('type') as string
    const targetAmount  = Number(fd.get('targetAmount'))
    const month         = fd.get('month') as string
    const year          = fd.get('year') as string
    const deadline      = `${year}-${String(month).padStart(2, '0')}-01`

    if (!title || !type || !targetAmount || isNaN(targetAmount)) return

    await createGoal(s!.user.id, r, { title, description, type, targetAmount, deadline })
    redirect('/goals?created=1')
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Goals' }]} />
      <PageHeader title="Goals" subtitle={`${total} total`} />

      {created && (
        <div className="rounded-xl bg-xxm-green-50 border border-xxm-green/20 px-4 py-3 text-sm text-xxm-green font-medium">
          Goal created successfully. Activate it when ready.
        </div>
      )}

      {/* Create goal form */}
      <details className="bg-white rounded-card border border-xxm-green/7 shadow-xxm-sm overflow-hidden group">
        <summary className="px-5 py-4 text-sm font-semibold text-xxm-green cursor-pointer select-none flex items-center justify-between">
          <span>+ New Goal</span>
        </summary>
        <div className="px-5 pb-5 pt-2 border-t border-xxm-gray-100">
          <form action={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-xxm-gray-700">Title *</label>
              <input name="title" required minLength={3} maxLength={120} placeholder="Goal title…"
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-xxm-gray-700">Description</label>
              <input name="description" maxLength={500} placeholder="Optional description…"
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-xxm-gray-700">Type *</label>
              <select name="type" required className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-xxm-gray-700">Target Amount (R) *</label>
              <input name="targetAmount" type="number" min={100} step={50} required placeholder="e.g. 5000"
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-xxm-gray-700">Deadline (month + year) *</label>
              <div className="flex gap-2">
                <select name="month" required className="flex-1 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select name="year" required className="w-24 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                  {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <button type="submit" className="px-5 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors">
                Create Goal
              </button>
            </div>
          </form>
        </div>
      </details>

      <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Goals" />
      <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl="/goals" className="justify-center" />
    </div>
  )
}
