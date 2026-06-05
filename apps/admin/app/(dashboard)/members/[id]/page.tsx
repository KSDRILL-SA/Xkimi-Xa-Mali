import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMemberDetail, setMemberStatus, unlockMember, setMemberRole, getMemberLoginHistory } from '@/lib/services'
import { formatDate, formatZAR, formatMonth, STATUS_STYLES as SHARED_STATUS_STYLES } from '@xxm/utils'
import { Breadcrumb, Card, CardHeader, CardBody, PageHeader } from '@xxm/ui'
import { revalidatePath } from 'next/cache'

export const metadata: Metadata = { title: 'Member Detail' }

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')
  const { id }  = await params

  let member
  let loginHistory: { id: string; ipAddress: string | null; userAgent: string | null; success: boolean; createdAt: Date }[] = []
  try {
    const [detail, history] = await Promise.all([
      getMemberDetail(roles, id),
      getMemberLoginHistory(roles, id, 1, 10),
    ])
    member = detail
    loginHistory = history.items
  } catch {
    notFound()
  }

  const STATUS_STYLES = SHARED_STATUS_STYLES.user
  const isLocked = member.lockedUntil && new Date(member.lockedUntil) > new Date()
  const isAdmin  = member.roles.some((r) => r.role.name === 'ADMIN')

  async function handleStatusChange(fd: FormData) {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    await setMemberStatus(s.user.id, r, id, fd.get('status') as string)
    revalidatePath(`/members/${id}`)
    revalidatePath('/members')
  }

  async function handleUnlock() {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    await unlockMember(s.user.id, r, id)
    revalidatePath(`/members/${id}`)
  }

  async function handlePromoteAdmin() {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    await setMemberRole(s.user.id, r, id, 'ADMIN', true)
    revalidatePath(`/members/${id}`)
  }

  async function handleRemoveAdmin() {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    await setMemberRole(s.user.id, r, id, 'ADMIN', false)
    revalidatePath(`/members/${id}`)
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Members', href: '/members' }, { label: `${member.firstName} ${member.lastName}` }]} />
      <PageHeader
        title={`${member.firstName} ${member.lastName}`}
        subtitle={member.email}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <form action={handleStatusChange} className="flex items-center gap-2">
              <select name="status" defaultValue={member.status}
                className="rounded-lg border border-xxm-gray-200 px-2 py-1.5 text-sm text-xxm-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors">Update status</button>
            </form>
            {isAdmin ? (
              <form action={handleRemoveAdmin}>
                <button type="submit" className="px-4 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors">
                  Remove admin
                </button>
              </form>
            ) : (
              <form action={handlePromoteAdmin}>
                <button type="submit" className="px-4 py-1.5 rounded-lg border border-xxm-green/30 text-xxm-green text-sm font-medium hover:bg-xxm-green/5 transition-colors">
                  Make admin
                </button>
              </form>
            )}
          </div>
        }
      />

      {isLocked && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-red-700">Account locked</p>
            <p className="text-xs text-red-500 mt-0.5">
              Locked until {formatDate(member.lockedUntil!)} after {member.loginAttempts} failed login attempts.
            </p>
          </div>
          <form action={handleUnlock}>
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors shrink-0">
              Unlock account
            </button>
          </form>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Profile */}
        <Card>
          <CardHeader title="Profile" />
          <CardBody className="space-y-3">
            {[
              ['Phone',          member.phone],
              ['Status',         <span key="s" className={(STATUS_STYLES[member.status as keyof typeof STATUS_STYLES] ?? { className: '' }).className}>{member.status}</span>],
              ['Roles',          member.roles.map((r) => r.role.name).join(', ')],
              ['Joined',         formatDate(member.createdAt)],
              ['POPIA consent',  member.popiaConsentAt ? formatDate(member.popiaConsentAt) : 'Not consented'],
              ['Login attempts', member.loginAttempts > 0 ? <span key="la" className="text-orange-600 font-medium">{member.loginAttempts}</span> : '0'],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between text-sm">
                <span className="text-xxm-gray-500">{k}</span>
                <span className="font-medium text-xxm-green-900 text-right">{v}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Bank accounts */}
        <Card>
          <CardHeader title="Bank Accounts" description={`${member.bankAccounts.length} on file`} />
          <CardBody>
            {member.bankAccounts.length === 0 ? (
              <p className="text-sm text-xxm-gray-400">No bank accounts.</p>
            ) : (
              <ul className="space-y-2">
                {member.bankAccounts.map((b) => (
                  <li key={b.id} className="flex justify-between text-sm">
                    <span className="text-xxm-gray-600">{b.bankName}</span>
                    <span className="text-xxm-gray-400 text-xs">{b.accountType} · {formatDate(b.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Recent contributions */}
        <Card>
          <CardHeader title="Contributions" description="Last 12 months" />
          <CardBody>
            {member.contributions.length === 0 ? (
              <p className="text-sm text-xxm-gray-400">No contributions yet.</p>
            ) : (
              <ul className="space-y-2">
                {member.contributions.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-xxm-gray-600">{formatMonth(c.periodMonth, c.periodYear)}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xxm-gray-500">{formatZAR(c.amountPaid)} / {formatZAR(c.amountDue)}</span>
                      <span className={(SHARED_STATUS_STYLES.contribution[c.status as keyof typeof SHARED_STATUS_STYLES.contribution] ?? SHARED_STATUS_STYLES.contribution.PENDING).className}>{c.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Recent mandates */}
        <Card>
          <CardHeader title="Mandates" description="Last 5" />
          <CardBody>
            {member.mandates.length === 0 ? (
              <p className="text-sm text-xxm-gray-400">No mandates yet.</p>
            ) : (
              <ul className="space-y-2">
                {member.mandates.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-xxm-green-900">{formatZAR(m.amount)}</span>
                      <span className="text-xxm-gray-400 text-xs ml-2">Day {m.debitDay}</span>
                    </div>
                    <span className={(SHARED_STATUS_STYLES.mandate[m.status as keyof typeof SHARED_STATUS_STYLES.mandate] ?? SHARED_STATUS_STYLES.mandate.PENDING).className}>{m.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Login history */}
        <Card className="md:col-span-2">
          <CardHeader title="Login History" description="Last 10 attempts" />
          <CardBody>
            {loginHistory.length === 0 ? (
              <p className="text-sm text-xxm-gray-400">No login history.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-xxm-gray-100">
                      <th className="text-left py-2 pr-4 text-xs font-medium text-xxm-gray-500 uppercase tracking-wide">Time</th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-xxm-gray-500 uppercase tracking-wide">IP Address</th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-xxm-gray-500 uppercase tracking-wide">Device</th>
                      <th className="text-center py-2 text-xs font-medium text-xxm-gray-500 uppercase tracking-wide">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-xxm-gray-50">
                    {loginHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="py-2 pr-4 text-xxm-gray-600 whitespace-nowrap">{formatDate(h.createdAt)}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-xxm-gray-500">{h.ipAddress ?? '—'}</td>
                        <td className="py-2 pr-4 text-xxm-gray-400 text-xs truncate max-w-[200px]">
                          {h.userAgent ? h.userAgent.split(' ').slice(0, 3).join(' ') : '—'}
                        </td>
                        <td className="py-2 text-center">
                          <span className={h.success ? 'xxm-status-success' : 'xxm-status-danger'}>
                            {h.success ? 'Success' : 'Failed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
