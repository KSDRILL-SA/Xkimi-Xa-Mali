import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { listAllGoals } from '@/services/admin.service'
import { formatZAR, formatDate } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Goals — Admin' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT:    { label: 'Draft',    className: 'bg-gray-100 text-gray-600' },
  ACTIVE:   { label: 'Active',   className: 'bg-blue-100 text-blue-700' },
  ACHIEVED: { label: 'Achieved', className: 'bg-green-100 text-green-700' },
  FAILED:   { label: 'Failed',   className: 'bg-red-100 text-red-700' },
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
      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Goals</h1>
        <p className="text-sm text-gray-500 mt-1">{total} total</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Goal</th>
                <th className="px-4 py-3 text-right font-semibold">Target</th>
                <th className="px-4 py-3 text-right font-semibold">Progress</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Deadline</th>
                <th className="px-4 py-3 text-center font-semibold hidden md:table-cell">Locked</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">No goals yet.</td>
                </tr>
              ) : (
                (items as GoalRow[]).map((g, i) => {
                  const cfg  = STATUS_CONFIG[g.status] ?? STATUS_CONFIG.DRAFT
                  const pct  = Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100))
                  return (
                    <tr key={g.id} className={`border-t border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{g.title}</p>
                        <p className="text-xs text-gray-400 uppercase">{g.type}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatZAR(Number(g.targetAmount))}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-xxm-green h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-600">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{formatDate(g.deadline)}</td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {g.lockedAt ? (
                          <span className="text-xs text-xxm-green-700 font-semibold">Yes</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/admin/goals?page=${page - 1}`} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">← Prev</Link>}
            {page < totalPages && <Link href={`/admin/goals?page=${page + 1}`} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Next →</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
