'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import type { LucideIcon } from 'lucide-react'

interface AnimatedStatCardProps {
  icon: LucideIcon
  label: string
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
}

export function AnimatedStatCard({ icon: Icon, label, value, prefix = '', suffix = '', decimals = 0 }: AnimatedStatCardProps) {
  const count = useCountUp(Math.round(value * Math.pow(10, decimals)), 900)
  const display = decimals > 0
    ? (count / Math.pow(10, decimals)).toFixed(decimals)
    : count.toLocaleString('en-ZA')

  return (
    <div className="xxm-card card-hover p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-xxm-champagne-200 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-xxm-green" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-xxm-gray-400 font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-bold text-xxm-green-900 mt-0.5 tabular-nums">
          {prefix}{display}{suffix}
        </p>
      </div>
    </div>
  )
}
