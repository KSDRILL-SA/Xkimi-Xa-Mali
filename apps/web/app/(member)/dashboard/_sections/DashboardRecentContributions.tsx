import Link from 'next/link'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { ContributionStatusBadge } from '@/components/contribution/StatusBadge'
import { formatZAR } from '@/lib/formatters'
import { Wallet, ArrowRight, ChevronRight } from 'lucide-react'
import type { Contribution } from '@xxm/types'

export async function DashboardRecentContributions() {
  const session = await getSession()
  const userId = session!.user.id

  const recentContributions = await db.contribution.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">Recent Contributions</h2>
        <Link
          href="/dashboard/contributions"
          className="inline-flex items-center gap-1 text-xs font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
        >
          View all <ChevronRight size={13} aria-hidden />
        </Link>
      </div>

      {recentContributions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-3">
            <Wallet size={20} className="text-xxm-green-300" aria-hidden />
          </div>
          <p className="text-xxm-gray-500 text-sm font-medium">No contributions yet</p>
          <p className="text-xxm-gray-400 text-xs mt-1">Set up your payment mandate to get started.</p>
          <Link
            href="/dashboard/mandates"
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-xxm-green text-white text-xs font-semibold hover:bg-xxm-canopy transition-colors"
          >
            Set up mandate <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">
          {recentContributions.map((c: Contribution, i: number) => (
            <div
              key={c.id}
              className={`flex items-center justify-between px-5 py-4 hover:bg-xxm-green-50/40 transition-colors ${
                i < recentContributions.length - 1 ? 'border-b border-xxm-gray-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
                  <Wallet size={15} className="text-xxm-green" aria-hidden />
                </div>
                <div>
                  <p className="text-sm font-semibold text-xxm-green-900">
                    {new Date(c.dueDate).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-[11px] text-xxm-gray-400">
                    Due {new Date(c.dueDate).toLocaleDateString('en-ZA')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-xxm-green-900 tabular-nums">
                  {formatZAR(c.amountPaid)}
                </span>
                <ContributionStatusBadge status={c.status} />
              </div>
            </div>
          ))}
          <div className="px-5 py-3 bg-xxm-gray-50 border-t border-xxm-gray-100">
            <Link
              href="/dashboard/contributions"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
            >
              View full history <ArrowRight size={12} aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </section>
  )
}
