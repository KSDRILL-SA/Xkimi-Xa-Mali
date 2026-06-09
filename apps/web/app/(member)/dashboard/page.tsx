import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton'
import { DashboardStats } from './_sections/DashboardStats'
import { DashboardRecentContributions } from './_sections/DashboardRecentContributions'
import { DashboardActiveGoals } from './_sections/DashboardActiveGoals'
import { Sparkles, Wallet } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard' }

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

function GoalsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

export default async function DashboardPage() {
  const session = await getSession()
  const firstName = session!.user.name?.split(' ')[0] ?? 'Member'

  return (
    <div className="space-y-7">

      {/* ── Hero greeting — renders immediately, no DB dependency ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 rounded-2xl p-6 md:p-8 text-white shadow-xxm-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-xxm-gold" aria-hidden />
            <p className="text-xxm-gold text-xs font-bold tracking-widest uppercase">Member Dashboard</p>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-green-200/80 mt-2 text-sm max-w-md leading-relaxed">
            Your financial journey with Xkimm Xa Mali.
          </p>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Link
              href="/dashboard/contributions"
              className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors border border-white/10"
            >
              <Wallet size={14} aria-hidden /> View Contributions
            </Link>
            <Link
              href="/dashboard/contribute"
              className="inline-flex items-center gap-2 bg-xxm-gold hover:bg-xxm-gold-light text-xxm-green-900 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-gold-sm"
            >
              Make Payment
            </Link>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" aria-hidden />
        <div className="absolute bottom-0 right-1/4 w-36 h-36 bg-xxm-gold/10 rounded-full translate-y-1/2 pointer-events-none" aria-hidden />
      </div>

      {/* ── Stat cards — streams in as member summary resolves ── */}
      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      {/* ── Recent contributions — streams in as query resolves ── */}
      <Suspense fallback={<SkeletonRow cols={5} />}>
        <DashboardRecentContributions />
      </Suspense>

      {/* ── Active goals — streams in as query resolves ── */}
      <Suspense fallback={<GoalsSkeleton />}>
        <DashboardActiveGoals />
      </Suspense>

    </div>
  )
}
