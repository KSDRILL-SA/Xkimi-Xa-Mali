'use client'

import { Mail, Phone, CalendarClock, CheckCircle2, Ban } from 'lucide-react'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'

export type InviteRow = {
  id: string; name: string; email: string; phone: string; rawStatus: string
  status: string; statusClass: string; minAmount: string; expires: string; accepted: string
}

type RevokeAction = (formData: FormData) => Promise<void>

const AVATAR_COLORS = ['bg-xxm-green', 'bg-indigo-600', 'bg-purple-600', 'bg-sky-600', 'bg-rose-600', 'bg-emerald-600', 'bg-amber-600', 'bg-teal-600']

function avatar(name: string) {
  const initials = name.split(' ').map((p) => p[0] ?? '').slice(0, 2).join('').toUpperCase()
  return { initials, color: AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length] }
}

const GRID = 'grid grid-cols-[2fr_1.1fr_96px_120px_1.1fr_90px] gap-3'

export function InvitationsTable({
  rows, revokeAction,
}: {
  rows: InviteRow[]
  revokeAction: RevokeAction
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
          <Mail size={24} className="text-xxm-green-300" aria-hidden />
        </div>
        <p className="text-xxm-gray-600 font-medium">No invitations yet</p>
        <p className="text-xxm-gray-400 text-sm mt-1">Invite a member to get started.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className={`${GRID} px-4 py-3 bg-xxm-gray-50 border-b border-xxm-gray-100`}>
            <Th>Invited person</Th>
            <Th>Phone</Th>
            <Th right>Min / mo</Th>
            <Th center>Status</Th>
            <Th>Timeline</Th>
            <Th center>Actions</Th>
          </div>

          <div className="divide-y divide-xxm-gray-50">
            {rows.map((r, i) => {
              const { initials, color } = avatar(r.name)
              const accepted = r.rawStatus === 'ACCEPTED' && r.accepted !== '—'
              return (
                <div
                  key={r.id}
                  style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                  className={`${GRID} px-4 py-3 items-center hover:bg-xxm-green-50/40 transition-colors group animate-fade-in-up`}
                >
                  {/* Invited */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl ${color} text-white flex items-center justify-center text-xs font-bold shrink-0 transition-transform duration-slow group-hover:scale-110`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-xxm-green-900 truncate">{r.name}</p>
                      <p className="text-[11px] text-xxm-gray-400 truncate">{r.email}</p>
                    </div>
                  </div>

                  {/* Phone */}
                  <span className="text-xs font-mono text-xxm-gray-600 flex items-center gap-1.5 min-w-0">
                    <Phone size={11} className="text-xxm-gray-300 shrink-0" aria-hidden />
                    <span className="truncate">{r.phone}</span>
                  </span>

                  {/* Min / mo */}
                  <span className="stat-number text-sm font-bold text-xxm-green-900 text-right tabular-nums">{r.minAmount}</span>

                  {/* Status */}
                  <div className="flex justify-center">
                    <span className={r.statusClass}>{r.status}</span>
                  </div>

                  {/* Timeline */}
                  <span className={`text-xs flex items-center gap-1.5 ${accepted ? 'text-xxm-green font-medium' : 'text-xxm-gray-500'}`}>
                    {accepted
                      ? <><CheckCircle2 size={12} className="shrink-0" aria-hidden /> Joined {r.accepted}</>
                      : <><CalendarClock size={12} className="text-xxm-gray-300 shrink-0" aria-hidden /> Expires {r.expires}</>}
                  </span>

                  {/* Actions */}
                  <div className="flex justify-center">
                    {r.rawStatus === 'PENDING' ? (
                      <form action={revokeAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmSubmitButton
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-red-500 text-xs font-semibold hover:bg-red-50 transition-colors"
                          title="Revoke this invitation?"
                          message={`The invite for ${r.name} (${r.email}) will be revoked and its code can no longer be used to register.`}
                          confirmLabel="Revoke invitation"
                        >
                          <Ban size={12} aria-hidden /> Revoke
                        </ConfirmSubmitButton>
                      </form>
                    ) : (
                      <span className="text-[11px] text-xxm-gray-300">—</span>
                    )}
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
