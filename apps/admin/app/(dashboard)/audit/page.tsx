import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { listAuditLogs } from '@/lib/services'
import { formatRelativeTime } from '@xxm/utils'
import { Breadcrumb, RouterPagination } from '@xxm/ui'

export const metadata: Metadata = { title: 'Audit Log' }

const ACTION_COLOR: Record<string, string> = {
  ADMIN_MEMBER_STATUS_CHANGED:   'xxm-status-warning',
  ADMIN_MANDATE_APPROVED:        'xxm-status-success',
  ADMIN_MANDATE_REJECTED:        'xxm-status-danger',
  ADMIN_CONTRIBUTIONS_GENERATED: 'xxm-status-pending',
  ADMIN_BROADCAST_SENT:          'xxm-status-info',
  WHATSAPP_PREFERENCE_UPDATED:   'xxm-status-info',
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; userId?: string; page?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const entity  = params.entity  ?? undefined
  const action  = params.action  ?? undefined
  const userId  = params.userId  ?? undefined
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total, totalPages } = await listAuditLogs(roles, { entity, action, userId, page, limit: 30 })

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { entity, action, userId, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const qs = p.toString()
    return `/audit${qs ? `?${qs}` : ''}`
  }

  type AuditRow = { id: string; action: string; entity: string; entityId: string; payload: unknown; ipAddress: string | null; createdAt: Date; user: { id: string; firstName: string; lastName: string } | null }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Audit' }]} />
      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Audit Log</h1>
        <p className="text-sm text-xxm-gray-500 mt-1">{total} events · read-only</p>
      </div>

      <form method="GET" action="/audit" className="flex flex-wrap gap-2">
        <input type="text" name="action" defaultValue={action} placeholder="Filter by action…"
          className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white" />
        <input type="text" name="entity" defaultValue={entity} placeholder="Entity (User, PaymentMandate…)"
          className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white" />
        <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors">Filter</button>
        {(action || entity || userId) && (
          <Link href="/audit" className="px-4 py-2 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-500 hover:bg-xxm-gray-50">Clear</Link>
        )}
      </form>

      <div className="bg-white rounded-card border border-xxm-gray-100 divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-xxm-gray-400">No audit events found.</div>
        ) : (
          (items as unknown as AuditRow[]).map((log) => {
            const color = ACTION_COLOR[log.action] ?? 'xxm-status-pending'
            return (
              <div key={log.id} className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`${color} font-mono !text-[0.6rem] !tracking-tight`}>{log.action}</span>
                    <span className="text-xs text-xxm-gray-400">{log.entity} · <span className="font-mono">{log.entityId.slice(0, 12)}…</span></span>
                  </div>
                  <p className="text-xs text-xxm-gray-500 mt-1">
                    {log.user
                      ? <Link href={`/members/${log.user.id}`} className="text-xxm-green hover:underline">{log.user.firstName} {log.user.lastName}</Link>
                      : <span className="text-xxm-gray-400">System</span>}
                    {log.ipAddress && <span className="ml-2 text-xxm-gray-300">· {log.ipAddress}</span>}
                  </p>
                  {log.payload !== null && typeof log.payload === 'object' && Object.keys(log.payload as Record<string, unknown>).length > 0 && (
                    <pre className="mt-1.5 text-xs text-xxm-gray-400 bg-xxm-gray-50 rounded px-2 py-1 overflow-x-auto max-w-lg">
                      {JSON.stringify(log.payload as Record<string, unknown>, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="shrink-0 text-xs text-xxm-gray-400 whitespace-nowrap">
                  {formatRelativeTime(log.createdAt)}
                </span>
              </div>
            )
          })
        )}
      </div>

      <RouterPagination totalItems={total} itemsPerPage={30} currentPage={page} baseUrl={buildUrl({ page: undefined })} className="justify-center" />
    </div>
  )
}
