import { getSession } from '@/lib/session'
import { getMemberInsights } from '@/services/insights.service'
import { formatZAR } from '@/lib/formatters'
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Lightbulb, type LucideIcon } from 'lucide-react'

const TONE: Record<string, { icon: LucideIcon; ring: string }> = {
  positive: { icon: CheckCircle2,  ring: 'text-xxm-green bg-xxm-green-50' },
  warning:  { icon: AlertTriangle, ring: 'text-amber-600 bg-amber-50' },
  neutral:  { icon: Lightbulb,     ring: 'text-sky-600 bg-sky-50' },
}

export async function DashboardInsights() {
  const session = await getSession()
  // Returns nothing rather than redirecting. A section renders inside a
  // SectionBoundary, and Next's redirect() works by throwing — an error
  // boundary would catch it and drop the section instead of navigating. The
  // page above this one holds the redirect; this is only the assertion removed.
  if (!session?.user?.id) return null
  const userId = session.user.id
  const roles = (session.user.roles as string[] | undefined) ?? []

  const data = await getMemberInsights(userId, userId, roles)

  // Nothing meaningful to say yet (brand-new member, no mandate, no history).
  if (data.insights.length === 0 && data.forecast.monthlyAmount === 0) return null

  return (
    <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-xxm-gold/20 to-xxm-gold/5 ring-1 ring-xxm-gold/20 flex items-center justify-center shrink-0">
          <Sparkles size={15} className="text-xxm-gold-dark" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-base font-extrabold text-xxm-green-900 leading-none">Smart insights</h2>
          <p className="text-[11px] text-xxm-gray-400 mt-1">Your financial health, at a glance</p>
        </div>
      </div>

      {data.forecast.monthlyAmount > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-xxm-green/8 to-transparent border border-xxm-green/10 p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">Projected by December</p>
            <p className="stat-number text-2xl font-black text-xxm-green-900 mt-0.5">{formatZAR(data.forecast.projectedYearEnd)}</p>
            <p className="text-[11px] text-xxm-gray-400 mt-0.5">
              {formatZAR(data.forecast.yearToDatePaid)} so far · {data.stats.onTimeRate}% on-time
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-xxm-green/10 flex items-center justify-center shrink-0">
            <TrendingUp size={20} className="text-xxm-green" aria-hidden />
          </div>
        </div>
      )}

      {data.insights.length > 0 && (
        <ul className="space-y-2.5">
          {data.insights.map((ins) => {
            const t = TONE[ins.tone] ?? TONE.neutral!
            const Icon = t.icon
            return (
              <li key={ins.code} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl ${t.ring} flex items-center justify-center shrink-0`}>
                  <Icon size={15} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-xxm-green-900 leading-snug">{ins.title}</p>
                  <p className="text-xs text-xxm-gray-500 mt-0.5 leading-relaxed">{ins.detail}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
