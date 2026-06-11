import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllGoals, createGoal, activateGoal, lockGoal, deleteGoal, recordGoalProgress } from '@/lib/services'
import { formatZAR, formatDate, MONTHS } from '@xxm/utils'
import { Breadcrumb, Reveal, RouterPagination, PageHeader } from '@xxm/ui'
import { Target } from 'lucide-react'
import { GoalsTable, type GoalRow } from './GoalsTable'

export const metadata: Metadata = { title: 'Goals' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT:    { label: 'Draft',    className: 'xxm-status-pending' },
  ACTIVE:   { label: 'Active',   className: 'xxm-status-success' },
  ACHIEVED: { label: 'Achieved', className: 'xxm-status-success' },
  FAILED:   { label: 'Failed',   className: 'xxm-status-danger'  },
}

async function activateGoalAction(fd: FormData) {
  'use server'
  const goalId = fd.get('goalId') as string
  const s = await auth()
  if (!s?.user?.id) redirect('/login')
  const sr = (s.user.roles as string[] | undefined) ?? []
  if (!sr.includes('ADMIN')) redirect('/forbidden')
  await activateGoal(s.user.id, sr, goalId)
  revalidatePath('/goals')
}

async function deleteGoalAction(fd: FormData) {
  'use server'
  const goalId = fd.get('goalId') as string
  const s = await auth()
  if (!s?.user?.id) redirect('/login')
  const sr = (s.user.roles as string[] | undefined) ?? []
  if (!sr.includes('ADMIN')) redirect('/forbidden')
  await deleteGoal(s.user.id, sr, goalId)
  revalidatePath('/goals')
}

async function lockGoalAction(fd: FormData) {
  'use server'
  const goalId = fd.get('goalId') as string
  const s = await auth()
  if (!s?.user?.id) redirect('/login')
  const sr = (s.user.roles as string[] | undefined) ?? []
  if (!sr.includes('ADMIN')) redirect('/forbidden')
  await lockGoal(s.user.id, sr, goalId)
  revalidatePath('/goals')
}

async function recordGoalProgressAction(fd: FormData) {
  'use server'
  const goalId = fd.get('goalId') as string
  const s = await auth()
  if (!s?.user?.id) redirect('/login')
  const sr = (s.user.roles as string[] | undefined) ?? []
  if (!sr.includes('ADMIN')) redirect('/forbidden')
  const amount = Number(fd.get('amount'))
  if (!amount || amount <= 0) return
  await recordGoalProgress(s.user.id, sr, goalId, amount)
  revalidatePath('/goals')
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; created?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')
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
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    const title         = (fd.get('title') as string)?.trim()
    const description   = (fd.get('description') as string)?.trim() || undefined
    const type          = fd.get('type') as string
    const targetAmount  = Number(fd.get('targetAmount'))
    const month         = fd.get('month') as string
    const year          = fd.get('year') as string
    const deadline      = `${year}-${String(month).padStart(2, '0')}-01`

    if (!title || !type || !targetAmount || isNaN(targetAmount)) return

    await createGoal(s.user.id, r, { title, description, type, targetAmount, deadline })
    redirect('/goals?created=1')
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Goals' }]} />
      <Reveal variant="up">
        <PageHeader title="Goals" subtitle={`${total} total`} icon={<Target size={22} className="text-xxm-green" aria-hidden />} />
      </Reveal>

      {created && (
        <div className="rounded-xl bg-xxm-green-50 border border-xxm-green/20 px-4 py-3 text-sm text-xxm-green font-medium">
          Goal created successfully. Activate it when ready.
        </div>
      )}

      {/* Create goal form */}
      <Reveal variant="up" delay={100}>
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
      </Reveal>

      <Reveal variant="up" delay={200} className="space-y-4">
        <GoalsTable
          rows={rows}
          activateAction={activateGoalAction}
          deleteAction={deleteGoalAction}
          lockAction={lockGoalAction}
          progressAction={recordGoalProgressAction}
        />
        <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl="/goals" className="justify-center" />
      </Reveal>
    </div>
  )
}
