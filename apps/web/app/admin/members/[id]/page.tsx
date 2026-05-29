import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMemberDetail, setMemberStatus, AdminNotFoundError } from '@/services/admin.service'
import { setMemberRole } from '@/services/invite.service'
import { formatDate, formatZAR } from '@/lib/formatters'
import { Breadcrumb } from '@/components/ui/Breadcrumb'

export const metadata: Metadata = { title: 'Member Detail — Admin' }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CONTRIB_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'xxm-status-warning' },
  PARTIAL: { label: 'Partial', className: 'xxm-status-pending' },
  PAID:    { label: 'Paid',    className: 'xxm-status-success' },
  OVERDUE: { label: 'Overdue', className: 'xxm-status-danger'  },
  WAIVED:  { label: 'Waived',  className: 'xxm-status-info'    },
}

const MANDATE_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
  ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
  SUSPENDED: { label: 'Suspended', className: 'xxm-status-warning' },
  CANCELLED: { label: 'Cancelled', className: 'xxm-status-danger'  },
}

const USER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
  PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
  SUSPENDED: { label: 'Suspended', className: 'xxm-status-danger'  },
}

export default async function AdminMemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ updated?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const { id }  = await params
  const sp      = await searchParams

  let member
  try {
    member = await getMemberDetail(roles, id)
  } catch (e) {
    if (e instanceof AdminNotFoundError) notFound()
    throw e
  }

  async function activate() {
    'use server'
    const s = await auth()
    const r = (s!.user.roles as string[] | undefined) ?? []
    await setMemberStatus(s!.user.id, r, id, 'ACTIVE')
    redirect(`/admin/members/${id}?updated=1`)
  }
  async function suspend() {
    'use server'
    const s = await auth()
    const r = (s!.user.roles as string[] | undefined) ?? []
    await setMemberStatus(s!.user.id, r, id, 'SUSPENDED')
    redirect(`/admin/members/${id}?updated=1`)
  }
  async function promoteAdmin() {
    'use server'
    const s = await auth()
    const r = (s!.user.roles as string[] | undefined) ?? []
    await setMemberRole(s!.user.id, r, id, 'ADMIN', true)
    redirect(`/admin/members/${id}?updated=1`)
  }
  async function revokeAdmin() {
    'use server'
    const s = await auth()
    const r = (s!.user.roles as string[] | undefined) ?? []
    await setMemberRole(s!.user.id, r, id, 'ADMIN', false)
    redirect(`/admin/members/${id}?updated=1`)
  }

  const sc = USER_STATUS_CONFIG[member.status] ?? USER_STATUS_CONFIG.PENDING
  const isAdmin = member.roles.some((r) => r.role.name === 'ADMIN')
  type ContribItem = { id: string; periodMonth: number; periodYear: number; amountDue: unknown; amountPaid: unknown; status: string }
  type MandateItem = { id: string; status: string; amount: unknown; debitDay: number; createdAt: Date }

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumb items={[
        { label: 'Admin', href: '/admin' },
        { label: 'Members', href: '/admin/members' },
        { label: `${member.firstName} ${member.lastName}` },
      ]} />

      {sp.updated === '1' && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Member updated successfully.
        </div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-xl border border-xxm-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-xxm-green">
              {member.firstName} {member.lastName}
            </h1>
            <p className="text-sm text-xxm-gray-500 mt-1">{member.email} · {member.phone}</p>
            <p className="text-xs text-xxm-gray-400 mt-1">Joined {formatDate(member.createdAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={sc.className} role="status">{sc.label}</span>
            {member.status !== 'ACTIVE' && (
              <form action={activate}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors">
                  Activate
                </button>
              </form>
            )}
            {member.status === 'ACTIVE' && (
              <form action={suspend}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 font-semibold hover:bg-red-100 border border-red-200 transition-colors">
                  Suspend
                </button>
              </form>
            )}
            {isAdmin ? (
              <form action={revokeAdmin}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-amber-50 text-amber-700 font-semibold hover:bg-amber-100 border border-amber-200 transition-colors">
                  Revoke Admin
                </button>
              </form>
            ) : (
              <form action={promoteAdmin}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-xxm-gold/10 text-xxm-gold font-semibold hover:bg-xxm-gold/20 border border-xxm-gold/30 transition-colors">
                  Make Admin
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-xxm-gray-100">
          {[
            { label: 'Contributions', value: (member._count as { contributions: number }).contributions },
            { label: 'Mandates',      value: (member._count as { mandates: number }).mandates },
            { label: 'Bank accounts', value: member.bankAccounts.length },
            { label: 'POPIA consent', value: member.popiaConsentAt ? 'Yes' : 'No' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-xxm-gray-500 uppercase tracking-wide font-medium">{label}</p>
              <p className="text-xl font-bold text-xxm-green mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contributions */}
      <div className="bg-white rounded-xl border border-xxm-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-xxm-gray-100">
          <h2 className="font-semibold text-xxm-green">Recent Contributions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-xxm-gray-50 text-xs uppercase tracking-wider text-xxm-gray-500">
                <th className="px-4 py-2.5 text-left font-semibold">Period</th>
                <th className="px-4 py-2.5 text-right font-semibold">Due</th>
                <th className="px-4 py-2.5 text-right font-semibold">Paid</th>
                <th className="px-4 py-2.5 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-xxm-gray-50">
              {(member.contributions as ContribItem[]).map((c) => {
                const cfg = CONTRIB_CONFIG[c.status] ?? CONTRIB_CONFIG.PENDING
                return (
                  <tr key={c.id} className="hover:bg-xxm-green-50/30 transition-colors">
                    <td className="px-4 py-2.5 text-xxm-gray-700 font-medium">{MONTHS[c.periodMonth - 1]} {c.periodYear}</td>
                    <td className="px-4 py-2.5 text-right text-xxm-gray-700 tabular-nums">{formatZAR(Number(c.amountDue))}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium tabular-nums">{formatZAR(Number(c.amountPaid))}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cfg.className} role="status">{cfg.label}</span>
                    </td>
                  </tr>
                )
              })}
              {member.contributions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-xxm-gray-400">No contributions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mandates */}
      <div className="bg-white rounded-xl border border-xxm-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-xxm-gray-100">
          <h2 className="font-semibold text-xxm-green">Mandates</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-xxm-gray-50 text-xs uppercase tracking-wider text-xxm-gray-500">
                <th className="px-4 py-2.5 text-left font-semibold">Amount</th>
                <th className="px-4 py-2.5 text-center font-semibold">Debit day</th>
                <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold hidden md:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-xxm-gray-50">
              {(member.mandates as MandateItem[]).map((m) => {
                const cfg = MANDATE_CONFIG[m.status] ?? MANDATE_CONFIG.PENDING
                return (
                  <tr key={m.id} className="hover:bg-xxm-green-50/30 transition-colors">
                    <td className="px-4 py-2.5 text-xxm-gray-700 font-semibold tabular-nums">{formatZAR(Number(m.amount))}</td>
                    <td className="px-4 py-2.5 text-center text-xxm-gray-600">{m.debitDay}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cfg.className} role="status">{cfg.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-xxm-gray-400 hidden md:table-cell">{formatDate(m.createdAt)}</td>
                  </tr>
                )
              })}
              {member.mandates.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-xxm-gray-400">No mandates.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notification prefs */}
      {member.notificationPreference && (
        <div className="bg-white rounded-xl border border-xxm-gray-100 p-5">
          <h2 className="font-semibold text-xxm-green mb-3">Notification Preferences</h2>
          <div className="flex flex-wrap gap-6 text-sm text-xxm-gray-600">
            {[
              { label: 'SMS',      value: member.notificationPreference.sms },
              { label: 'Email',    value: member.notificationPreference.email },
              { label: 'WhatsApp', value: member.notificationPreference.push },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${value ? 'bg-green-500' : 'bg-xxm-gray-300'}`} aria-hidden />
                <span>{label}: <strong className={value ? 'text-green-600' : 'text-xxm-gray-500'}>{value ? 'On' : 'Off'}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
