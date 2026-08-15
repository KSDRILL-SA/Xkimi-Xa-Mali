import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { assessErasure, eraseErasableData, type Disposition } from '@/lib/services'
import { requireAdmin } from '@/lib/admin-action'
import { Breadcrumb, Reveal, PageHeader } from '@xxm/ui'
import { formatDate } from '@xxm/utils'
import { ShieldQuestion, Lock, Trash2, Archive, AlertTriangle, Inbox } from 'lucide-react'

export const metadata: Metadata = { title: 'What We Hold' }

const DISPOSITION: Record<Disposition, { label: string; className: string; icon: typeof Lock }> = {
  ERASABLE_NOW: { label: 'Can be deleted now', className: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: Trash2 },
  RETAINED:     { label: 'Must be kept',       className: 'text-amber-700 bg-amber-50 border-amber-200',       icon: Archive },
  PERMANENT:    { label: 'Kept permanently',   className: 'text-xxm-gray-600 bg-xxm-gray-50 border-xxm-gray-200', icon: Lock },
}

async function eraseAction(fd: FormData) {
  'use server'
  const { userId, roles } = await requireAdmin('dsr.erase')
  const requestId = String(fd.get('requestId') ?? '')
  await eraseErasableData(roles, userId, {
    subjectId: String(fd.get('subjectId') ?? ''),
    requestId,
  })
  revalidatePath(`/data-requests/${requestId}/erasure`)
  revalidatePath('/data-requests')
}

export default async function ErasurePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const { id } = await params

  const request = await db.dataSubjectRequest.findUnique({
    where: { id },
    select: { id: true, kind: true, status: true, requesterName: true, subjectId: true, dueAt: true },
  })
  if (!request || !request.subjectId) notFound()

  const assessment = await assessErasure(roles, request.subjectId)
  const closed = request.status === 'COMPLETED' || request.status === 'REFUSED'

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Admin', href: '/' },
          { label: 'Data Requests', href: '/data-requests' },
          { label: 'What we hold' },
        ]}
      />

      <Reveal variant="up">
        <PageHeader
          icon={<ShieldQuestion size={20} aria-hidden />}
          title={`What we hold about ${assessment.subjectName}`}
          subtitle={`${request.kind === 'DELETION' ? 'Deletion' : request.kind} request from ${request.requesterName} · due ${formatDate(request.dueAt)}`}
        />
      </Reveal>

      <Reveal variant="up" delay={60}>
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6">
          <p className="text-sm text-xxm-gray-600 leading-relaxed">
            POPIA gives this person the right to have their information deleted, and tax and
            accounting law requires most of it to be kept anyway. Both are true at once, so the
            answer is normally partial — and a refusal in part{' '}
            <strong className="font-semibold text-xxm-green-900">must come with reasons</strong>.
            The reasons below are written to be given to the requester as they stand.
          </p>
          {assessment.membershipEndedAt ? (
            <p className="text-xs text-xxm-gray-400 mt-3">
              Membership ended {formatDate(assessment.membershipEndedAt)}. Retention periods run
              from that date.
            </p>
          ) : (
            <p className="text-xs text-xxm-gray-400 mt-3">
              Still a member. Most retention periods do not begin until membership ends.
            </p>
          )}
          <p className="text-xs text-xxm-gray-400 mt-1">
            The periods are provisional pending the accountant&apos;s advice — see
            docs/compliance/popia-compliance.md §6.
          </p>
        </div>
      </Reveal>

      <Reveal variant="up" delay={120}>
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm overflow-hidden divide-y divide-xxm-gray-100">
          {assessment.categories.map((c) => {
            // A category holding nothing is not a category being retained. The
            // first run of this screen reported "Must be kept · 0 records" for
            // sign-in history, notifications and the invitation — and this text
            // is written to be read back to the requester, who would be told the
            // Foundation is holding records it does not have.
            const empty = c.count === 0
            const d = empty
              ? { label: 'None held', className: 'text-xxm-gray-500 bg-xxm-gray-50 border-xxm-gray-200', icon: Inbox }
              : DISPOSITION[c.disposition]
            const Icon = d.icon
            return (
              <div key={c.key} className="p-5 flex gap-4">
                <span className={`shrink-0 inline-flex w-9 h-9 rounded-xl items-center justify-center border ${d.className}`}>
                  <Icon size={16} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="font-semibold text-sm text-xxm-green-900">{c.label}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${d.className}`}>
                      {d.label}
                    </span>
                    <span className="text-xs text-xxm-gray-400 tabular-nums">
                      {c.count} record{c.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-xs text-xxm-gray-600 leading-relaxed mt-1.5">
                    {empty ? 'The Foundation holds nothing in this category for this person.' : c.basis}
                  </p>
                  {!empty && c.erasableFrom && c.disposition === 'RETAINED' && (
                    <p className="text-[11px] text-xxm-gray-400 mt-1">
                      Erasable from {formatDate(c.erasableFrom)}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Reveal>

      <Reveal variant="up" delay={180}>
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6">
          {closed ? (
            <p className="text-sm text-xxm-gray-500">
              This request is closed. Reopen it to act on it.
            </p>
          ) : assessment.erasableCount === 0 ? (
            <div className="flex gap-3">
              <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <p className="text-sm text-xxm-gray-600 leading-relaxed">
                Nothing held about this person can lawfully be deleted today. Answer the request by
                explaining what is kept and why, using the reasons above, and record that as the
                outcome.
              </p>
            </div>
          ) : (
            <form action={eraseAction} className="space-y-4">
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="subjectId" value={assessment.subjectId} />
              <div className="flex gap-3">
                <Trash2 size={18} className="text-emerald-600 shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-xxm-gray-600 leading-relaxed">
                  <strong className="font-semibold text-xxm-green-900">
                    {assessment.erasableCount} record{assessment.erasableCount === 1 ? '' : 's'}
                  </strong>{' '}
                  can be deleted now — only the categories marked above. Nothing financial, no
                  mandate, and no audit entry is touched. This cannot be undone, and it is recorded
                  in the audit log against this request.
                </p>
              </div>
              <p className="text-xs text-xxm-gray-400">
                Confirm you have verified who the requester is before continuing. POPIA requires
                that check before anything is deleted.
              </p>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                <Trash2 size={15} aria-hidden />
                Delete what has no remaining basis
              </button>
            </form>
          )}
        </div>
      </Reveal>

      <Link href="/data-requests" className="inline-block text-sm text-xxm-gray-500 hover:text-xxm-green-900 underline">
        Back to data requests
      </Link>
    </div>
  )
}
