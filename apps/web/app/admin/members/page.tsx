import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { listMembers } from '@/services/admin.service'
import { formatDate } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Members — Admin' }

type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

type MemberListItem = {
  id: string; firstName: string; lastName: string; email: string;
  phone: string; status: string; createdAt: Date;
  roles: { role: string }[];
  _count: { contributions: number; mandates: number };
}

const STATUS_CONFIG: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE:    { label: 'Active',    className: 'bg-green-100 text-green-700' },
  PENDING:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-700' },
  SUSPENDED: { label: 'Suspended', className: 'bg-red-100 text-red-700' },
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>
}) {
  const session = await auth()
  const roles = (session!.user.roles as string[] | undefined) ?? []
  const params = await searchParams

  const search = params.search ?? undefined
  const status = params.status as UserStatus | undefined
  const page   = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total, totalPages } = await listMembers(roles, { search, status, page, limit: 25 })

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { search, status, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const qs = p.toString()
    return `/admin/members${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Members</h1>
          <p className="text-sm text-gray-500 mt-1">{total} total</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <form method="GET" action="/admin/members" className="flex gap-2 flex-1 min-w-0">
          <input
            type="text"
            name="search"
            defaultValue={search}
            placeholder="Search name, email or phone…"
            className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-xxm-green/30"
          />
          {status && <input type="hidden" name="status" value={status} />}
          <button type="submit" className="px-4 py-1.5 rounded-lg bg-xxm-green text-white text-sm font-medium">
            Search
          </button>
        </form>

        <div className="flex gap-1.5">
          {(['ACTIVE', 'PENDING', 'SUSPENDED'] as UserStatus[]).map((s) => (
            <Link
              key={s}
              href={buildUrl({ status: status === s ? undefined : s, page: '1' })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                status === s
                  ? 'bg-xxm-green text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {STATUS_CONFIG[s].label}
            </Link>
          ))}
          {(search || status) && (
            <Link href="/admin/members" className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 hover:bg-gray-200">
              Clear
            </Link>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-left font-semibold">Phone</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Contribs</th>
                <th className="px-4 py-3 text-center font-semibold">Mandates</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Joined</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    No members found.
                  </td>
                </tr>
              ) : (
                (items as MemberListItem[]).map((m, i) => {
                  const sc = STATUS_CONFIG[m.status as UserStatus]
                  return (
                    <tr key={m.id} className={`border-t border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{m.firstName} {m.lastName}</p>
                        <p className="text-xs text-gray-400">{m.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono">{m.phone}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.className}`}>
                          {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">{(m._count as { contributions: number }).contributions}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{(m._count as { mandates: number }).mandates}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">{formatDate(m.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/admin/members/${m.id}`}
                          className="text-xs text-xxm-green hover:underline font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
