import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { formatDate } from '@/lib/formatters'
import { formatZAR } from '@xxm/utils'
import { Reveal } from '@xxm/ui'
import { Ticket, ShieldCheck, UserCheck } from 'lucide-react'
import { getMyInvitation } from '@/services/invite.service'

export const metadata: Metadata = { title: 'Invitations' }

/**
 * The twelfth tile: the private link that brought this member in.
 *
 * Read-only on purpose. The guide is clear that invitations come from
 * leadership — "a private link, from a leader, to one named person" — so this
 * shows the member their own invitation without offering to issue another. If
 * the founders later decide members may invite, that is a different feature and
 * their decision to make.
 */
export default async function InvitationsPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const invite = await getMyInvitation(session.user.id)

  return (
    <div className="space-y-6">
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 flex items-center justify-center shrink-0 ring-1 ring-xxm-green/10">
          <Ticket size={22} className="text-xxm-green" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Invitations</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">The private link that brought you in</p>
        </div>
      </Reveal>

      {!invite ? (
        <Reveal variant="up" delay={100}>
          <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
              <Ticket size={24} className="text-xxm-green/40" aria-hidden />
            </div>
            <p className="text-xxm-green-900 font-bold">No invitation on record</p>
            <p className="text-xxm-gray-400 text-sm mt-1.5">
              Founding members joined before the invitation system existed, so there is nothing to show here.
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          <Reveal variant="up" delay={100}>
            <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
              <div className="px-6 py-5 border-b border-xxm-gray-100 flex items-center gap-3">
                <UserCheck size={18} className="text-xxm-green shrink-0" aria-hidden />
                <div>
                  <p className="text-sm font-bold text-xxm-green-900">Your invitation</p>
                  <p className="text-[11px] text-xxm-gray-400 mt-0.5">
                    Issued to one named person and usable once
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-xxm-gray-50">
                <Row label="Invited by" value={invite.invitedBy ?? '—'} />
                <Row label="Issued to" value={invite.name} />
                <Row label="Email" value={invite.email} />
                <Row label="Phone" value={invite.phone} />
                <Row label="Invitation code" value={`XKM-${invite.codePrefix}-••••`} mono />
                <Row label="Minimum contribution" value={formatZAR(invite.minimumAmount)} />
                <Row label="Sent" value={formatDate(invite.invitedAt)} />
                <Row
                  label="Accepted"
                  value={invite.acceptedAt ? formatDate(invite.acceptedAt) : '—'}
                />
              </dl>
            </div>
          </Reveal>

          <Reveal variant="up" delay={200}>
            <div className="rounded-3xl border border-xxm-green/10 bg-xxm-green-50/50 p-5 flex items-start gap-3.5">
              <ShieldCheck size={18} className="text-xxm-green shrink-0 mt-0.5" aria-hidden />
              <div className="text-sm text-xxm-gray-600 leading-relaxed">
                <p className="font-bold text-xxm-green-900 mb-1">Yours alone, never shared</p>
                <p>
                  This invitation was created for you by name and can only ever be used once — it has
                  already been accepted. Only the last part of the code is shown, because only a
                  one-way fingerprint of it is stored; the full code was shown once, when it was
                  issued, and cannot be recovered.
                </p>
              </div>
            </div>
          </Reveal>
        </>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-6 py-3.5 grid grid-cols-[140px_1fr] gap-4 items-baseline">
      <dt className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest">{label}</dt>
      <dd className={`text-sm text-xxm-green-900 break-words ${mono ? 'font-mono' : 'font-semibold'}`}>
        {value}
      </dd>
    </div>
  )
}
