import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  getGoalById, updateGoal, activateGoal, lockGoal, deleteGoal, recordGoalProgress,
  AdminNotFoundError, AdminConflictError,
} from '@/lib/services'
import { formatZAR, formatDate, MONTHS } from '@xxm/utils'
import { Breadcrumb, Reveal, PageHeader, Alert, ProgressBar } from '@xxm/ui'
import { Target, Trophy, Lock, Clock, TrendingUp, Pencil, Zap, Trash2, Plus } from 'lucide-react'

export const metadata: Metadata = { title: 'Goal Detail' }

const STATUS_CONFIG: Record<string, { label: string; badge: string; bar: 'default' | 'gold' | 'success' | 'danger'; iconBg: string; iconColor: string }> = {
  DRAFT:    { label: 'Draft',    badge: 'bg-xxm-gray-100 text-xxm-gray-600',  bar: 'default', iconBg: 'bg-xxm-gray-100',  iconColor: 'text-xxm-gray-500'  },
  ACTIVE:   { label: 'Active',   badge: 'bg-amber-100 text-amber-700',        bar: 'gold',    iconBg: 'bg-xxm-gold/12',   iconColor: 'text-xxm-gold-dark' },
  ACHIEVED: { label: 'Achieved', badge: 'bg-xxm-green-100 text-xxm-green-700', bar: 'success', iconBg: 'bg-xxm-green/10',  iconColor: 'text-xxm-green'     },
  FAILED:   { label: 'Failed',   badge: 'bg-red-100 text-red-700',            bar: 'danger',  iconBg: 'bg-red-50',         iconColor: 'text-red-500'       },
}

const TYPE_LABELS: Record<string, string> = { MONTHLY: 'Monthly goal', YEARLY: 'Yearly goal', CUSTOM: 'Custom goal' }

const ERRORS: Record<string, string> = {
  update:   'Could not update the goal. Only draft goals can be edited.',
  activate: 'Could not activate the goal.',
  lock:     'Could not lock the goal.',
  progress: 'Could not record progress. Progress can only be added to active goals.',
}

export default async function AdminGoalDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ updated?: string; activated?: string; locked?: string; progress?: string; error?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const { id } = await params
  const sp = await searchParams

  let goal: Awaited<ReturnType<typeof getGoalById>>
  try {
    goal = await getGoalById(roles, id)
  } catch {
    notFound()
  }

  const cfg        = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.DRAFT!
  const target     = Number(goal.targetAmount)
  const current    = Number(goal.currentAmount)
  const pct        = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  const remaining  = Math.max(0, target - current)
  const daysLeft   = Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000)
  const isOverdue  = goal.status === 'ACTIVE' && daysLeft < 0
  const isDraft    = goal.status === 'DRAFT'
  const isActive   = goal.status === 'ACTIVE'
  const isLocked   = goal.lockedAt !== null

  const deadlineDate = new Date(goal.deadline)
  const now = new Date()
  const yearOpts = [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2]
  if (!yearOpts.includes(deadlineDate.getFullYear())) yearOpts.unshift(deadlineDate.getFullYear())

  // ── Server actions ──────────────────────────────────────────────
  // Auth is inlined in each action: a `'use server'` function must not close
  // over a component-scope helper (functions aren't serialisable as bound
  // args), which previously made every action fail.
  async function updateAction(fd: FormData) {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')

    const title       = (fd.get('title') as string)?.trim()
    const description = (fd.get('description') as string)?.trim() || null
    const type        = fd.get('type') as string
    const targetAmount = Number(fd.get('targetAmount'))
    const month       = fd.get('month') as string
    const year        = fd.get('year') as string
    if (!title || !type || !targetAmount || isNaN(targetAmount)) redirect(`/goals/${id}?error=update`)
    const deadline = `${year}-${String(month).padStart(2, '0')}-01`
    try {
      await updateGoal(s.user.id, r, id, { title, description, type, targetAmount, deadline })
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=update`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?updated=1`)
  }

  async function activateAction() {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    try {
      await activateGoal(s.user.id, r, id)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=activate`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?activated=1`)
  }

  async function lockAction() {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    try {
      await lockGoal(s.user.id, r, id)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=lock`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?locked=1`)
  }

  async function deleteAction() {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    await deleteGoal(s.user.id, r, id)
    revalidatePath('/goals')
    redirect('/goals')
  }

  async function progressAction(fd: FormData) {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    const amount = Number(fd.get('amount'))
    const note   = (fd.get('note') as string)?.trim() || undefined
    if (!amount || amount <= 0) redirect(`/goals/${id}?error=progress`)
    try {
      await recordGoalProgress(s.user.id, r, id, amount, note)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=progress`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?progress=1`)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Goals', href: '/goals' }, { label: goal.title }]} />

      <Reveal variant="up">
        <PageHeader
          title={goal.title}
          subtitle={TYPE_LABELS[goal.type] ?? goal.type}
          icon={goal.status === 'ACHIEVED'
            ? <Trophy size={22} className="text-xxm-green" aria-hidden />
            : <Target size={22} className="text-xxm-green" aria-hidden />}
          action={
            <div className="flex items-center gap-2">
              {isLocked && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                  <Lock size={11} aria-hidden /> Locked
                </span>
              )}
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
          }
        />
      </Reveal>

      {/* Flash messages */}
      {sp.updated   && <Alert variant="success" title="Goal updated">Your changes have been saved.</Alert>}
      {sp.activated && <Alert variant="success" title="Goal activated">Members can now see this goal and progress can be recorded.</Alert>}
      {sp.locked    && <Alert variant="success" title="Goal locked">The goal is now locked against further edits.</Alert>}
      {sp.progress  && <Alert variant="success" title="Progress recorded">The goal total has been updated.</Alert>}
      {sp.error     && <Alert variant="error"   title="Action failed">{ERRORS[sp.error] ?? 'Something went wrong.'}</Alert>}

      {/* ── Overview card ─────────────────────────────────────── */}
      <Reveal variant="up" delay={50} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
        {goal.description && (
          <p className="px-6 pt-6 text-sm text-xxm-gray-600 leading-relaxed">{goal.description}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-xxm-gray-100 m-6 rounded-2xl overflow-hidden border border-xxm-gray-100">
          <StatCell label="Raised"    value={formatZAR(current)} />
          <StatCell label="Target"    value={formatZAR(target)} />
          <StatCell label="Remaining" value={formatZAR(remaining)} />
          <StatCell
            label={isOverdue ? 'Overdue by' : 'Days left'}
            value={isOverdue ? `${Math.abs(daysLeft)}d` : daysLeft > 0 ? `${daysLeft}d` : 'Today'}
            highlight={isOverdue}
          />
        </div>

        <div className="px-6 pb-6 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="stat-number font-bold text-xxm-green-900">{pct}%</span>
            <span className="text-xxm-gray-400 text-xs">{formatZAR(current)} of {formatZAR(target)}</span>
          </div>
          <ProgressBar value={pct} max={100} size="lg" variant={cfg.bar} />
          <div className="flex items-center justify-between text-xs text-xxm-gray-400 pt-1">
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : ''}`}>
              <Clock size={11} aria-hidden /> {isOverdue ? 'Overdue · ' : 'Deadline · '}{formatDate(goal.deadline)}
            </span>
            {goal.creator && <span>Created by {goal.creator.firstName} {goal.creator.lastName}</span>}
          </div>
        </div>
      </Reveal>

      {/* ── Actions ───────────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="flex flex-wrap items-center gap-2">
        {isDraft && (
          <form action={activateAction}>
            <button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy transition-colors shadow-xxm-sm">
              <Zap size={14} aria-hidden /> Activate goal
            </button>
          </form>
        )}
        {isActive && !isLocked && (
          <form action={lockAction}>
            <button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 text-amber-700 text-sm font-semibold hover:bg-amber-50 transition-colors">
              <Lock size={14} aria-hidden /> Lock goal
            </button>
          </form>
        )}
        {isDraft && !isLocked && (
          <form action={deleteAction}>
            <button type="submit" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors">
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          </form>
        )}
      </Reveal>

      {/* ── Record progress (ACTIVE) ──────────────────────────── */}
      {isActive && (
        <Reveal variant="up" delay={150} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-xxm-green" aria-hidden />
            <h2 className="font-display text-base font-extrabold text-xxm-green-900">Record progress</h2>
          </div>
          <form action={progressAction} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-xxm-gray-700">Amount (R)</label>
              <input name="amount" type="number" min={1} step={50} required placeholder="e.g. 500"
                className="w-36 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-xxm-gray-700">Note (optional)</label>
              <input name="note" maxLength={200} placeholder="What was this contribution for?"
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy transition-colors shadow-xxm-sm">
              <Plus size={14} aria-hidden /> Add
            </button>
          </form>
        </Reveal>
      )}

      {/* ── Edit (DRAFT only) ─────────────────────────────────── */}
      {isDraft && !isLocked && (
        <Reveal variant="up" delay={200} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Pencil size={16} className="text-xxm-green" aria-hidden />
            <h2 className="font-display text-base font-extrabold text-xxm-green-900">Edit goal</h2>
          </div>
          <form action={updateAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-semibold text-xxm-gray-700">Title</label>
              <input name="title" required minLength={3} maxLength={120} defaultValue={goal.title}
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-semibold text-xxm-gray-700">Description</label>
              <input name="description" maxLength={500} defaultValue={goal.description ?? ''} placeholder="Optional description…"
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-xxm-gray-700">Type</label>
              <select name="type" required defaultValue={goal.type}
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-xxm-gray-700">Target Amount (R)</label>
              <input name="targetAmount" type="number" min={100} step={50} required defaultValue={target}
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="block text-xs font-semibold text-xxm-gray-700">Deadline (month + year)</label>
              <div className="flex gap-2">
                <select name="month" required defaultValue={deadlineDate.getMonth() + 1}
                  className="flex-1 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select name="year" required defaultValue={deadlineDate.getFullYear()}
                  className="w-28 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
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
      )}

      {!isDraft && (
        <p className="text-xs text-xxm-gray-400 flex items-center gap-1.5">
          <Lock size={11} aria-hidden /> Goals can only be edited while in draft. This goal is {cfg.label.toLowerCase()}.
        </p>
      )}

      {/* ── Progress history ──────────────────────────────────── */}
      <Reveal variant="up" delay={250}>
        <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest mb-3">
          Progress history ({goal.progress.length})
        </h2>
        {goal.progress.length === 0 ? (
          <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-10 text-center">
            <div className="w-11 h-11 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-3">
              <TrendingUp size={18} className="text-xxm-green-300" aria-hidden />
            </div>
            <p className="text-xxm-gray-400 text-sm font-medium">No progress recorded yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden divide-y divide-xxm-gray-50">
            {goal.progress.map((p) => (
              <div key={p.id} className="group flex items-center justify-between px-5 py-4 hover:bg-xxm-green-50/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
                    <TrendingUp size={14} className="text-xxm-green" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="stat-number text-sm font-bold text-xxm-green-900">{formatZAR(Number(p.amount))}</p>
                    <p className="text-[11px] text-xxm-gray-400 truncate">
                      {formatDate(p.recordedAt)}
                      {p.recordedBy && ` · ${p.recordedBy.firstName} ${p.recordedBy.lastName}`}
                      {p.note && ` · ${p.note}`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Reveal>
    </div>
  )
}

function StatCell({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white px-4 py-4">
      <p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`stat-number text-lg font-extrabold ${highlight ? 'text-red-600' : 'text-xxm-green-900'}`}>{value}</p>
    </div>
  )
}
