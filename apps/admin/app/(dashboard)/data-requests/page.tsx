import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listDataRequests, logDataRequest, startDataRequest, closeDataRequest } from '@/lib/services'
import { formatDate } from '@xxm/utils'
import { Breadcrumb, Reveal, RouterPagination, PageHeader } from '@xxm/ui'
import { ShieldQuestion } from 'lucide-react'
import { requireAdmin } from '@/lib/admin-action'
import { RequestsTable, type DsrRow } from './RequestsTable'
import Link from 'next/link'
import type { DsrKind } from '@prisma/client'

export const metadata: Metadata = { title: 'Data Requests' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  RECEIVED:    { label: 'Received',    className: 'xxm-status-warning' },
  IN_PROGRESS: { label: 'In progress', className: 'xxm-status-pending' },
  COMPLETED:   { label: 'Answered',    className: 'xxm-status-success' },
  REFUSED:     { label: 'Refused',     className: 'xxm-status-danger'  },
}

const KIND_LABELS: Record<string, string> = {
  ACCESS:             'Access — see what we hold',
  CORRECTION:         'Correction',
  DELETION:           'Deletion',
  OBJECTION:          'Objection to processing',
  CONSENT_WITHDRAWAL: 'Withdrawal of consent',
}

async function logAction(fd: FormData) {
  'use server'
  const { userId, roles } = await requireAdmin('dsr.log')
  await logDataRequest(roles, userId, {
    requesterName:  String(fd.get('requesterName') ?? ''),
    requesterEmail: String(fd.get('requesterEmail') ?? ''),
    kind:           String(fd.get('kind') ?? 'ACCESS') as DsrKind,
    detail:         String(fd.get('detail') ?? ''),
  })
  revalidatePath('/data-requests')
}

async function startAction(fd: FormData) {
  'use server'
  const { userId, roles } = await requireAdmin('dsr.start')
  await startDataRequest(roles, userId, String(fd.get('id') ?? ''))
  revalidatePath('/data-requests')
}

async function closeAction(fd: FormData) {
  'use server'
  const { userId, roles } = await requireAdmin('dsr.close')
  await closeDataRequest(roles, userId, String(fd.get('id') ?? ''), {
    status:  String(fd.get('status') ?? 'COMPLETED') as 'COMPLETED' | 'REFUSED',
    outcome: String(fd.get('outcome') ?? ''),
  })
  revalidatePath('/data-requests')
}

export default async function DataRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; overdue?: string; page?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const params      = await searchParams
  const status      = params.status || undefined
  const overdueOnly = params.overdue === '1'
  const page        = Math.max(1, parseInt(params.page ?? '1', 10))

  const { rows: items, total, openCount, overdueCount } = await listDataRequests(roles, {
    status: status as never,
    overdueOnly,
    page,
    limit: 20,
  })

  const rows: DsrRow[] = items.map((r) => {
    const sc   = STATUS_CONFIG[r.status] ?? { label: r.status, className: 'xxm-status-pending' }
    const open = r.status === 'RECEIVED' || r.status === 'IN_PROGRESS'
    return {
      id: r.id,
      requester: r.requesterName,
      email: r.requesterEmail,
      kind: KIND_LABELS[r.kind] ?? r.kind,
      detail: r.detail,
      status: sc.label,
      statusClass: sc.className,
      receivedAt: formatDate(r.receivedAt),
      dueAt: formatDate(r.dueAt),
      // The deadline itself, not a countdown. How many days remain depends on
      // when the page is *read*, and a number baked in at render would be stale
      // the moment this page is cached or left open. The table works it out on
      // the client instead.
      dueAtIso: r.dueAt.toISOString(),
      open,
      handledBy: r.handledBy ? `${r.handledBy.firstName} ${r.handledBy.lastName}` : null,
      outcome: r.outcome,
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Data Requests' }]} />

      <Reveal variant="up">
        <PageHeader
          title="Data Requests"
          subtitle={
            overdueCount > 0
              ? `${openCount} open · ${overdueCount} past 30 days`
              : `${openCount} open · ${total} total`
          }
          icon={<ShieldQuestion size={22} className="text-xxm-green" aria-hidden />}
        />
      </Reveal>

      {/* POPIA gives a person the right to see, correct or delete what is held
          about them, and gives the Foundation thirty days to answer. This page
          exists so those thirty days run against somebody. */}
      <Reveal variant="up" delay={50}>
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5">
          <h2 className="font-bold text-sm text-xxm-green-900 mb-3">Log a request</h2>
          <form action={logAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="requesterName"
              required
              placeholder="Requester's name"
              className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
            <input
              name="requesterEmail"
              type="email"
              required
              placeholder="Requester's email"
              className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
            <select
              name="kind"
              defaultValue="ACCESS"
              className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            >
              {Object.entries(KIND_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <input
              name="detail"
              required
              placeholder="What they asked for, in their words"
              className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
            <button
              type="submit"
              className="sm:col-span-2 justify-self-start px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors"
            >
              Log request
            </button>
          </form>
          <p className="text-[11px] text-xxm-gray-400 mt-3">
            The 30-day clock starts when they asked, not when this was filled in.
          </p>
        </div>
      </Reveal>

      <Reveal variant="up" delay={100}>
        <form method="GET" action="/data-requests" className="flex flex-wrap gap-2">
          <select
            name="status"
            defaultValue={status ?? ''}
            className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-600 bg-white cursor-pointer">
            <input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="accent-xxm-green" />
            Overdue only
          </label>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors"
          >
            Filter
          </button>
          {(status || overdueOnly) && (
            <Link
              href="/data-requests"
              className="px-4 py-2 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-500 hover:bg-xxm-gray-50"
            >
              Clear
            </Link>
          )}
        </form>
      </Reveal>

      <Reveal variant="up" delay={200} className="space-y-4">
        <RequestsTable rows={rows} startAction={startAction} closeAction={closeAction} />
        <RouterPagination
          totalItems={total}
          itemsPerPage={20}
          currentPage={page}
          baseUrl={`/data-requests${status ? `?status=${status}` : ''}`}
          className="justify-center"
        />
      </Reveal>
    </div>
  )
}
