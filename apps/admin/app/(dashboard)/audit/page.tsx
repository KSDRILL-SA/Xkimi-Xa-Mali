import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAuditLogs } from '@/lib/services'
import { formatDate, formatRelativeTime } from '@xxm/utils'
import { Breadcrumb, Reveal, RouterPagination, PageHeader } from '@xxm/ui'
import { ScrollText, Search, X, ShieldCheck, ShieldAlert, ShieldX, Pencil } from 'lucide-react'

export const metadata: Metadata = { title: 'Audit Log' }

type Category = 'success' | 'danger' | 'warning' | 'info'

const CATEGORY_STYLE: Record<Category, { badge: string; dot: string; icon: typeof ShieldCheck }> = {
  success: { badge: 'bg-xxm-green-50 text-xxm-green-700 ring-1 ring-xxm-green/15', dot: 'bg-xxm-green',  icon: ShieldCheck },
  danger:  { badge: 'bg-red-50 text-red-700 ring-1 ring-red-200',                 dot: 'bg-red-500',    icon: ShieldX },
  warning: { badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',           dot: 'bg-amber-500',  icon: Pencil },
  info:    { badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',                  dot: 'bg-sky-500',    icon: ShieldAlert },
}

function categorize(action: string): Category {
  const a = action.toUpperCase()
  if (/DELETE|REJECT|FAIL|REVERSE|SUSPEND|REVOK|LOCK/.test(a)) return 'danger'
  if (/CREATE|APPROVE|ACTIVAT|GENERAT|SUCCESS|PAID|UNLOCK|ACCEPT|SENT/.test(a)) return 'success'
  if (/UPDATE|CHANGE|EDIT|PROGRESS|PREFERENCE|RESET/.test(a)) return 'warning'
  return 'info'
}

function humanize(action: string): string {
  return action
    .replace(/^ADMIN_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

function payloadPills(payload: unknown): { key: string; value: string }[] {
  if (!payload || typeof payload !== 'object') return []
  return Object.entries(payload as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, v]) => {
      let value: string
      if (v === null || v === undefined) value = '—'
      else if (typeof v === 'object') value = Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : '{…}'
      else value = String(v)
      if (value.length > 32) value = `${value.slice(0, 32)}…`
      return { key, value }
    })
}

const AVATAR_COLORS = ['bg-xxm-green', 'bg-indigo-600', 'bg-purple-600', 'bg-sky-600', 'bg-rose-600', 'bg-emerald-600']

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; userId?: string; page?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')
  const params  = await searchParams
  const entity  = params.entity  ?? undefined
  const action  = params.action  ?? undefined
  const userId  = params.userId  ?? undefined
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total } = await listAuditLogs(roles, { entity, action, userId, page, limit: 30 })

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { entity, action, userId, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const qs = p.toString()
    return `/audit${qs ? `?${qs}` : ''}`
  }

  type AuditRow = {
    id: string; action: string; entity: string; entityId: string; payload: unknown
    ipAddress: string | null; createdAt: Date
    user: { id: string; firstName: string; lastName: string } | null
  }
  const rows = items as unknown as AuditRow[]

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Audit' }]} />

      <Reveal variant="up">
        <PageHeader
          title="Audit Log"
          subtitle={`${total} event${total === 1 ? '' : 's'} · immutable, read-only trail`}
          icon={<ScrollText size={22} className="text-xxm-green" aria-hidden />}
        />
      </Reveal>

      {/* ── Filters ───────────────────────────────────────────── */}
      <Reveal variant="up" delay={100}>
        <form method="GET" action="/audit" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-xxm-gray-400" aria-hidden />
            <input type="text" name="action" defaultValue={action} placeholder="Action (e.g. GOAL_UPDATED)…"
              className="rounded-xl border border-xxm-gray-200 pl-9 pr-3 py-2 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white w-60" />
          </div>
          <input type="text" name="entity" defaultValue={entity} placeholder="Entity (User, Goal…)"
            className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white" />
          <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors">Filter</button>
          {(action || entity || userId) && (
            <Link href="/audit" className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-500 hover:bg-xxm-gray-50">
              <X size={13} aria-hidden /> Clear
            </Link>
          )}
        </form>
      </Reveal>

      {/* ── Table ─────────────────────────────────────────────── */}
      <Reveal variant="up" delay={200} className="space-y-4">
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm border-collapse">
              <thead>
                <tr className="bg-xxm-gray-50/80 border-b border-xxm-gray-100">
                  <Th>Event</Th>
                  <Th>Actor</Th>
                  <Th>Details</Th>
                  <Th className="text-right">When</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-xxm-gray-50">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-14 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-xxm-gray-50 flex items-center justify-center mx-auto mb-3">
                        <ScrollText size={20} className="text-xxm-gray-300" aria-hidden />
                      </div>
                      <p className="text-sm text-xxm-gray-400">No audit events match these filters.</p>
                    </td>
                  </tr>
                ) : (
                  rows.map((log, i) => {
                    const cat = categorize(log.action)
                    const cs = CATEGORY_STYLE[cat]
                    const CatIcon = cs.icon
                    const pills = payloadPills(log.payload)
                    const avatar = AVATAR_COLORS[(log.user?.firstName.charCodeAt(0) ?? 0) % AVATAR_COLORS.length]
                    return (
                      <tr
                        key={log.id}
                        style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                        className="animate-fade-in-up hover:bg-xxm-green-50/30 transition-colors align-top"
                      >
                        {/* Event */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${cs.badge}`}>
                            <CatIcon size={12} aria-hidden />
                            {humanize(log.action)}
                          </span>
                          <p className="text-[11px] text-xxm-gray-400 mt-1.5">
                            {log.entity} · <span className="font-mono text-xxm-gray-400">{log.entityId.slice(0, 10)}…</span>
                          </p>
                        </td>

                        {/* Actor */}
                        <td className="px-5 py-4">
                          {log.user ? (
                            <Link href={`/members/${log.user.id}`} className="group inline-flex items-center gap-2">
                              <span className={`w-7 h-7 rounded-lg ${avatar} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}>
                                {(log.user.firstName[0] ?? '') + (log.user.lastName[0] ?? '')}
                              </span>
                              <span className="text-xs font-semibold text-xxm-green-900 group-hover:text-xxm-green group-hover:underline">
                                {log.user.firstName} {log.user.lastName}
                              </span>
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-xxm-gray-200 text-xxm-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0">SY</span>
                              <span className="text-xs font-medium text-xxm-gray-400">System</span>
                            </span>
                          )}
                          {log.ipAddress && <p className="text-[10px] text-xxm-gray-300 font-mono mt-1 ml-9">{log.ipAddress}</p>}
                        </td>

                        {/* Details */}
                        <td className="px-5 py-4">
                          {pills.length === 0 ? (
                            <span className="text-xs text-xxm-gray-300">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 max-w-md">
                              {pills.map(({ key, value }) => (
                                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-xxm-gray-50 border border-xxm-gray-100 text-[11px]">
                                  <span className="text-xxm-gray-400">{key}</span>
                                  <span className="font-semibold text-xxm-green-900">{value}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* When */}
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className="text-xs font-medium text-xxm-gray-600" title={formatDate(log.createdAt)}>
                            {formatRelativeTime(log.createdAt)}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <RouterPagination totalItems={total} itemsPerPage={30} currentPage={page} baseUrl={buildUrl({ page: undefined })} className="justify-center" />
      </Reveal>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3 text-left text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest ${className}`}>
      {children}
    </th>
  )
}
