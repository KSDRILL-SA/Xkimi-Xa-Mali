import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMemberDetail, setMemberStatus, unlockMember } from '@/lib/services'
import { formatDate, formatZAR, formatMonth, STATUS_STYLES as SHARED_STATUS_STYLES } from '@xxm/utils'
import { Breadcrumb, Card, CardHeader, CardBody, PageHeader } from '@xxm/ui'
import { revalidatePath } from 'next/cache'

export const metadata: Metadata = { title: 'Member Detail' }

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const { id }  = await params

  let member
  try {
    member = await getMemberDetail(roles, id)
  } catch {
    notFound()
  }

  const STATUS_STYLES = SHARED_STATUS_STYLES.user

  const isLocked = member.lockedUntil && new Date(member.lockedUntil) > new Date()

  async function handleStatusChange(fd: FormData) {
    'use server'
    const s       = await auth()
    const r       = (s!.user.roles as string[] | undefined) ?? []
    const newStatus = fd.get('status') as string
    await setMemberStatus(s!.user.id, r, id, newStatus)
    revalidatePath(`/members/${id}`)
  }

  async function handleUnlock() {
    'use server'
    const s = await auth()
    const r = (s!.user.roles as string[] | undefined) ?? []
    await unlockMember(s!.user.id, r, id)
    revalidatePath(`/members/${id}`)
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Members', href: '/members' }, { label: `${member.firstName} ${member.lastName}` }]} />
      <PageHeader
        title={`${member.firstName} ${member.lastName}`}
        subtitle={member.email}
        action={
          <form action={handleStatusChange} className="flex items-center gap-2">
            <select name="status" defaultValue={member.status}
              className="rounded-lg border border-xxm-gray-200 px-2 py-1.5 text-sm text-xxm-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors">Update</button>
          </form>
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
              ['Joined',         formatDate(member.createdAt)],
              ['POPIA',          member.popiaConsentAt ? formatDate(member.popiaConsentAt) : 'Not consented'],
              ['Roles',          member.roles.map((r) => r.role.name).join(', ')],
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
      </div>
    </div>
  )
}
