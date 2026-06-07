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
  gradient?: string
  iconBg?: string
  iconColor?: string
  border?: string
}

export function AnimatedStatCard({
  icon: Icon,
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  gradient = 'from-xxm-green-50 to-white',
  iconBg = 'bg-xxm-green/10',
  iconColor = 'text-xxm-green',
  border = 'border-xxm-green/15',
}: AnimatedStatCardProps) {
  const count   = useCountUp(Math.round(value * Math.pow(10, decimals)), 900)
  const display = decimals > 0
    ? (count / Math.pow(10, decimals)).toFixed(decimals)
    : count.toLocaleString('en-ZA')

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-b ${gradient} rounded-2xl border ${border} shadow-xxm-sm p-5 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-200`}
    >
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-4`}>
        <Icon size={18} className={iconColor} aria-hidden />
      </div>
      <p className="text-2xl font-extrabold text-xxm-green-900 tabular-nums leading-none">
        {prefix}{display}{suffix}
      </p>
      <p className="text-xs font-semibold text-xxm-gray-600 mt-1.5">{label}</p>
    </div>
  )
}
