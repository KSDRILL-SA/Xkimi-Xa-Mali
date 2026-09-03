import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { formatZAR, formatDate } from '@/lib/formatters'
import { Reveal } from '@xxm/ui'
import { ChevronLeft, Lock, Clock, TrendingUp, Wallet, Target as TargetIcon, Flag, CheckCircle2, Star, Camera, Paperclip, FileText, HandCoins } from 'lucide-react'
import { env } from '@/lib/env'
import { getGoal } from '@/services/goal.service'
import { getGoalEngagement } from '@/services/goal-engagement.service'
import { hasActiveMandate } from '@/services/mandate.service'
import { GoalNotFoundError } from '@/lib/errors'
import { ProgressRing } from '@/components/goal/ProgressRing'
import { MilestoneBar } from '@/components/goal/MilestoneBar'
import { GoalEngagement } from '@/components/goal/GoalEngagement'
import { GoalPayCard } from '@/components/goal/GoalPayCard'
import { GoalPlanCard } from '@/components/goal/GoalPlanCard'
import { GoalHistory, type ProgressEntry } from '@/components/goal/GoalHistory'
import { statusTheme, typeTheme, Trophy } from '@/components/goal/goal-theme'
import { MEMBER_PAYMENTS_ENABLED } from '@/lib/payments-enabled'

export const metadata: Metadata = { title: 'Goal Detail' }

const MILESTONES = [0, 25, 50, 75, 100]

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  const { id } = await params

  let goal: Awaited<ReturnType<typeof getGoal>>
  try {
    goal = await getGoal(id, roles)
  } catch (err) {
    if (err instanceof GoalNotFoundError) notFound()
    throw err
  }

  // Only offer the payment path when it can actually succeed: the kill switch
  // is on and the member has a debit order to charge. Otherwise the card would
  // invite a member into a form that fails at submit.
  const canPay = MEMBER_PAYMENTS_ENABLED && goal.status === 'ACTIVE'

  const [engagement, memberHasMandate] = await Promise.all([
    getGoalEngagement(id, session.user.id, roles),
    canPay ? hasActiveMandate(session.user.id, session.user.id, roles) : Promise.resolve(false),
  ])

  const st = statusTheme(goal.status)
  const tt = typeTheme(goal.type)
  // A property access, not a call. The compiler cannot see through a function
  // that returns a component and reads it as one being created during render;
  // every other icon in this app is selected the same way.
  const Icon = goal.status === 'ACHIEVED' ? Trophy : tt.icon
  const pct = goal.progressPct
  const remaining = goal.remaining
  const daysLeft = goal.daysLeft
  const isOverdue = goal.status === 'ACTIVE' && daysLeft < 0
  const progressEntries: ProgressEntry[] = goal.progress

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Back link ─────────────────────────────────────────── */}
      <Link href="/dashboard/goals" className="inline-flex items-center gap-1.5 text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors">
        <ChevronLeft size={15} aria-hidden /> All goals
      </Link>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <Reveal variant="up" className="relative overflow-hidden bg-white rounded-3xl border border-xxm-green/8 shadow-xxm">
        <div className={`pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full bg-gradient-to-br ${tt.wash} blur-3xl opacity-80`} aria-hidden />

        <div className="relative p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <ProgressRing
            value={pct}
            size={150}
            strokeWidth={12}
            colorClass={st.ring}
            labelClass={pct >= 100 ? 'text-xxm-green' : 'text-xxm-green-900'}
            sublabel="complete"
          />

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${tt.chip}`}>
                <Icon size={11} aria-hidden /> {tt.label}
              </span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${st.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${goal.status === 'ACTIVE' ? 'animate-pulse' : ''}`} aria-hidden />
                {st.label}
              </span>
              {goal.isPrimary && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-xxm-gold/20 text-xxm-gold-dark">
                  <Star size={10} aria-hidden /> Our fund
                </span>
              )}
              {goal.isLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                  <Lock size={10} aria-hidden /> Locked
                </span>
              )}
            </div>

            <h1 className="mt-2.5 font-display text-xl font-black text-xxm-green-900 leading-snug">{goal.title}</h1>
            {goal.description ? (
              <p className="text-sm text-xxm-gray-500 mt-1.5 leading-relaxed">{goal.description}</p>
            ) : (
              <p className="text-sm text-xxm-gray-400 mt-1.5 italic">{tt.blurb}</p>
            )}

            <div className="mt-4 flex items-baseline justify-center sm:justify-start gap-1.5">
              <span className="stat-number text-3xl font-black text-xxm-green-900">{formatZAR(goal.currentAmount)}</span>
              <span className="text-xs text-xxm-gray-400">raised of {formatZAR(goal.targetAmount)}</span>
            </div>
          </div>
        </div>

        {/* Stat strip */}
        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-px bg-xxm-gray-100 border-t border-xxm-gray-100">
          <StatCell icon={<Wallet size={13} className="text-xxm-green" aria-hidden />} label="Raised" value={formatZAR(goal.currentAmount)} />
          <StatCell icon={<TargetIcon size={13} className="text-xxm-gold-dark" aria-hidden />} label="Target" value={formatZAR(goal.targetAmount)} />
          <StatCell icon={<TrendingUp size={13} className="text-sky-600" aria-hidden />} label="Remaining" value={formatZAR(remaining)} />
          <StatCell
            icon={<Clock size={13} className={isOverdue ? 'text-red-500' : 'text-violet-600'} aria-hidden />}
            label={isOverdue ? 'Overdue by' : 'Days left'}
            value={isOverdue ? `${Math.abs(daysLeft)}d` : daysLeft > 0 ? `${daysLeft}d` : 'Today'}
            highlight={isOverdue}
          />
        </div>
      </Reveal>

      {/* ── Milestones ────────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">Milestones</h2>
          <span className="text-xs text-xxm-gray-400 flex items-center gap-1">
            <Clock size={11} aria-hidden /> {isOverdue ? 'Overdue · ' : 'Deadline · '}{formatDate(goal.deadline)}
          </span>
        </div>

        <MilestoneBar value={pct} fromClass={st.barFrom} toClass={st.barTo} height="h-3" />

        <div className="flex justify-between">
          {MILESTONES.map((m) => {
            const reached = pct >= m
            return (
              <div key={m} className="flex flex-col items-center gap-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${reached ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-400'}`}>
                  {reached ? <CheckCircle2 size={13} aria-hidden /> : <Flag size={11} aria-hidden />}
                </div>
                <span className={`text-[10px] font-semibold ${reached ? 'text-xxm-green-900' : 'text-xxm-gray-400'}`}>{m}%</span>
              </div>
            )
          })}
        </div>
      </Reveal>

      {/* ── The fund every contribution flows into ────────────── */}
      {goal.isPrimary && (
        <Reveal variant="up" delay={140} className="flex items-start gap-3 rounded-2xl bg-gradient-to-r from-xxm-gold/12 to-xxm-gold/4 border border-xxm-gold/30 px-5 py-4">
          <div className="w-10 h-10 rounded-2xl bg-xxm-gold/20 flex items-center justify-center shrink-0">
            <Star size={18} className="text-xxm-gold-dark" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold text-xxm-green-900">This is our fund</p>
            <p className="text-xs text-xxm-gray-600 mt-0.5 leading-relaxed">
              Every monthly contribution the brotherhood makes flows straight into this
              goal — the total below fills automatically as members pay. Chip in extra
              any time to push it along faster.
            </p>
          </div>
        </Reveal>
      )}

      {/* ── Status banners ────────────────────────────────────── */}
      {goal.status === 'ACHIEVED' && (
        <Reveal variant="up" delay={150} className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-xxm-green-50 to-xxm-gold/10 border border-xxm-green/15 px-5 py-4">
          <div className="w-10 h-10 rounded-2xl bg-xxm-green/10 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-xxm-green" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold text-xxm-green-800">Goal achieved! 🎉</p>
            <p className="text-xs text-xxm-green-700/80">The brotherhood reached this target together.</p>
          </div>
        </Reveal>
      )}
      {/* ── What the money actually bought ────────────────────── */}
      {/* Step 6, and the point of the whole cycle: "the purchase is shown back
          to the circle. Everyone sees what their money actually did." This is
          the screen members look at, so this is where it has to appear. */}
      {goal.outcomeNote && (
        <Reveal variant="up" delay={155}>
          <div className="rounded-3xl border border-xxm-gold/25 bg-gradient-to-br from-xxm-gold/8 to-white p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-xxm-gold/15 flex items-center justify-center shrink-0">
                <Camera size={20} className="text-xxm-gold-dark" aria-hidden />
              </div>
              <div>
                <h2 className="font-display text-base font-extrabold text-xxm-green-900">
                  What this bought
                </h2>
                {goal.outcomeRecordedAt && (
                  <p className="text-[11px] text-xxm-gray-400 mt-0.5">
                    Documented {new Date(goal.outcomeRecordedAt).toLocaleDateString('en-ZA')}
                  </p>
                )}
              </div>
            </div>

            <p className="text-sm text-xxm-gray-700 leading-relaxed whitespace-pre-wrap">
              {goal.outcomeNote}
            </p>

            {goal.outcomeProofUrl && (
              <a
                href={goal.outcomeProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-xxm-green hover:underline"
              >
                <Paperclip size={14} aria-hidden />
                See the photo or receipt
              </a>
            )}
          </div>
        </Reveal>
      )}

      {goal.status === 'FAILED' && (
        <Reveal variant="up" delay={150} className="flex items-center gap-3 rounded-2xl bg-red-50 border border-red-100 px-5 py-4">
          <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
            <Flag size={18} className="text-red-500" aria-hidden />
          </div>
          <p className="text-sm font-medium text-red-700">This goal wasn&apos;t reached by the deadline.</p>
        </Reveal>
      )}

      {/* ── Chip in extra (real money, active goals only) ─────── */}
      {canPay && (
        <Reveal variant="up" delay={165}>
          <GoalPayCard goalId={id} goalTitle={goal.title} remaining={remaining} hasActiveMandate={memberHasMandate} />
        </Reveal>
      )}

      {/* ── Fund it every month ────────────────────────────────── */}
      {/* Beside the one-off card on purpose: one gives now, the other commits.
          Both are only offered on a goal that can still take money. */}
      {canPay && (
        <Reveal variant="up" delay={170}>
          <GoalPlanCard goalId={id} hasActiveMandate={memberHasMandate} />
        </Reveal>
      )}

      {/* ── Engagement: cheer, contribute, discuss ────────────── */}
      <Reveal variant="up" delay={175}>
        <GoalEngagement goalId={id} initial={engagement} contributable={goal.status === 'ACTIVE'} />
      </Reveal>

      {/* ── What this member has given ────────────────────────── */}
      {/*
          Their own payments toward this goal, and nobody else's — what everyone
          together has given is already public as the goal's total; who gave
          what is not.

          This section did not exist, and the gap mattered more than it looked.
          A member's transactions page lists `Transaction` rows and a goal
          payment is not one, so somebody who gave to a goal had no record of it
          anywhere in the app. That was survivable while every goal payment was
          one the member made themselves in-app — their own bank statement said
          so. It stopped being survivable when leadership began recording these
          on their behalf from cash and EFTs: a payment entered against your
          name that you cannot see is the exact thing the proof-of-payment work
          exists to prevent.
      */}
      {engagement.payments.length > 0 && (
        <Reveal variant="up" delay={180}>
          <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest mb-3">
            Your payments toward this goal ({engagement.payments.length})
          </h2>

          <ul className="space-y-2">
            {engagement.payments.map((pmt) => (
              <li key={pmt.id} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="w-8 h-8 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
                    <HandCoins size={14} className="text-xxm-green" aria-hidden />
                  </span>
                  <span className="stat-number text-sm font-bold text-xxm-green-900">
                    {formatZAR(pmt.amount)}
                  </span>
                  {pmt.recordedByLeadership && (
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-xxm-gold/15 text-[10px] font-bold text-xxm-gold-dark">
                      Recorded by leadership
                    </span>
                  )}
                  <span className="text-xs text-xxm-gray-400 ml-auto">{formatDate(pmt.paidAt)}</span>
                </div>

                {pmt.reference && (
                  <p className="mt-2 font-mono text-[11px] text-xxm-gray-400 break-all">{pmt.reference}</p>
                )}

                {/* Their own document, behind a route that re-checks ownership
                    rather than trusting this href. */}
                {pmt.proofUrl && (
                  <p className="mt-2">
                    <a
                      href={`/api/media/proof?ref=${encodeURIComponent(pmt.proofUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-xxm-green hover:text-xxm-canopy underline underline-offset-2"
                    >
                      <FileText size={12} aria-hidden />
                      View proof of payment
                    </a>
                  </p>
                )}

                {pmt.proofWitness && (
                  <p className="mt-2 text-xs text-xxm-gray-500">
                    <span className="font-semibold text-xxm-gray-600">Cash, counted by: </span>
                    {pmt.proofWitness}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Reveal>
      )}

      {/* ── Progress history ──────────────────────────────────── */}
      <Reveal variant="up" delay={200}>
        <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest mb-3">
          Contribution history ({goal.progress.length})
        </h2>

        <GoalHistory entries={progressEntries} isPrimary={goal.isPrimary} />
      </Reveal>
    </div>
  )
}

function StatCell({ icon, label, value, highlight = false }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white px-4 py-4">
      <div className="flex items-center gap-1.5 mb-1">{icon}<p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">{label}</p></div>
      <p className={`stat-number text-base font-extrabold ${highlight ? 'text-red-600' : 'text-xxm-green-900'}`}>{value}</p>
    </div>
  )
}
