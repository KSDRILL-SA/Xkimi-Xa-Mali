import { Suspense } from 'react'
import type { Metadata, Route } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { SkeletonCard, SkeletonRow } from '@/components/ui/Skeleton'
import { Reveal } from '@xxm/ui'
import { DashboardStats } from './_sections/DashboardStats'
import { DashboardRecentContributions } from './_sections/DashboardRecentContributions'
import { DashboardActiveGoals } from './_sections/DashboardActiveGoals'
import {
  Sparkles, Wallet, ArrowRight, CreditCard, Target, FileText,
  Receipt, ChevronRight,
} from 'lucide-react'

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

const QUICK_ACTIONS = [
  { href: '/dashboard/contribute',    label: 'Make a payment', sub: 'Pay your contribution', icon: CreditCard, primary: true },
  { href: '/dashboard/contributions', label: 'Contributions',  sub: 'Your monthly ledger',   icon: Wallet },
  { href: '/dashboard/goals',         label: 'Goals',          sub: 'Track your targets',    icon: Target },
  { href: '/dashboard/statements',    label: 'Statements',     sub: 'Download PDFs',         icon: FileText },
] as const

function SectionHeading({
  icon: Icon, title, subtitle, href, hrefLabel,
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
  href?: string
  hrefLabel?: string
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-xxm-green/10 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-xxm-green" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-base font-extrabold text-xxm-green-900 tracking-tight leading-none">{title}</h2>
          {subtitle && <p className="text-[11px] text-xxm-gray-400 mt-1">{subtitle}</p>}
        </div>
      </div>
      {href && (
        <Link
          href={href as Route}
          className="group inline-flex items-center gap-1 text-xs font-semibold text-xxm-green hover:text-xxm-canopy transition-colors shrink-0"
        >
          {hrefLabel ?? 'View all'}
          <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" aria-hidden />
        </Link>
      )}
    </div>
  )
}

export default async function DashboardPage() {
  const session = await getSession()
  const firstName = session!.user.name?.split(' ')[0] ?? 'Member'

  return (
    <div className="space-y-8">

      {/* ── Hero greeting — renders immediately, no DB dependency ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 rounded-3xl p-6 md:p-9 text-white shadow-xxm-lg">
        <div className="noise-overlay" aria-hidden />
        {/* animated light orbs */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none animate-orb-drift-1" aria-hidden />
        <div className="absolute bottom-0 right-1/3 w-44 h-44 bg-xxm-gold/10 rounded-full translate-y-1/2 pointer-events-none animate-orb-drift-2" aria-hidden />
        <div className="absolute -bottom-10 -left-6 w-40 h-40 bg-white/[0.04] rounded-full pointer-events-none animate-orb-drift-3" aria-hidden />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-3 glass-gold rounded-full px-3 py-1.5 animate-fade-in-down">
            <Sparkles size={12} className="text-xxm-gold" aria-hidden />
            <p className="text-xxm-gold text-[11px] font-bold tracking-widest uppercase">Member Dashboard</p>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight animate-fade-in-up">
            Welcome back, <span className="text-shimmer">{firstName}</span>
          </h1>
          <p className="text-green-100/75 mt-2.5 text-sm md:text-base max-w-md leading-relaxed animate-fade-in-up delay-100">
            Your contributions, goals, and progress with the brotherhood — all in one place.
          </p>
          <div className="mt-6 flex items-center gap-3 flex-wrap animate-fade-in-up delay-200">
            <Link
              href="/dashboard/contribute"
              className="group inline-flex items-center gap-2 bg-xxm-gold hover:bg-xxm-gold-light text-xxm-green-900 text-sm font-bold px-5 py-2.5 rounded-2xl transition-all duration-fast ease-smooth hover:-translate-y-0.5 shadow-gold-sm"
            >
              Make a payment
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" aria-hidden />
            </Link>
            <Link
              href="/dashboard/contributions"
              className="inline-flex items-center gap-2 bg-white/12 hover:bg-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-2xl transition-all duration-fast ease-smooth hover:-translate-y-0.5 border border-white/10 backdrop-blur-sm"
            >
              <Wallet size={14} aria-hidden /> View contributions
            </Link>
          </div>
        </div>
      </div>

      {/* ── Quick actions — instant, communicates the whole app at a glance ── */}
      <Reveal variant="up">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {QUICK_ACTIONS.map(({ href, label, sub, icon: Icon, primary }, i) => (
            <Link
              key={href}
              href={href as Route}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`group relative overflow-hidden rounded-2xl border p-4 md:p-5 transition-all duration-slow ease-smooth hover:-translate-y-1 animate-fade-in-up ${
                primary
                  ? 'bg-gradient-to-br from-xxm-green to-xxm-canopy border-transparent text-white shadow-xxm hover:shadow-xxm-lg'
                  : 'bg-white border-xxm-green/8 shadow-xxm-sm hover:shadow-xxm hover:border-xxm-green/20'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform duration-slow ease-bounce group-hover:scale-110 ${
                primary ? 'bg-white/15' : 'bg-xxm-green/8'
              }`}>
                <Icon size={18} className={primary ? 'text-xxm-gold' : 'text-xxm-green'} aria-hidden />
              </div>
              <p className={`font-bold text-sm leading-tight ${primary ? 'text-white' : 'text-xxm-green-900'}`}>{label}</p>
              <p className={`text-[11px] mt-1 ${primary ? 'text-green-100/70' : 'text-xxm-gray-400'}`}>{sub}</p>
              <ArrowRight
                size={15}
                className={`absolute top-4 right-4 transition-all duration-slow opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-1 ${
                  primary ? 'text-xxm-gold' : 'text-xxm-green'
                }`}
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </Reveal>

      {/* ── Snapshot — stat cards stream in as member summary resolves ── */}
      <Reveal variant="up" delay={100}>
        <section>
          <SectionHeading icon={Sparkles} title="Your snapshot" subtitle="Contributions at a glance" />
          <Suspense fallback={<StatsSkeleton />}>
            <DashboardStats />
          </Suspense>
        </section>
      </Reveal>

      {/* ── Recent contributions ── */}
      <Reveal variant="up" delay={150}>
        <section>
          <SectionHeading
            icon={Receipt}
            title="Recent contributions"
            subtitle="Your latest payments"
            href="/dashboard/contributions"
          />
          <Suspense fallback={<SkeletonRow cols={5} />}>
            <DashboardRecentContributions />
          </Suspense>
        </section>
      </Reveal>

      {/* ── Active goals ── */}
      <Reveal variant="up" delay={200}>
        <section>
          <SectionHeading
            icon={Target}
            title="Active goals"
            subtitle="What the brotherhood is building"
            href="/dashboard/goals"
          />
          <Suspense fallback={<GoalsSkeleton />}>
            <DashboardActiveGoals />
          </Suspense>
        </section>
      </Reveal>

    </div>
  )
}
