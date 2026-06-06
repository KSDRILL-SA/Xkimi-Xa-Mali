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
import { ProgressBar } from '@xxm/ui'

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
      <div className="relative overflow-hidden bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 rounded-2xl p-6 md:p-8 text-white shadow-xxm-lg">
        <div className="relative z-10">
          <p className="text-xxm-gold text-xs font-bold tracking-widest uppercase mb-2">Xkimm Xa Mali — Admin</p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-green-200/90 mt-2 text-sm max-w-md leading-relaxed">
            Platform overview for{' '}
            <span className="text-white font-semibold">{monthName} {year}</span>.{' '}
            {collectionRate >= 80
              ? 'Collections are on track — excellent work!'
              : 'Some contributions still need attention this month.'}
          </p>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Link
              href="/reports"
              className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors border border-white/10"
            >
              <FileText size={14} aria-hidden /> View Reports
            </Link>
            <Link
              href="/invitations"
              className="inline-flex items-center gap-2 bg-xxm-gold hover:bg-xxm-gold-light text-xxm-green-900 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-gold-sm"
            >
              <UserPlus size={14} aria-hidden /> Invite Member
            </Link>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" aria-hidden />
        <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-xxm-gold/10 rounded-full translate-y-1/2 pointer-events-none" aria-hidden />
      </div>

      {/* ── Stat cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ icon: Icon, label, value, subtext, gradient, iconBg, iconColor, border }) => (
          <div
            key={label}
            className={`relative overflow-hidden bg-gradient-to-b ${gradient} rounded-2xl border ${border} shadow-xxm-sm p-5 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-200`}
          >
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-4`}>
              <Icon size={18} className={iconColor} aria-hidden />
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-xxm-green-900 tabular-nums leading-none">
              {value}
            </p>
            <p className="text-xs font-semibold text-xxm-gray-700 mt-1.5">{label}</p>
            <p className="text-[11px] text-xxm-gray-400 mt-0.5">{subtext}</p>
          </div>
        ))}
      </div>

      {/* ── Collection rate ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-xxm-green-900">{monthName} Collection Rate</h2>
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
              className={`text-3xl font-extrabold tabular-nums ${
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
      </div>

      {/* ── Quick navigation ────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-4">Quick Navigation</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickLinks.map(({ href, icon: Icon, label, description, iconColor, iconBg }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col gap-3 p-4 bg-white rounded-2xl border border-xxm-green/7 shadow-xxm-sm hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center group-hover:scale-105 transition-transform duration-200`}>
                <Icon size={18} className={iconColor} aria-hidden />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-xxm-green-900">{label}</p>
                <p className="text-[11px] text-xxm-gray-400 mt-0.5 leading-snug">{description}</p>
              </div>
              <ArrowRight size={12} className={`${iconColor} opacity-0 group-hover:opacity-100 transition-opacity`} aria-hidden />
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
