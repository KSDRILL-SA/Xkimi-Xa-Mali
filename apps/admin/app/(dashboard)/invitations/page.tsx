import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { internalAdminPost } from '@/lib/api'
import { listInvitations, revokeInvitation, getMemberPlaces } from '@/lib/services'
import { formatDate, formatZAR } from '@xxm/utils'
import { Breadcrumb, Reveal, RouterPagination, PageHeader } from '@xxm/ui'
import { Mail } from 'lucide-react'
import { CreateInviteModal } from '@/components/admin/CreateInviteModal'
import { InvitationsTable, type InviteRow } from './InvitationsTable'
import { requireAdmin } from '@/lib/admin-action'

type CreatedInvite = { code: string; firstName: string; lastName: string; email: string }
type InviteState   = { data?: CreatedInvite; error?: string }

async function createInvite(_prev: InviteState, fd: FormData): Promise<InviteState> {
  'use server'
  const { userId } = await requireAdmin('invitation.create')

  const result = await internalAdminPost<CreatedInvite>(
    '/api/v1/admin/invitations',
    {
      firstName:     (fd.get('firstName') as string | null)?.trim(),
      lastName:      (fd.get('lastName')  as string | null)?.trim(),
      email:         (fd.get('email')     as string | null)?.trim().toLowerCase(),
      phone:          fd.get('phone'),
      idNumber:      (fd.get('idNumber')   as string | null)?.trim(),
      vouchedFor:    (fd.get('vouchedFor') as string | null)?.trim() || undefined,
      minimumAmount:  Number(fd.get('minimumAmount')),
    },
    { adminUserId: userId },
  )

  if (!result.ok)   return { error: result.error?.message ?? 'Failed to create invitation' }
  if (!result.data) return { error: 'Unexpected response from server' }
  revalidatePath('/invitations')
  return { data: result.data }
}

export const metadata: Metadata = { title: 'Invitations' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:  { label: 'Pending',  className: 'xxm-status-warning' },
  ACCEPTED: { label: 'Accepted', className: 'xxm-status-success' },
  EXPIRED:  { label: 'Expired',  className: 'xxm-status-danger'  },
  REVOKED:  { label: 'Revoked',  className: 'xxm-status-danger'  },
}

async function revokeInvitationAction(fd: FormData) {
  'use server'
  const id = fd.get('id') as string
  const { userId, roles: sr, ip } = await requireAdmin('invitation.revoke')
  await revokeInvitation(userId, sr, id, ip)
  revalidatePath('/invitations')
}

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; revoked?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))
  const revoked = params.revoked === '1'

  const [{ items, total }, places] = await Promise.all([
    listInvitations(roles, page),
    getMemberPlaces(roles),
  ])

  type RawItem = { id: string; firstName: string; lastName: string; email: string; phone: string; status: string; minimumAmount: unknown; expiresAt: Date | null; acceptedAt: Date | null }

  const rows: InviteRow[] = (items as unknown as RawItem[]).map((inv) => {
    const sc = STATUS_CONFIG[inv.status] ?? { label: inv.status, className: 'xxm-status-pending' }
    return {
      id: inv.id, name: `${inv.firstName} ${inv.lastName}`, email: inv.email, phone: inv.phone,
      rawStatus: inv.status,
      minAmount: formatZAR(inv.minimumAmount as number),
      status: sc.label, statusClass: sc.className,
      expires:  inv.expiresAt  ? formatDate(inv.expiresAt)  : '—',
      accepted: inv.acceptedAt ? formatDate(inv.acceptedAt) : '—',
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Invitations' }]} />
      <Reveal variant="up">
        <PageHeader title="Invitations" subtitle={`${total} total`} icon={<Mail size={22} className="text-xxm-green" aria-hidden />} action={<CreateInviteModal createAction={createInvite} />} />
      </Reveal>

      {/* The headroom, before inviting rather than after being refused. The cap
          is a deliberate design decision, so it is stated plainly rather than
          surfacing only as an error at the moment it bites. */}
      <Reveal variant="up" delay={50}>
        <div className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 ${
          places.isFull
            ? 'bg-amber-50 border-amber-200'
            : 'bg-white border-xxm-green/10 shadow-xxm-sm'
        }`}>
          <span className="stat-number text-xl font-black text-xxm-green-900">
            {places.taken} of {places.cap}
          </span>
          <span className="text-sm text-xxm-gray-500">
            places taken — {places.members} member{places.members === 1 ? '' : 's'}
            {places.pendingInvites > 0 && `, ${places.pendingInvites} invitation${places.pendingInvites === 1 ? '' : 's'} outstanding`}
          </span>
          {places.isFull ? (
            <span className="text-sm font-semibold text-amber-800 w-full sm:w-auto">
              The circle is full. No further invitations can be issued.
            </span>
          ) : (
            <span className="text-sm font-semibold text-xxm-green-700 ml-auto">
              {places.remaining} remaining
            </span>
          )}
        </div>
      </Reveal>

      {revoked && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
          Invitation revoked successfully.
        </div>
      )}

      <Reveal variant="up" delay={100} className="space-y-4">
        <InvitationsTable rows={rows} revokeAction={revokeInvitationAction} />
        <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl="/invitations" className="justify-center" />
      </Reveal>
    </div>
  )
}
