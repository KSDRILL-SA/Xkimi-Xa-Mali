import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  getGoalById, updateGoal, activateGoal, lockGoal, deleteGoal, recordGoalProgress, setPrimaryGoal,
  recordGoalOutcome,
  AdminNotFoundError, AdminConflictError,
} from '@/lib/services'
import { Breadcrumb, Reveal, PageHeader, Alert } from '@xxm/ui'
import { Target, Trophy, Lock, Star, Zap, Trash2 } from 'lucide-react'
import { STATUS_CONFIG, TYPE_LABELS, ERRORS } from './goal-display'
import { GoalOverview } from './GoalOverview'
import { GoalFundingPanel } from './GoalFundingPanel'
import { GoalEditForm } from './GoalEditForm'
import { GoalProgressHistory } from './GoalProgressHistory'
import { requireAdmin } from '@/lib/admin-action'
import { storeGoalOutcomeProof, OutcomeProofError } from '@/lib/outcome-storage'
import { GoalOutcomePanel } from './GoalOutcomePanel'

export const metadata: Metadata = { title: 'Goal Detail' }

export default async function AdminGoalDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ updated?: string; activated?: string; locked?: string; progress?: string; primary?: string; error?: string }>
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

  const cfg      = STATUS_CONFIG[goal.status] ?? STATUS_CONFIG.DRAFT!
  const isDraft  = goal.status === 'DRAFT'
  const isActive = goal.status === 'ACTIVE'
  const isLocked = goal.lockedAt !== null

  // ── Server actions ──────────────────────────────────────────────
  async function updateAction(fd: FormData) {
    'use server'
    const { userId, roles: r } = await requireAdmin('goal.update')

    const title       = (fd.get('title') as string)?.trim()
    const description = (fd.get('description') as string)?.trim() || null
    const type        = fd.get('type') as string
    const targetAmount = Number(fd.get('targetAmount'))
    const month       = fd.get('month') as string
    const year        = fd.get('year') as string
    if (!title || !type || !targetAmount || isNaN(targetAmount)) redirect(`/goals/${id}?error=update`)
    const deadline = `${year}-${String(month).padStart(2, '0')}-01`
    try {
      await updateGoal(userId, r, id, { title, description, type, targetAmount, deadline })
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=update`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?updated=1`)
  }

  async function activateAction() {
    'use server'
    const { userId, roles: r } = await requireAdmin('goal.activate')
    try {
      await activateGoal(userId, r, id)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=activate`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?activated=1`)
  }

  async function lockAction() {
    'use server'
    const { userId, roles: r } = await requireAdmin('goal.lock')
    try {
      await lockGoal(userId, r, id)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=lock`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?locked=1`)
  }

  async function deleteAction() {
    'use server'
    const { userId, roles: r } = await requireAdmin('goal.delete')
    await deleteGoal(userId, r, id)
    revalidatePath('/goals')
    redirect('/goals')
  }

  async function progressAction(fd: FormData) {
    'use server'
    const { userId, roles: r } = await requireAdmin('goal.recordProgress')
    const amount = Number(fd.get('amount'))
    const note   = (fd.get('note') as string)?.trim() || undefined
    if (!amount || amount <= 0) redirect(`/goals/${id}?error=progress`)
    try {
      await recordGoalProgress(userId, r, id, amount, note)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=progress`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?progress=1`)
  }

  async function outcomeAction(fd: FormData) {
    'use server'
    const { userId, roles: r, ip } = await requireAdmin('goal.recordOutcome')

    const note  = String(fd.get('outcomeNote') ?? '')
    const proof = fd.get('proof')

    // The note is required; the proof is not. A written account of what the
    // money did must never be blocked because a receipt cannot be found months
    // later — a goal that can never be closed out helps nobody.
    let proofUrl: string | null = null
    if (proof instanceof File && proof.size > 0) {
      try {
        proofUrl = await storeGoalOutcomeProof(id, {
          buffer: Buffer.from(await proof.arrayBuffer()),
          contentType: proof.type,
        })
      } catch (e) {
        if (e instanceof OutcomeProofError) redirect(`/goals/${id}?error=proof`)
        throw e
      }
    }

    try {
      await recordGoalOutcome(userId, r, id, note, proofUrl, ip)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=outcome`)
      throw e
    }
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?outcome=1`)
  }

  async function primaryAction() {
    'use server'
    const { userId, roles: r } = await requireAdmin('goal.setPrimary')
    try {
      await setPrimaryGoal(userId, r, id)
    } catch (e) {
      if (e instanceof AdminConflictError || e instanceof AdminNotFoundError) redirect(`/goals/${id}?error=primary`)
      throw e
    }
    revalidatePath('/goals')
    revalidatePath(`/goals/${id}`)
    redirect(`/goals/${id}?primary=1`)
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
              {goal.isPrimary && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-xxm-gold/15 text-xxm-gold-dark">
                  <Star size={11} aria-hidden /> Primary fund
                </span>
              )}
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
      {sp.primary   && <Alert variant="success" title="Primary fund set">Monthly contributions now fill this fund automatically.</Alert>}
      {sp.error     && <Alert variant="error"   title="Action failed">{ERRORS[sp.error] ?? 'Something went wrong.'}</Alert>}

      <GoalOverview
        description={goal.description}
        status={goal.status}
        target={Number(goal.targetAmount)}
        current={Number(goal.currentAmount)}
        deadline={goal.deadline}
        createdBy={goal.creator ? `${goal.creator.firstName} ${goal.creator.lastName}` : null}
        daysLeft={Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000)}
      />

      {/* ── Status actions ────────────────────────────────────── */}
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

      {isActive && (
        <GoalFundingPanel
          isPrimary={goal.isPrimary}
          title={goal.title}
          progressAction={progressAction}
          primaryAction={primaryAction}
        />
      )}

      {isDraft && !isLocked && (
        <GoalEditForm
          action={updateAction}
          title={goal.title}
          description={goal.description}
          type={goal.type}
          target={Number(goal.targetAmount)}
          deadline={goal.deadline}
        />
      )}

      {!isDraft && (
        <p className="text-xs text-xxm-gray-400 flex items-center gap-1.5">
          <Lock size={11} aria-hidden /> Goals can only be edited while in draft. This goal is {cfg.label.toLowerCase()}.
        </p>
      )}

      <GoalOutcomePanel
        status={goal.status}
        outcomeNote={goal.outcomeNote}
        outcomeProofUrl={goal.outcomeProofUrl}
        outcomeRecordedAt={goal.outcomeRecordedAt}
        recordedBy={goal.outcomeRecorder ? `${goal.outcomeRecorder.firstName} ${goal.outcomeRecorder.lastName}` : null}
        action={outcomeAction}
      />

      <GoalProgressHistory entries={goal.progress} />
    </div>
  )
}
