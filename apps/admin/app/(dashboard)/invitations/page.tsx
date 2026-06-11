import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { internalAdminPost } from '@/lib/api'
import { listInvitations, revokeInvitation } from '@/lib/services'
import { formatDate, formatZAR } from '@xxm/utils'
import { Breadcrumb, Reveal, RouterPagination, PageHeader } from '@xxm/ui'
import { Mail } from 'lucide-react'
import { CreateInviteModal } from '@/components/admin/CreateInviteModal'
import { InvitationsTable, type InviteRow } from './InvitationsTable'

type CreatedInvite = { code: string; firstName: string; lastName: string; email: string }
type InviteState   = { data?: CreatedInvite; error?: string }

async function createInvite(_prev: InviteState, fd: FormData): Promise<InviteState> {
  'use server'
  const s = await auth()
  if (!s?.user?.id) redirect('/login')
  const sr = (s.user.roles as string[] | undefined) ?? []
  if (!sr.includes('ADMIN')) redirect('/forbidden')

  const result = await internalAdminPost<CreatedInvite>(
    '/api/v1/admin/invitations',
    {
      firstName:     (fd.get('firstName') as string | null)?.trim(),
      lastName:      (fd.get('lastName')  as string | null)?.trim(),
      email:         (fd.get('email')     as string | null)?.trim().toLowerCase(),
      phone:          fd.get('phone'),
      minimumAmount:  Number(fd.get('minimumAmount')),
    },
    { adminUserId: s.user.id },
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
  const s = await auth()
  if (!s?.user?.id) redirect('/login')
  const sr = (s.user.roles as string[] | undefined) ?? []
  if (!sr.includes('ADMIN')) redirect('/forbidden')
  await revokeInvitation(s.user.id, sr, id)
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

  const { items, total } = await listInvitations(roles, page)

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
