'use client'

import { DataTable, type Column, ProgressBar } from '@xxm/ui'

export type GoalRow = {
  id: string; title: string; type: string; status: string; statusClass: string
  target: string; current: string; progress: number; deadline: string; locked: boolean
}

type GoalAction = (formData: FormData) => Promise<void>

export function GoalsTable({
  rows, activateAction, deleteAction, lockAction, progressAction,
}: {
  rows: GoalRow[]
  activateAction: GoalAction
  deleteAction: GoalAction
  lockAction: GoalAction
  progressAction: GoalAction
}) {
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
              <form action={activateAction}>
                <input type="hidden" name="goalId" value={r.id} />
                <button type="submit" className="text-xs text-xxm-green hover:underline font-medium">Activate</button>
              </form>
              <form action={deleteAction}>
                <input type="hidden" name="goalId" value={r.id} />
                <button type="submit" className="text-xs text-red-500 hover:underline font-medium">Delete</button>
              </form>
            </>
          )}
          {r.status === 'Active' && (
            <>
              {!r.locked && (
                <form action={lockAction}>
                  <input type="hidden" name="goalId" value={r.id} />
                  <button type="submit" className="text-xs text-xxm-gray-500 hover:underline font-medium">Lock</button>
                </form>
              )}
              <form action={progressAction} className="flex items-center gap-1">
                <input type="hidden" name="goalId" value={r.id} />
                <input
                  type="number" name="amount" min={1} step={50} required
                  placeholder="R amount"
                  className="w-20 rounded-lg border border-xxm-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-xxm-green/30"
                />
                <button type="submit" className="text-xs text-xxm-green hover:underline font-medium">+Progress</button>
              </form>
            </>
          )}
          {r.locked && r.status !== 'Active' && <span className="text-xs text-xxm-gray-400">Locked</span>}
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Goals" />
}
