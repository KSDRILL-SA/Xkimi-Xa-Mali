'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { ProgressBar } from '@xxm/ui'
import { Target, Trophy, Calendar, CalendarRange, Sparkles, Lock, Check, Trash2, Plus, ArrowRight, type LucideIcon } from 'lucide-react'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'

export type GoalRow = {
  id: string; title: string; type: string; status: string; statusClass: string
  target: string; current: string; progress: number; deadline: string; locked: boolean
}

type GoalAction = (formData: FormData) => Promise<void>

const TYPE_META: Record<string, { label: string; icon: LucideIcon; chip: string; iconColor: string }> = {
  MONTHLY: { label: 'Monthly', icon: Calendar,      chip: 'bg-sky-50 text-sky-700',       iconColor: 'text-sky-600' },
  YEARLY:  { label: 'Yearly',  icon: CalendarRange, chip: 'bg-violet-50 text-violet-700', iconColor: 'text-violet-600' },
  CUSTOM:  { label: 'Custom',  icon: Sparkles,      chip: 'bg-amber-50 text-amber-700',   iconColor: 'text-xxm-gold-dark' },
}

const GRID = 'grid grid-cols-[2fr_96px_96px_150px_120px_110px_190px] gap-3'

export function GoalsTable({
  rows, activateAction, deleteAction, lockAction, progressAction,
}: {
  rows: GoalRow[]
  activateAction: GoalAction
  deleteAction: GoalAction
  lockAction: GoalAction
  progressAction: GoalAction
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-xxm-gold/10 flex items-center justify-center mx-auto mb-4">
          <Target size={24} className="text-xxm-gold-dark/50" aria-hidden />
        </div>
        <p className="text-xxm-gray-600 font-medium">No goals yet</p>
        <p className="text-xxm-gray-400 text-sm mt-1">Create one with the + New Goal form above.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[940px]">
          <div className={`${GRID} px-4 py-3 bg-xxm-gray-50 border-b border-xxm-gray-100`}>
            <Th>Goal</Th>
            <Th right>Target</Th>
            <Th right>Current</Th>
            <Th>Progress</Th>
            <Th center>Status</Th>
            <Th>Deadline</Th>
            <Th center>Actions</Th>
          </div>

          <div className="divide-y divide-xxm-gray-50">
            {rows.map((r, i) => {
              const meta = TYPE_META[r.type] ?? TYPE_META.CUSTOM
              const Icon = r.status === 'Achieved' ? Trophy : meta.icon
              return (
                <div
                  key={r.id}
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  className={`${GRID} px-4 py-3 items-center hover:bg-xxm-green-50/40 transition-colors group animate-fade-in-up`}
                >
                  {/* Goal */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-xxm-gray-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
                      <Icon size={16} className={r.status === 'Achieved' ? 'text-xxm-green' : meta.iconColor} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <Link href={`/goals/${r.id}` as Route} className="text-sm font-semibold text-xxm-green-900 truncate block hover:text-xxm-green hover:underline">
                        {r.title}
                      </Link>
                      <span className={`inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
                    </div>
                    {r.locked && (
                      <span className="ml-auto w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center shrink-0" title="Locked">
                        <Lock size={10} className="text-amber-600" aria-hidden />
                      </span>
                    )}
                  </div>

                  {/* Target / Current */}
                  <span className="stat-number text-sm font-semibold text-xxm-gray-600 text-right tabular-nums">{r.target}</span>
                  <span className="stat-number text-sm font-bold text-xxm-green-900 text-right tabular-nums">{r.current}</span>

                  {/* Progress */}
                  <div className="flex items-center gap-2">
                    <ProgressBar value={r.progress} max={100} size="sm" variant={r.progress >= 100 ? 'success' : 'gold'} className="flex-1" />
                    <span className="stat-number text-[11px] font-bold text-xxm-gray-500 shrink-0 w-9 text-right">{r.progress}%</span>
                  </div>

                  {/* Status */}
                  <div className="flex justify-center">
                    <span className={r.statusClass}>{r.status}</span>
                  </div>

                  {/* Deadline */}
                  <span className="text-xs text-xxm-gray-500">{r.deadline}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 justify-center flex-wrap">
                    {r.status === 'Draft' && (
                      <>
                        <form action={activateAction}>
                          <input type="hidden" name="goalId" value={r.id} />
                          <button type="submit" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-xxm-green-50 text-xxm-green text-xs font-semibold hover:bg-xxm-green hover:text-white transition-colors" title="Activate">
                            <Check size={11} aria-hidden /> Activate
                          </button>
                        </form>
                        {!r.locked && (
                          <form action={deleteAction}>
                            <input type="hidden" name="goalId" value={r.id} />
                            <ConfirmSubmitButton
                              className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete this goal?"
                              message={`"${r.title}" will be permanently deleted. This cannot be undone.`}
                              confirmLabel="Delete goal"
                            >
                              <Trash2 size={12} aria-hidden />
                            </ConfirmSubmitButton>
                          </form>
                        )}
                      </>
                    )}
                    {r.status === 'Active' && (
                      <>
                        {!r.locked && (
                          <form action={lockAction}>
                            <input type="hidden" name="goalId" value={r.id} />
                            <button type="submit" className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-xxm-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Lock" aria-label="Lock">
                              <Lock size={12} aria-hidden />
                            </button>
                          </form>
                        )}
                        <form action={progressAction} className="flex items-center gap-1">
                          <input type="hidden" name="goalId" value={r.id} />
                          <input type="number" name="amount" min={1} step={50} required placeholder="R"
                            className="w-16 rounded-lg border border-xxm-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-xxm-green/30" />
                          <button type="submit" className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-xxm-green-50 text-xxm-green hover:bg-xxm-green hover:text-white transition-colors" title="Add progress" aria-label="Add progress">
                            <Plus size={12} aria-hidden />
                          </button>
                        </form>
                      </>
                    )}
                    <Link href={`/goals/${r.id}` as Route} className="inline-flex items-center gap-0.5 text-xs font-semibold text-xxm-gray-400 hover:text-xxm-green transition-colors">
                      View <ArrowRight size={11} aria-hidden />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Th({ children, right = false, center = false }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <span className={`text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest ${right ? 'text-right' : center ? 'text-center' : ''}`}>
      {children}
    </span>
  )
}
