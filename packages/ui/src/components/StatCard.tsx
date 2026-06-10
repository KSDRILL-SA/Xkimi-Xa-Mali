'use client'

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@xxm/utils'
import { useCountUp } from '../hooks/useCountUp'

type Accent = 'green' | 'gold' | 'canopy' | 'champagne'

interface StatCardProps {
  label: string
  value: number
  /** Decimal places to preserve when animating (e.g. 2 for currency). */
  decimals?: number
  /** Formats the animated numeric value for display. Defaults to locale-grouped digits. */
  format?: (value: number) => string
  icon?: LucideIcon
  accent?: Accent
  trend?: { value: number; label?: string }
  className?: string
  /** Disable the count-up animation (e.g. for skeleton/static contexts). */
  animate?: boolean
}

const accentClasses: Record<Accent, { icon: string; ring: string }> = {
  green:     { icon: 'bg-xxm-green-100 text-xxm-green-700',   ring: 'group-hover:shadow-xxm' },
  gold:      { icon: 'bg-xxm-gold-50 text-xxm-gold-dark',     ring: 'group-hover:shadow-gold' },
  canopy:    { icon: 'bg-xxm-canopy/10 text-xxm-canopy',      ring: 'group-hover:shadow-xxm' },
  champagne: { icon: 'bg-xxm-champagne-200 text-xxm-green-800', ring: 'group-hover:shadow-xxm' },
}

const defaultFormat = (n: number) => n.toLocaleString('en-ZA')

export function StatCard({
  label,
  value,
  decimals = 0,
  format = defaultFormat,
  icon: Icon,
  accent = 'green',
  trend,
  className,
  animate = true,
}: StatCardProps) {
  const factor = 10 ** decimals
  const animated = useCountUp(Math.round(value * factor), animate ? 800 : 1)
  const display = format(animated / factor)
  const accentClass = accentClasses[accent]
  const isPositive = trend ? trend.value >= 0 : null

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-card border border-xxm-green/7 bg-white p-5',
        'shadow-xxm-sm transition-all duration-fast ease-smooth hover:-translate-y-1',
        accentClass.ring,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label uppercase text-xxm-gray-500">{label}</p>
          <p className="stat-number mt-1.5 text-h2 text-xxm-green-900">{display}</p>
        </div>
        {Icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-slow group-hover:scale-110', accentClass.icon)}>
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-1 text-caption">
          {isPositive ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-xxm-green-600" aria-hidden />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-red-600" aria-hidden />
          )}
          <span className={cn('font-semibold', isPositive ? 'text-xxm-green-600' : 'text-red-600')}>
            {Math.abs(trend.value)}%
          </span>
          {trend.label && <span className="text-xxm-gray-500">{trend.label}</span>}
        </div>
      )}
    </div>
  )
}
