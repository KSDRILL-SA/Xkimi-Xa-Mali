import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllMandates, approveMandate, rejectMandate } from '@/services/admin.service'
import { formatZAR, formatDate } from '@/lib/formatters'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { RouterPagination } from '@/components/ui/RouterPagination'

export const metadata: Metadata = { title: 'Mandates — Admin' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
  ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
  SUSPENDED: { label: 'Suspended', className: 'xxm-status-warning' },
  CANCELLED: { label: 'Cancelled', className: 'xxm-status-danger'  },
}

export default async function AdminMandatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; actioned?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams

  const filterStatus = params.status as 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | undefined
  const page  = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total, totalPages } = await listAllMandates(roles, { status: filterStatus, page, limit: 25 })

  async function approve(fd: FormData) {
    'use server'
    const s  = await auth()
    const r  = (s!.user.roles as string[] | undefined) ?? []
    const id = fd.get('mandateId') as string
    await approveMandate(s!.user.id, r, id)
    redirect('/admin/mandates?actioned=1')
  }
  async function reject(fd: FormData) {
    'use server'
    const s  = await auth()
    const r  = (s!.user.roles as string[] | undefined) ?? []
    const id = fd.get('mandateId') as string
    await rejectMandate(s!.user.id, r, id)
    redirect('/admin/mandates?actioned=1')
  }

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { status: filterStatus, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    return `/admin/mandates?${p.toString()}`
  }

  type MandateRow = {
    id: string; status: string; amount: unknown; debitDay: number; createdAt: Date; netcashMandateId: string | null;
    user: { id: string; firstName: string; lastName: string; email: string };
    bankAccount: { bankName: string; accountType: string };
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/admin' }, { label: 'Mandates' }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Mandates</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">{total} total</p>
        </div>
      </div>

      {params.actioned === '1' && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Mandate updated successfully.
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        <Link
          href={buildUrl({ status: undefined, page: '1' }) as Route}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!filterStatus ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'}`}
        >
          All
        </Link>
        {(['PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED'] as const).map((s) => (
          <Link
            key={s}
            href={buildUrl({ status: filterStatus === s ? undefined : s, page: '1' }) as Route}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'
            }`}
          >
            {STATUS_CONFIG[s].label}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-xxm-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-xxm-gray-50 text-xs uppercase tracking-wider text-xxm-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-left font-semibold">Bank</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-center font-semibold">Day</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Created</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-xxm-gray-50">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-xxm-gray-400">No mandates found.</td>
                </tr>
              ) : (
                (items as MandateRow[]).map((m, i) => {
                  const cfg = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.PENDING
                  return (
                    <tr key={m.id} className={`hover:bg-xxm-green-50/30 transition-colors ${i % 2 === 1 ? 'bg-xxm-gray-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <Link href={`/admin/members/${m.user.id}`} className="font-medium text-xxm-green hover:underline">
                          {m.user.firstName} {m.user.lastName}
                        </Link>
                        <p className="text-xs text-xxm-gray-400">{m.user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-xxm-gray-600">
                        <p className="font-medium">{m.bankAccount.bankName}</p>
                        <p className="text-xxm-gray-400">{m.bankAccount.accountType}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-xxm-gray-800 tabular-nums">{formatZAR(Number(m.amount))}</td>
                      <td className="px-4 py-3 text-center text-xxm-gray-600">{m.debitDay}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cfg.className} role="status">{cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-xxm-gray-400 hidden md:table-cell">{formatDate(m.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-1.5">
                          {m.status === 'PENDING' && (
                            <form action={approve}>
                              <input type="hidden" name="mandateId" value={m.id} />
                              <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-semibold border border-green-200 transition-colors min-h-[32px]">
                                Approve
                              </button>
                            </form>
                          )}
                          {m.status !== 'CANCELLED' && (
                            <form action={reject}>
                              <input type="hidden" name="mandateId" value={m.id} />
                              <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 hover:bg-red-100 font-semibold border border-red-200 transition-colors min-h-[32px]">
                                Reject
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RouterPagination totalItems={total} itemsPerPage={25} currentPage={page} baseUrl="/admin/mandates" className="justify-center" />
    </div>
  )
}
