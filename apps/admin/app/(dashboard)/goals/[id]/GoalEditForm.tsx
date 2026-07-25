import { MONTHS } from '@xxm/utils'
import { Reveal } from '@xxm/ui'
import { Pencil } from 'lucide-react'

interface Props {
  action: (formData: FormData) => Promise<void>
  title: string
  description: string | null
  type: string
  target: number
  deadline: Date | string
}

const INPUT = 'w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25'

/** Edit form for a DRAFT goal — once activated, a goal is immutable. */
export function GoalEditForm({ action, title, description, type, target, deadline }: Props) {
  const deadlineDate = new Date(deadline)
  const now = new Date()
  const yearOpts = [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2]
  if (!yearOpts.includes(deadlineDate.getFullYear())) yearOpts.unshift(deadlineDate.getFullYear())

  return (
    <Reveal variant="up" delay={200} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6">
      <div className="flex items-center gap-2 mb-4">
        <Pencil size={16} className="text-xxm-green" aria-hidden />
        <h2 className="font-display text-base font-extrabold text-xxm-green-900">Edit goal</h2>
      </div>
      <form action={action} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="goal-title" className="block text-xs font-semibold text-xxm-gray-700">Title</label>
          <input id="goal-title" name="title" required minLength={3} maxLength={120} defaultValue={title} className={INPUT} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="goal-description" className="block text-xs font-semibold text-xxm-gray-700">Description</label>
          <input id="goal-description" name="description" maxLength={500} defaultValue={description ?? ''} placeholder="Optional description…" className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="goal-type" className="block text-xs font-semibold text-xxm-gray-700">Type</label>
          <select id="goal-type" name="type" required defaultValue={type} className={`${INPUT} bg-white`}>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="goal-target" className="block text-xs font-semibold text-xxm-gray-700">Target Amount (R)</label>
          <input id="goal-target" name="targetAmount" type="number" min={100} step={50} required defaultValue={target} className={INPUT} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="goal-month" className="block text-xs font-semibold text-xxm-gray-700">Deadline (month + year)</label>
          <div className="flex gap-2">
            <select id="goal-month" name="month" required defaultValue={deadlineDate.getMonth() + 1} className={`${INPUT} flex-1 bg-white`}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select name="year" required defaultValue={deadlineDate.getFullYear()} aria-label="Deadline year" className={`${INPUT} w-28 bg-white`}>
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy transition-colors shadow-xxm-sm">
            <Pencil size={14} aria-hidden /> Save changes
          </button>
        </div>
      </form>
    </Reveal>
  )
}
