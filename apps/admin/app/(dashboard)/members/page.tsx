import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listMembers } from '@/lib/services'
import { Reveal, RouterPagination } from '@xxm/ui'
import { Search, Users, CheckCircle2, Clock, Ban, ArrowRight } from 'lucide-react'

export const metadata: Metadata = { title: 'Members' }

type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

const STATUS_CONFIG: Record<UserStatus, { label: string; dot: string; badge: string }> = {
  ACTIVE:    { label: 'Active',    dot: 'bg-xxm-green',  badge: 'bg-xxm-green-100 text-xxm-green-700' },
  PENDING:   { label: 'Pending',   dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  SUSPENDED: { label: 'Suspended', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700' },
}

const AVATAR_COLORS = [
  'bg-xxm-green text-white', 'bg-indigo-600 text-white', 'bg-purple-600 text-white',
  'bg-sky-600 text-white',   'bg-rose-600 text-white',   'bg-emerald-600 text-white',
  'bg-amber-600 text-white', 'bg-teal-600 text-white',
]

function getAvatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}

type RawMember = {
  id: string; firstName: string; lastName: string; email: string;
  phone: string; status: string; createdAt: Date;
  _count: { contributions: number; mandates: number }
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const params  = await searchParams
  const search  = params.search ?? undefined
  const status  = params.status as UserStatus | undefined
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total } = await listMembers(roles, { search, status, page, limit: 25 })
  const members = items as unknown as RawMember[]

  const activeCount    = members.filter(m => m.status === 'ACTIVE').length
  const pendingCount   = members.filter(m => m.status === 'PENDING').length
  const suspendedCount = members.filter(m => m.status === 'SUSPENDED').length

  const filterTabs: { value: UserStatus | ''; label: string; icon: React.FC<{ size?: number; className?: string }> }[] = [
    { value: '',          label: `All (${total})`,          icon: Users },
    { value: 'ACTIVE',    label: `Active (${activeCount})`, icon: CheckCircle2 },
    { value: 'PENDING',   label: `Pending (${pendingCount})`, icon: Clock },
    { value: 'SUSPENDED', label: `Suspended (${suspendedCount})`, icon: Ban },
  ]

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Members</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            <span className="stat-number font-semibold text-xxm-green">{total}</span> registered members
          </p>
        </div>
      </Reveal>

      {/* ── Search + filters ─────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-4 space-y-3">
        <form method="GET" action="/members" className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search name, email or phone…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-xxm-gray-200 text-sm text-xxm-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 placeholder:text-xxm-gray-400"
            />
          </div>
          {status && <input type="hidden" name="status" value={status} />}
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors shrink-0"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {filterTabs.map(({ value, label, icon: Icon }) => {
            const isActive = status === value || (!status && value === '')
            const p = new URLSearchParams()
            if (value) p.set('status', value)
            if (search) p.set('search', search)
            const q = p.toString()
            return (
              <Link
                key={value || 'all'}
                href={q ? `/members?${q}` : '/members'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-xxm-green text-white shadow-sm'
                    : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'
                }`}
              >
                <Icon size={11} aria-hidden />
                {label}
              </Link>
            )
          })}
          {(search || status) && (
            <Link
              href="/members"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
            >
              Clear filters
            </Link>
          )}
        </div>
      </Reveal>

      {/* ── Members list ─────────────────────────────────────── */}
      <Reveal variant="up" delay={200}>
      {members.length === 0 ? (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-xxm-green-300" aria-hidden />
          </div>
          <p className="text-xxm-gray-600 font-medium">No members found</p>
          <p className="text-xxm-gray-400 text-sm mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_80px_64px_64px_80px] gap-3 px-4 py-3 bg-xxm-gray-50 border-b border-xxm-gray-100">
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest">Member</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest hidden sm:block">Phone</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-center hidden md:block">Status</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-center hidden md:block">Contribs</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-center hidden lg:block">Mandates</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-center">Action</span>
          </div>

          <div className="divide-y divide-xxm-gray-50">
            {members.map((m) => {
              const fullName = `${m.firstName} ${m.lastName}`
              const initials = `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase()
              const avatarColor = getAvatarColor(m.firstName)
              const sc = STATUS_CONFIG[m.status as UserStatus] ?? { label: m.status, dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700' }

              return (
                <div
                  key={m.id}
                  className="grid grid-cols-[2fr_1fr_80px_64px_64px_80px] gap-3 px-4 py-3 items-center hover:bg-xxm-green-50/40 transition-colors group"
                >
                  {/* Member avatar + name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl ${avatarColor} flex items-center justify-center text-xs font-bold shrink-0 transition-transform duration-slow group-hover:scale-110`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-xxm-green-900 truncate">{fullName}</p>
                      <p className="text-[11px] text-xxm-gray-400 truncate">{m.email}</p>
                    </div>
                  </div>

                  {/* Phone */}
                  <span className="text-xs font-mono text-xxm-gray-600 hidden sm:block">{m.phone}</span>

                  {/* Status */}
                  <div className="hidden md:flex justify-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${sc.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} aria-hidden />
                      {sc.label}
                    </span>
                  </div>

                  {/* Contributions */}
                  <span className="stat-number text-sm font-semibold text-xxm-gray-700 text-center hidden md:block">
                    {m._count.contributions}
                  </span>

                  {/* Mandates */}
                  <span className="stat-number text-sm font-semibold text-xxm-gray-700 text-center hidden lg:block">
                    {m._count.mandates}
                  </span>

                  {/* Action */}
                  <div className="flex justify-center">
                    <Link
                      href={`/members/${m.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-xxm-green-50 text-xxm-green text-xs font-semibold hover:bg-xxm-green hover:text-white transition-colors"
                    >
                      View
                      <ArrowRight size={11} aria-hidden />
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      </Reveal>

      {/* ── Pagination ──────────────────────────────────────── */}
      {total > 25 && (
        <RouterPagination
          totalItems={total}
          itemsPerPage={25}
          currentPage={page}
          baseUrl={(() => {
            const p = new URLSearchParams()
            if (search) p.set('search', search)
            if (status) p.set('status', status)
            const q = p.toString()
            return q ? `/members?${q}` : '/members'
          })()}
          className="justify-center"
        />
      )}
    </div>
  )
}
