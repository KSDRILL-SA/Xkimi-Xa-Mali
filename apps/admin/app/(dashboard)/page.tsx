import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getDashboardStats } from '@/lib/services'
import { formatZAR } from '@xxm/utils'
import { MONTHS } from '@xxm/utils'
import {
  BarChart3, Target, Wallet, Users, FileText,
  TrendingUp, CalendarCheck, UserPlus, ShieldCheck, Megaphone,
  ArrowRight, CheckCircle2,
} from 'lucide-react'
import { ProgressBar, Reveal } from '@xxm/ui'

export const metadata: Metadata = { title: 'Overview' }

export default async function AdminOverviewPage() {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const { memberCount, totalDue, totalPaid, poolTotal, collectionRate, pendingMandates, month, year } =
    await getDashboardStats(roles)

  const firstName  = session?.user?.name ? session.user.name.split(' ')[0] : 'Admin'
  const monthName  = MONTHS[month - 1]
  const collVariant = collectionRate >= 80 ? 'success' : collectionRate >= 50 ? 'warning' : 'danger'

  const stats = [
    {
      icon: Users,
      label: 'Active Members',
      value: memberCount.toString(),
      subtext: 'enrolled members',
      gradient: 'from-xxm-green-50 to-white',
      iconBg: 'bg-xxm-green/10',
      iconColor: 'text-xxm-green',
      border: 'border-xxm-green/15',
    },
    {
      icon: TrendingUp,
      label: 'Pool Total',
      value: formatZAR(poolTotal),
      subtext: 'all-time collected',
      gradient: 'from-amber-50 to-white',
      iconBg: 'bg-xxm-gold/15',
      iconColor: 'text-xxm-gold-dark',
      border: 'border-xxm-gold/20',
    },
    {
      icon: Wallet,
      label: `${monthName} Due`,
      value: formatZAR(totalDue),
      subtext: `${monthName} ${year} target`,
      gradient: 'from-sky-50 to-white',
      iconBg: 'bg-sky-100',
      iconColor: 'text-sky-600',
      border: 'border-sky-200',
    },
    {
      icon: CalendarCheck,
      label: 'Pending Mandates',
      value: pendingMandates.toString(),
      subtext: 'awaiting approval',
      gradient: pendingMandates > 0 ? 'from-orange-50 to-white' : 'from-xxm-green-50 to-white',
      iconBg: pendingMandates > 0 ? 'bg-orange-100' : 'bg-xxm-green-100',
      iconColor: pendingMandates > 0 ? 'text-orange-600' : 'text-xxm-green-700',
      border: pendingMandates > 0 ? 'border-orange-200' : 'border-xxm-green/15',
    },
  ]

  const quickLinks = [
    { href: '/members',       icon: Users,        label: 'Members',     description: 'Manage accounts',       iconColor: 'text-xxm-green',    iconBg: 'bg-xxm-green/8' },
    { href: '/invitations',   icon: UserPlus,     label: 'Invitations', description: 'Send & track invites',  iconColor: 'text-indigo-600',   iconBg: 'bg-indigo-50' },
    { href: '/contributions', icon: Wallet,       label: 'Contributions', description: 'Monthly payments',    iconColor: 'text-blue-600',     iconBg: 'bg-blue-50' },
    { href: '/reports',       icon: BarChart3,    label: 'Reports',     description: 'Financial summaries',   iconColor: 'text-xxm-gold-dark', iconBg: 'bg-xxm-gold/10' },
    { href: '/goals',         icon: Target,       label: 'Goals',       description: 'Group saving goals',    iconColor: 'text-emerald-600',  iconBg: 'bg-emerald-50' },
    { href: '/notifications', icon: Megaphone,    label: 'Broadcast',   description: 'Message all members',  iconColor: 'text-purple-600',   iconBg: 'bg-purple-50' },
    { href: '/mandates',      icon: CalendarCheck, label: 'Mandates',   description: 'Debit authorisations', iconColor: 'text-sky-600',      iconBg: 'bg-sky-50' },
    { href: '/audit',         icon: ShieldCheck,  label: 'Audit Log',   description: 'Security & activity',  iconColor: 'text-rose-600',     iconBg: 'bg-rose-50' },
  ]

  return (
    <div className="space-y-7">

      {/* ── Hero greeting ─────────────────────────────────────────── */}
      <Reveal variant="up" className="relative overflow-hidden bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 rounded-3xl p-6 md:p-9 text-white shadow-xxm-lg">
        <div className="noise-overlay" aria-hidden />
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none animate-orb-drift-1" aria-hidden />
        <div className="absolute bottom-0 right-1/3 w-44 h-44 bg-xxm-gold/10 rounded-full translate-y-1/2 pointer-events-none animate-orb-drift-2" aria-hidden />
        <div className="absolute -bottom-10 -left-6 w-40 h-40 bg-white/[0.04] rounded-full pointer-events-none animate-orb-drift-3" aria-hidden />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-3 glass-gold rounded-full px-3 py-1.5">
            <ShieldCheck size={12} className="text-xxm-gold" aria-hidden />
            <p className="text-xxm-gold text-[11px] font-bold tracking-widest uppercase">Xkimm Xa Mali Foundation — Admin</p>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight">
            Welcome back, <span className="text-shimmer">{firstName}</span>
          </h1>
          <p className="text-green-100/75 mt-2.5 text-sm md:text-base max-w-md leading-relaxed">
            Platform overview for{' '}
            <span className="text-white font-semibold">{monthName} {year}</span>.{' '}
            {collectionRate >= 80
              ? 'Collections are on track — excellent work!'
              : 'Some contributions still need attention this month.'}
          </p>
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            <Link
              href="/invitations"
              className="group inline-flex items-center gap-2 bg-xxm-gold hover:bg-xxm-gold-light text-xxm-green-900 text-sm font-bold px-5 py-2.5 rounded-2xl transition-all duration-fast ease-smooth hover:-translate-y-0.5 shadow-gold-sm"
            >
              <UserPlus size={15} aria-hidden /> Invite member
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" aria-hidden />
            </Link>
            <Link
              href="/reports"
              className="inline-flex items-center gap-2 bg-white/12 hover:bg-white/20 text-white text-sm font-semibold px-5 py-2.5 rounded-2xl transition-all duration-fast ease-smooth hover:-translate-y-0.5 border border-white/10 backdrop-blur-sm"
            >
              <FileText size={14} aria-hidden /> View reports
            </Link>
          </div>
        </div>
      </Reveal>

      {/* ── Stat cards ────────────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ icon: Icon, label, value, subtext, gradient, iconBg, iconColor, border }) => (
          <div
            key={label}
            className={`group relative overflow-hidden bg-gradient-to-b ${gradient} rounded-3xl border ${border} shadow-xxm-sm p-5 hover:shadow-xxm hover:-translate-y-1 transition-all duration-slow ease-smooth`}
          >
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-4 transition-transform duration-slow group-hover:scale-110`}>
              <Icon size={18} className={iconColor} aria-hidden />
            </div>
            <p className="stat-number text-2xl md:text-3xl font-extrabold text-xxm-green-900 leading-none">
              {value}
            </p>
            <p className="text-xs font-semibold text-xxm-gray-700 mt-1.5">{label}</p>
            <p className="text-[11px] text-xxm-gray-400 mt-0.5">{subtext}</p>
          </div>
        ))}
      </Reveal>

      {/* ── Collection rate ─────────────────────────────────────────── */}
      <Reveal variant="up" delay={200} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-display text-base font-bold text-xxm-green-900">{monthName} Collection Rate</h2>
            <p className="text-sm text-xxm-gray-500 mt-0.5">
              {formatZAR(totalPaid)} collected of {formatZAR(totalDue)} due this month
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2
              size={18}
              className={collectionRate >= 80 ? 'text-xxm-green' : 'text-xxm-gray-300'}
              aria-hidden
            />
            <span
              className={`stat-number text-3xl font-extrabold ${
                collectionRate >= 80 ? 'text-xxm-green' : collectionRate >= 50 ? 'text-amber-500' : 'text-red-500'
              }`}
            >
              {collectionRate}%
            </span>
          </div>
        </div>
        <ProgressBar value={collectionRate} max={100} variant={collVariant} animated />
        <div className="flex items-center justify-between text-[11px] text-xxm-gray-400">
          <span>0%</span>
          <span className="text-xxm-gray-500 font-medium">Target: {formatZAR(totalDue)}</span>
          <span>100%</span>
        </div>
      </Reveal>

      {/* ── Quick navigation ────────────────────────────────────────── */}
      <Reveal variant="up" delay={300}>
        <p className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-4">Quick Navigation</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickLinks.map(({ href, icon: Icon, label, description, iconColor, iconBg }) => (
            <Link
              key={href}
              href={href}
              className="group relative flex flex-col gap-3 p-4 bg-white rounded-2xl border border-xxm-green/7 shadow-xxm-sm hover:shadow-xxm hover:-translate-y-1 transition-all duration-slow ease-smooth"
            >
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center transition-transform duration-slow ease-bounce group-hover:scale-110`}>
                <Icon size={18} className={iconColor} aria-hidden />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-xxm-green-900">{label}</p>
                <p className="text-[11px] text-xxm-gray-400 mt-0.5 leading-snug">{description}</p>
              </div>
              <ArrowRight size={14} className={`absolute top-4 right-4 ${iconColor} opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-slow`} aria-hidden />
            </Link>
          ))}
        </div>
      </Reveal>

    </div>
  )
}
