import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllMandates, approveMandate, rejectMandate } from '@/lib/services'
import { formatZAR, formatDate } from '@xxm/utils'
import { Breadcrumb, Reveal, RouterPagination, PageHeader } from '@xxm/ui'
import { CreditCard } from 'lucide-react'
import { MandatesTable, type MandateRow } from './MandatesTable'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin-action'

export const metadata: Metadata = { title: 'Mandates' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
  PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
  SUSPENDED: { label: 'Suspended', className: 'xxm-status-warning' },
  CANCELLED: { label: 'Cancelled', className: 'xxm-status-danger'  },
}

async function approveMandateAction(fd: FormData) {
  'use server'
  const mandateId = fd.get('mandateId') as string
  const { userId, roles: sr } = await requireAdmin('mandate.approve')
  await approveMandate(userId, sr, mandateId)
  revalidatePath('/mandates')
}

async function rejectMandateAction(fd: FormData) {
  'use server'
  const mandateId = fd.get('mandateId') as string
  const { userId, roles: sr } = await requireAdmin('mandate.reject')
  await rejectMandate(userId, sr, mandateId, undefined, String(fd.get('reason') ?? ''))
  revalidatePath('/mandates')
}

export default async function MandatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')
  const params  = await searchParams
  const status  = params.status ?? undefined
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total } = await listAllMandates(roles, { status, page, limit: 20 })

  type RawItem = { id: string; status: string; amount: unknown; debitDay: number; createdAt: Date; user: { id: string; firstName: string; lastName: string; email: string }; bankAccount: { bankName: string; accountType: string } | null }

  const rows: MandateRow[] = (items as unknown as RawItem[]).map((m) => {
    const sc = STATUS_CONFIG[m.status] ?? { label: m.status, className: 'xxm-status-pending' }
    return {
      id: m.user.id, mandateId: m.id,
      member: `${m.user.firstName} ${m.user.lastName}`, email: m.user.email,
      bank: m.bankAccount ? `${m.bankAccount.bankName} · ${m.bankAccount.accountType}` : 'Unknown',
      amount: formatZAR(m.amount as number), debitDay: m.debitDay,
      status: sc.label, statusClass: sc.className, createdAt: formatDate(m.createdAt),
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Mandates' }]} />
      <Reveal variant="up">
        <PageHeader title="Mandates" subtitle={`${total} total`} icon={<CreditCard size={22} className="text-xxm-green" aria-hidden />} />
      </Reveal>

      <Reveal variant="up" delay={100}>
        <form method="GET" action="/mandates" className="flex flex-wrap gap-2">
          <select name="status" defaultValue={status ?? ''} className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
            <option value="">All statuses</option>
            {Object.entries(STATUS_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
          </select>
          <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors">Filter</button>
          {status && <Link href="/mandates" className="px-4 py-2 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-500 hover:bg-xxm-gray-50">Clear</Link>}
        </form>
      </Reveal>

      <Reveal variant="up" delay={200} className="space-y-4">
        <MandatesTable rows={rows} approveAction={approveMandateAction} rejectAction={rejectMandateAction} />
        <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl={`/mandates${status ? `?status=${status}` : ''}`} className="justify-center" />
      </Reveal>
    </div>
  )
}
