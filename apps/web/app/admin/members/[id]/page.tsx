import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMemberDetail, setMemberStatus, AdminNotFoundError } from '@/services/admin.service'
import { setMemberRole } from '@/services/invite.service'
import { formatDate, formatZAR } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Member Detail — Admin' }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CONTRIB_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700' },
  PAID:    { label: 'Paid',    className: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Overdue', className: 'bg-red-100 text-red-700' },
  WAIVED:  { label: 'Waived',  className: 'bg-gray-100 text-gray-500' },
}

const MANDATE_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-700' },
  ACTIVE:    { label: 'Active',    className: 'bg-green-100 text-green-700' },
  SUSPENDED: { label: 'Suspended', className: 'bg-orange-100 text-orange-700' },
  CANCELLED: { label: 'Cancelled', className: 'bg-red-100 text-red-700' },
}

const USER_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: 'Active',    className: 'bg-green-100 text-green-700' },
  PENDING:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-700' },
  SUSPENDED: { label: 'Suspended', className: 'bg-red-100 text-red-700' },
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
  const isAdmin = member.roles.some((r: { role: string }) => r.role === 'ADMIN')
  type ContribItem = { id: string; periodMonth: number; periodYear: number; amountDue: unknown; amountPaid: unknown; status: string }
  type MandateItem = { id: string; status: string; amount: unknown; debitDay: number; createdAt: Date }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <Link href="/admin/members" className="text-sm text-xxm-green hover:underline">← Back to members</Link>

      {sp.updated === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Member status updated.
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-xxm-green">
              {member.firstName} {member.lastName}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{member.email} · {member.phone}</p>
            <p className="text-xs text-gray-400 mt-1">Joined {formatDate(member.createdAt)}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${sc.className}`}>
              {sc.label}
            </span>
            {member.status !== 'ACTIVE' && (
              <form action={activate}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white font-medium hover:bg-green-700">
                  Activate
                </button>
              </form>
            )}
            {member.status === 'ACTIVE' && (
              <form action={suspend}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 font-medium hover:bg-red-200">
                  Suspend
                </button>
              </form>
            )}
            {isAdmin ? (
              <form action={revokeAdmin}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-orange-100 text-orange-700 font-medium hover:bg-orange-200">
                  Revoke Admin
                </button>
              </form>
            ) : (
              <form action={promoteAdmin}>
                <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-xxm-gold/20 text-xxm-gold font-medium hover:bg-xxm-gold/30 border border-xxm-gold/30">
                  Make Admin
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-gray-100">
          {[
            { label: 'Total contributions', value: (member._count as { contributions: number }).contributions },
            { label: 'Total mandates',      value: (member._count as { mandates: number }).mandates },
            { label: 'Bank accounts',       value: member.bankAccounts.length },
            { label: 'POPIA consent',       value: member.popiaConsentAt ? 'Yes' : 'No' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="text-lg font-bold text-xxm-green mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contributions */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-xxm-green">Recent Contributions</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2 text-left">Period</th>
              <th className="px-4 py-2 text-right">Due</th>
              <th className="px-4 py-2 text-right">Paid</th>
              <th className="px-4 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {(member.contributions as ContribItem[]).map((c) => {
              const cfg = CONTRIB_CONFIG[c.status] ?? CONTRIB_CONFIG.PENDING
              return (
                <tr key={c.id} className="border-t border-gray-50">
                  <td className="px-4 py-2 text-gray-700">{MONTHS[c.periodMonth - 1]} {c.periodYear}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{formatZAR(Number(c.amountDue))}</td>
                  <td className="px-4 py-2 text-right text-green-600">{formatZAR(Number(c.amountPaid))}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                  </td>
                </tr>
              )
            })}
            {member.contributions.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No contributions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mandates */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="font-semibold text-xxm-green">Mandates</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2 text-left">Amount</th>
              <th className="px-4 py-2 text-center">Debit day</th>
              <th className="px-4 py-2 text-center">Status</th>
              <th className="px-4 py-2 text-left hidden md:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {(member.mandates as MandateItem[]).map((m) => {
              const cfg = MANDATE_CONFIG[m.status] ?? MANDATE_CONFIG.PENDING
              return (
                <tr key={m.id} className="border-t border-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-medium">{formatZAR(Number(m.amount))}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{m.debitDay}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 hidden md:table-cell">{formatDate(m.createdAt)}</td>
                </tr>
              )
            })}
            {member.mandates.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No mandates.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Notification prefs */}
      {member.notificationPreference && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-semibold text-xxm-green mb-3">Notification Preferences</h2>
          <div className="flex gap-6 text-sm text-gray-600">
            {[
              { label: 'SMS',       value: member.notificationPreference.sms },
              { label: 'Email',     value: member.notificationPreference.email },
              { label: 'WhatsApp',  value: member.notificationPreference.push },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${value ? 'bg-green-500' : 'bg-red-400'}`} />
                <span>{label}: <strong>{value ? 'On' : 'Off'}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
