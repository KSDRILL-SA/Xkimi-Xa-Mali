import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllContributions } from '@/lib/services'
import { formatZAR, MONTHS } from '@xxm/utils'
import { Alert, RouterPagination } from '@xxm/ui'
import { db } from '@/lib/db'
import { Wallet, ChevronDown, Zap } from 'lucide-react'

export const metadata: Metadata = { title: 'Contributions' }

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  PENDING: { label: 'Pending', dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  PARTIAL: { label: 'Partial', dot: 'bg-sky-500',    badge: 'bg-sky-100 text-sky-700' },
  PAID:    { label: 'Paid',    dot: 'bg-xxm-green',  badge: 'bg-xxm-green-100 text-xxm-green-700' },
  OVERDUE: { label: 'Overdue', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700' },
  WAIVED:  { label: 'Waived',  dot: 'bg-xxm-gray-400', badge: 'bg-xxm-gray-100 text-xxm-gray-600' },
}

const AVATAR_COLORS = [
  'bg-xxm-green text-white', 'bg-indigo-600 text-white', 'bg-purple-600 text-white',
  'bg-sky-600 text-white',   'bg-rose-600 text-white',   'bg-emerald-600 text-white',
]

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

type RawItem = {
  id: string; periodMonth: number; periodYear: number
  amountDue: unknown; amountPaid: unknown; status: string
  user: { firstName: string; lastName: string; email: string }
}

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; status?: string; page?: string; generated?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const now    = new Date()
  const params = await searchParams

  const month     = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1), 10)))
  const year      = Math.max(2024, parseInt(params.year ?? String(now.getFullYear()), 10))
  const status    = params.status ?? undefined
  const page      = Math.max(1, parseInt(params.page ?? '1', 10))
  const generated = params.generated === '1'

  const { items, total } = await listAllContributions(roles, { month, year, status, page, limit: 25 })
  const contributions = items as unknown as RawItem[]

  async function generate(fd: FormData) {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    const m = parseInt(fd.get('month') as string, 10)
    const y = parseInt(fd.get('year')  as string, 10)

    const activeMembers = await db.user.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        mandates: {
          where: { status: 'ACTIVE' },
          select: { debitDay: true, amount: true },
          take: 1,
        },
      },
    })
    await Promise.all(activeMembers.map((member) => {
      const mandate  = member.mandates[0]
      const debitDay = mandate?.debitDay ?? 1
      const amountDue = mandate?.amount ?? 100
      const dueDate   = new Date(y, m - 1, debitDay)
      return db.contribution.upsert({
        where: { userId_periodMonth_periodYear: { userId: member.id, periodMonth: m, periodYear: y } },
        create: { userId: member.id, periodMonth: m, periodYear: y, amountDue, amountPaid: 0, dueDate, status: 'PENDING' },
        update: {},
      })
    }))
    redirect(`/contributions?month=${m}&year=${y}&generated=1`)
  }

  const yearOpts = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-xxm-green-900 tracking-tight">Contributions</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            <span className="font-semibold text-xxm-green">{total}</span> records for {MONTHS[month - 1]} {year}
          </p>
        </div>
        <form action={generate} className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="year"  value={year} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-xxm-gold text-xxm-green-900 text-sm font-bold hover:bg-xxm-gold-light transition-colors shadow-gold-sm"
          >
            <Zap size={14} aria-hidden />
            Generate {MONTHS[month - 1]}
          </button>
        </form>
      </div>

      {generated && (
        <Alert variant="success" title="Generated">
          Contributions created for {MONTHS[month - 1]} {year}.
        </Alert>
      )}

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-4">
        <form method="GET" action="/contributions" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              name="month"
              defaultValue={month}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <div className="relative">
            <select
              name="year"
              defaultValue={year}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <div className="relative">
            <select
              name="status"
              defaultValue={status ?? ''}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors"
          >
            Filter
          </button>
        </form>
      </div>

      {/* ── Contributions list ──────────────────────────────── */}
      {contributions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <Wallet size={24} className="text-xxm-green-300" aria-hidden />
          </div>
          <p className="text-xxm-gray-600 font-medium">No contributions found</p>
          <p className="text-xxm-gray-400 text-sm mt-1">
            Try a different period or generate contributions for this month.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] gap-3 px-4 py-3 bg-xxm-gray-50 border-b border-xxm-gray-100">
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest">Member</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest hidden sm:block">Period</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-right">Due</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-right">Paid</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-center">Status</span>
          </div>
          <div className="divide-y divide-xxm-gray-50">
            {contributions.map((c) => {
              const fullName = `${c.user.firstName} ${c.user.lastName}`
              const initials = `${c.user.firstName[0] ?? ''}${c.user.lastName[0] ?? ''}`.toUpperCase()
              const sc = STATUS_CONFIG[c.status] ?? { label: c.status, dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700' }
              const avatarColor = getAvatarColor(c.user.firstName)

              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] gap-3 px-4 py-3 items-center hover:bg-xxm-green-50/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl ${avatarColor} flex items-center justify-center text-[11px] font-bold shrink-0`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-xxm-green-900 truncate">{fullName}</p>
                      <p className="text-[11px] text-xxm-gray-400 truncate">{c.user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-xxm-gray-600 hidden sm:block">{MONTHS[c.periodMonth - 1]} {c.periodYear}</span>
                  <span className="text-sm font-semibold text-xxm-gray-700 text-right tabular-nums">{formatZAR(c.amountDue as number)}</span>
                  <span className="text-sm font-semibold text-xxm-green-700 text-right tabular-nums">{formatZAR(c.amountPaid as number)}</span>
                  <div className="flex justify-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${sc.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} aria-hidden />
                      {sc.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────── */}
      {total > 25 && (
        <RouterPagination
          totalItems={total}
          itemsPerPage={25}
          currentPage={page}
          baseUrl={`/contributions?month=${month}&year=${year}${status ? `&status=${status}` : ''}`}
          className="justify-center"
        />
      )}

    </div>
  )
}
