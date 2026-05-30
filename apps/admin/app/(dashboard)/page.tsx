import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { getDashboardStats } from '@/lib/services'
import { formatZAR } from '@xxm/utils'
import { MONTHS } from '@xxm/utils'
import { BarChart3, Target, Wallet, Users, FileText } from 'lucide-react'
import { Breadcrumb, ProgressBar } from '@xxm/ui'

export const metadata: Metadata = { title: 'Overview' }

export default async function AdminOverviewPage() {
  const session = await auth()
  const roles   = (session?.user as { roles?: string[] })?.roles ?? ['ADMIN']

  const { memberCount, totalDue, totalPaid, poolTotal, collectionRate, pendingMandates, month, year } =
    await getDashboardStats(roles)

  const greeting = session?.user?.name ? `Hello, ${session.user.name.split(' ')[0]}` : 'Hello'

  const stats = [
    { icon: Users,    label: 'Active Members',             value: memberCount,           color: 'bg-xxm-green-50 text-xxm-green' },
    { icon: Wallet,   label: 'Pool Total (All)',            value: formatZAR(poolTotal),  color: 'bg-xxm-gold-50 text-xxm-gold-dark' },
    { icon: BarChart3,label: `${MONTHS[month - 1]} Due`,   value: formatZAR(totalDue),   color: 'bg-blue-50 text-blue-600' },
    { icon: Target,   label: 'Pending Mandates',            value: pendingMandates,       color: 'xxm-icon-bg-warning' },
  ]

  const quickLinks = [
    { href: '/reports',      icon: FileText,  label: 'Reports' },
    { href: '/goals',        icon: Target,    label: 'Goals' },
    { href: '/mandates',     icon: Wallet,    label: 'Mandates' },
    { href: '/members',      icon: Users,     label: 'Members' },
    { href: '/invitations',  icon: Users,     label: 'Invitations' },
    { href: '/audit',        icon: BarChart3, label: 'Audit Log' },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin' }, { label: 'Overview' }]} />

      <div>
        <h1 className="text-2xl font-bold text-xxm-green">{greeting}</h1>
        <p className="text-sm text-xxm-gray-500 mt-1">Here&apos;s your platform overview for {MONTHS[month - 1]} {year}.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-white rounded-card border border-xxm-green/7 shadow-xxm-sm p-4">
            <div className={`w-9 h-9 rounded-xl ${color} flex items-center justify-center mb-3`}>
              <Icon size={17} aria-hidden />
            </div>
            <p className="text-2xl font-bold text-xxm-green-900">{value}</p>
            <p className="text-xs text-xxm-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Collection rate */}
      <div className="bg-white rounded-card border border-xxm-green/7 shadow-xxm-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-xxm-green-900">Monthly Collection Rate</h2>
            <p className="text-sm text-xxm-gray-500 mt-0.5">
              {formatZAR(totalPaid)} collected of {formatZAR(totalDue)} due
            </p>
          </div>
          <span className="text-2xl font-bold text-xxm-green">{collectionRate}%</span>
        </div>
        <ProgressBar value={collectionRate} max={100} variant={collectionRate >= 80 ? 'success' : collectionRate >= 50 ? 'warning' : 'danger'} animated />
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {quickLinks.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-card border border-xxm-green/7 shadow-xxm-sm hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-150 text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-xxm-green-50 flex items-center justify-center">
              <Icon size={18} className="text-xxm-green" aria-hidden />
            </div>
            <span className="text-xs font-medium text-xxm-gray-700">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
