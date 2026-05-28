import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { listAuditLogs } from '@/services/admin.service'

export const metadata: Metadata = { title: 'Audit Log — Admin' }

function formatRelative(date: Date): string {
  const diff  = Date.now() - date.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins < 1)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7)   return `${days}d ago`
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ACTION_COLOR: Record<string, string> = {
  ADMIN_MEMBER_STATUS_CHANGED:   'bg-orange-100 text-orange-700',
  ADMIN_MANDATE_APPROVED:        'bg-green-100 text-green-700',
  ADMIN_MANDATE_REJECTED:        'bg-red-100 text-red-700',
  ADMIN_CONTRIBUTIONS_GENERATED: 'bg-blue-100 text-blue-700',
  ADMIN_BROADCAST_SENT:          'bg-purple-100 text-purple-700',
  WHATSAPP_PREFERENCE_UPDATED:   'bg-teal-100 text-teal-700',
}

export default async function AdminAuditPage({
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
    return `/admin/audit${qs ? `?${qs}` : ''}`
  }

  type AuditRow = {
    id: string; action: string; entity: string; entityId: string;
    payload: unknown; ipAddress: string | null; createdAt: Date;
    user: { id: string; firstName: string; lastName: string; email: string } | null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">{total} events · read-only</p>
      </div>

      {/* Filters */}
      <form method="GET" action="/admin/audit" className="flex flex-wrap gap-2">
        <input
          type="text" name="action" defaultValue={action}
          placeholder="Filter by action…"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-xxm-green/30"
        />
        <input
          type="text" name="entity" defaultValue={entity}
          placeholder="Entity (User, PaymentMandate…)"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-xxm-green/30"
        />
        <button type="submit" className="px-4 py-1.5 rounded-lg bg-xxm-green text-white text-sm font-medium">
          Filter
        </button>
        {(action || entity || userId) && (
          <Link href="/admin/audit" className="px-4 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
            Clear
          </Link>
        )}
      </form>

      {/* Log */}
      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
        {items.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No audit events found.</div>
        ) : (
          (items as AuditRow[]).map((log) => {
            const color = ACTION_COLOR[log.action] ?? 'bg-gray-100 text-gray-600'
            return (
              <div key={log.id} className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium ${color}`}>
                      {log.action}
                    </span>
                    <span className="text-xs text-gray-400">
                      {log.entity} · <span className="font-mono">{log.entityId.slice(0, 12)}…</span>
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {log.user
                      ? <Link href={`/admin/members/${log.user.id}`} className="text-xxm-green hover:underline">{log.user.firstName} {log.user.lastName}</Link>
                      : <span className="text-gray-400">System</span>
                    }
                    {log.ipAddress && <span className="ml-2 text-gray-300">· {log.ipAddress}</span>}
                  </p>
                  {log.payload !== null && typeof log.payload === 'object' && Object.keys(log.payload as Record<string, unknown>).length > 0 && (
                    <pre className="mt-1.5 text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 overflow-x-auto max-w-lg">
                      {JSON.stringify(log.payload as Record<string, unknown>, null, 2)}
                    </pre>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
                  {formatRelative(log.createdAt)}
                </span>
              </div>
            )
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={buildUrl({ page: String(page - 1) }) as Route} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">← Prev</Link>}
            {page < totalPages && <Link href={buildUrl({ page: String(page + 1) }) as Route} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Next →</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
