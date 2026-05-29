import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { listAllGoals } from '@/services/admin.service'
import { formatZAR, formatDate } from '@/lib/formatters'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { RouterPagination } from '@/components/ui/RouterPagination'

export const metadata: Metadata = { title: 'Goals — Admin' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT:    { label: 'Draft',    className: 'xxm-status-info'    },
  ACTIVE:   { label: 'Active',   className: 'xxm-status-pending' },
  ACHIEVED: { label: 'Achieved', className: 'xxm-status-success' },
  FAILED:   { label: 'Failed',   className: 'xxm-status-danger'  },
}

export default async function AdminGoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total, totalPages } = await listAllGoals(roles, page)

  type GoalRow = {
    id: string; title: string; type: string; status: string;
    targetAmount: unknown; currentAmount: unknown;
    deadline: Date; lockedAt: Date | null; createdAt: Date;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/admin' }, { label: 'Goals' }]} />

      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Goals</h1>
        <p className="text-sm text-xxm-gray-500 mt-1">{total} total</p>
      </div>

      <div className="bg-white rounded-xl border border-xxm-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-xxm-gray-50 text-xs uppercase tracking-wider text-xxm-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Goal</th>
                <th className="px-4 py-3 text-right font-semibold">Target</th>
                <th className="px-4 py-3 text-right font-semibold">Progress</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Deadline</th>
                <th className="px-4 py-3 text-center font-semibold hidden md:table-cell">Locked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-xxm-gray-50">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-xxm-gray-400">No goals yet.</td>
                </tr>
              ) : (
                (items as unknown as GoalRow[]).map((g, i) => {
                  const cfg  = STATUS_CONFIG[g.status] ?? STATUS_CONFIG.DRAFT
                  const pct  = Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100))
                  return (
                    <tr key={g.id} className={`hover:bg-xxm-green-50/30 transition-colors ${i % 2 === 1 ? 'bg-xxm-gray-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-xxm-gray-900">{g.title}</p>
                        <p className="text-xs text-xxm-gray-400 uppercase tracking-wide">{g.type}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-xxm-gray-700 tabular-nums">{formatZAR(Number(g.targetAmount))}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-xxm-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-xxm-green'}`}
                              style={{ width: `${pct}%` }}
                              aria-hidden
                            />
                          </div>
                          <span className="text-xs text-xxm-gray-600 tabular-nums w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cfg.className} role="status">{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-xxm-gray-500 hidden md:table-cell">{formatDate(g.deadline)}</td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {g.lockedAt ? (
                          <span className="text-xs text-xxm-green font-semibold">Yes</span>
                        ) : (
                          <span className="text-xs text-xxm-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RouterPagination totalItems={total} itemsPerPage={25} currentPage={page} baseUrl="/admin/goals" className="justify-center" />
    </div>
  )
}
