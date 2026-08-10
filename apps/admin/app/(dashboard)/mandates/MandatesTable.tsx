'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { CreditCard, Building2, CalendarClock, Check, X, ArrowRight } from 'lucide-react'

export type MandateRow = {
  id: string; mandateId: string; member: string; email: string; bank: string
  amount: string; debitDay: number; status: string; statusClass: string; createdAt: string
}

type MandateAction = (formData: FormData) => Promise<void>

const AVATAR_COLORS = ['bg-xxm-green', 'bg-indigo-600', 'bg-purple-600', 'bg-sky-600', 'bg-rose-600', 'bg-emerald-600', 'bg-amber-600', 'bg-teal-600']

function avatar(name: string) {
  const initials = name.split(' ').map((p) => p[0] ?? '').slice(0, 2).join('').toUpperCase()
  return { initials, color: AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length] }
}

// The actions column carries a reason box now, not just two buttons. At 140px
// the box filled the column and left the buttons stacked on top of it; the
// extra room lets Approve sit on one line and the reason on the next.
const GRID = 'grid grid-cols-[1.7fr_1.2fr_1fr_84px_110px_200px] gap-3'

export function MandatesTable({
  rows, approveAction, rejectAction,
}: {
  rows: MandateRow[]
  approveAction: MandateAction
  rejectAction: MandateAction
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
          <CreditCard size={24} className="text-xxm-green-300" aria-hidden />
        </div>
        <p className="text-xxm-gray-600 font-medium">No mandates found</p>
        <p className="text-xxm-gray-400 text-sm mt-1">Try a different status filter.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[780px]">
          <div className={`${GRID} px-4 py-3 bg-xxm-gray-50 border-b border-xxm-gray-100`}>
            <Th>Member</Th>
            <Th>Bank</Th>
            <Th right>Amount</Th>
            <Th center>Day</Th>
            <Th center>Status</Th>
            <Th center>Actions</Th>
          </div>

          <div className="divide-y divide-xxm-gray-50">
            {rows.map((r, i) => {
              const { initials, color } = avatar(r.member)
              return (
                <div
                  key={r.mandateId}
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  className={`${GRID} px-4 py-3 items-center hover:bg-xxm-green-50/40 transition-colors group animate-fade-in-up`}
                >
                  {/* Member */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl ${color} text-white flex items-center justify-center text-xs font-bold shrink-0 transition-transform duration-slow group-hover:scale-110`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-xxm-green-900 truncate">{r.member}</p>
                      <p className="text-[11px] text-xxm-gray-400 truncate">{r.email}</p>
                    </div>
                  </div>

                  {/* Bank */}
                  <div className="min-w-0">
                    <p className="text-xs text-xxm-gray-600 truncate flex items-center gap-1.5">
                      <Building2 size={12} className="text-xxm-gray-300 shrink-0" aria-hidden />{r.bank}
                    </p>
                    <p className="text-[11px] text-xxm-gray-400 mt-0.5">{r.createdAt}</p>
                  </div>

                  {/* Amount */}
                  <span className="stat-number text-sm font-bold text-xxm-green-900 text-right tabular-nums self-center">{r.amount}</span>

                  {/* Debit day */}
                  <div className="flex justify-center">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-xxm-gray-50 text-[11px] font-semibold text-xxm-gray-600">
                      <CalendarClock size={11} className="text-xxm-gray-400" aria-hidden />{r.debitDay}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="flex justify-center">
                    <span className={r.statusClass}>{r.status}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 justify-center flex-wrap">
                    {r.status === 'Pending' && (
                      <>
                        <form action={approveAction}>
                          <input type="hidden" name="mandateId" value={r.mandateId} />
                          <button type="submit" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-xxm-green-50 text-xxm-green text-xs font-semibold hover:bg-xxm-green hover:text-white transition-colors" title="Approve">
                            <Check size={12} aria-hidden /> Approve
                          </button>
                        </form>
                        {/* A rejection stops somebody's contributions, and the
                            member is told why — so the reason is asked for here
                            rather than left to a message that guessed. */}
                        <form action={rejectAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="mandateId" value={r.mandateId} />
                          <input
                            name="reason"
                            type="text"
                            maxLength={500}
                            required
                            minLength={10}
                            placeholder="Reason"
                            aria-label="Reason for rejecting this mandate"
                            className="w-[118px] rounded-lg border border-xxm-gray-200 px-2 py-1 text-xs text-xxm-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                          />
                          <button type="submit" className="inline-flex items-center justify-center w-6 h-6 rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Reject" aria-label="Reject">
                            <X size={13} aria-hidden />
                          </button>
                        </form>
                      </>
                    )}
                    <Link href={`/members/${r.id}` as Route} className="inline-flex items-center gap-0.5 text-xs font-semibold text-xxm-gray-400 hover:text-xxm-green transition-colors">
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
