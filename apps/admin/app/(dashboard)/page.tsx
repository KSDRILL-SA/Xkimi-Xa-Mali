import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatZAR } from '@xxm/utils'
import { BarChart3, Target, Wallet, Users, FileText } from 'lucide-react'
import { Breadcrumb, ProgressBar } from '@xxm/ui'

export const metadata: Metadata = { title: 'Overview' }

export default async function AdminOverviewPage() {
  const session = await auth()
  const now = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  const [memberCount, activeContribs, poolResult, pendingMandates] = await Promise.all([
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.contribution.findMany({
      where: { periodMonth: month, periodYear: year },
      select: { amountDue: true, amountPaid: true, status: true },
    }),
    db.contribution.aggregate({
      _sum: { amountPaid: true },
    }),
    db.paymentMandate.count({ where: { status: 'PENDING' } }),
  ])

  const totalDue    = activeContribs.reduce((s, c) => s + Number(c.amountDue),  0)
  const totalPaid   = activeContribs.reduce((s, c) => s + Number(c.amountPaid), 0)
  const poolTotal   = Number(poolResult._sum.amountPaid ?? 0)
  const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

  const greeting = session?.user?.name ? `Hello, ${session.user.name.split(' ')[0]}` : 'Hello'

  const stats = [
    { icon: Users,    label: 'Active Members',    value: memberCount,           color: 'bg-xxm-green-50 text-xxm-green' },
    { icon: Wallet,   label: 'Pool Total (All)',   value: formatZAR(poolTotal),  color: 'bg-xxm-gold-50 text-xxm-gold-dark' },
    { icon: BarChart3,label: 'This Month Due',     value: formatZAR(totalDue),   color: 'bg-blue-50 text-blue-600' },
    { icon: Target,   label: 'Pending Mandates',   value: pendingMandates,       color: 'bg-amber-50 text-amber-600' },
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
        <p className="text-sm text-xxm-gray-500 mt-1">Here&apos;s your platform overview for {now.toLocaleString('en-ZA', { month: 'long', year: 'numeric' })}.</p>
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
