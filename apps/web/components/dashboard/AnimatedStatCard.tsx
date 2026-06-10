'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import type { ReactNode } from 'react'

interface AnimatedStatCardProps {
  icon: ReactNode
  label: string
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  gradient?: string
  iconBg?: string
  border?: string
}

export function AnimatedStatCard({
  icon,
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  gradient = 'from-xxm-green-50 to-white',
  iconBg = 'bg-xxm-green/10',
  border = 'border-xxm-green/15',
}: AnimatedStatCardProps) {
  const count   = useCountUp(Math.round(value * Math.pow(10, decimals)), 900)
  const display = decimals > 0
    ? (count / Math.pow(10, decimals)).toFixed(decimals)
    : count.toLocaleString('en-ZA')

  return (
    <div
      className={`group relative overflow-hidden bg-gradient-to-b ${gradient} rounded-2xl border ${border} shadow-xxm-sm p-5 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-fast ease-smooth`}
    >
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-4 transition-transform duration-slow group-hover:scale-110`}>
        {icon}
      </div>
      <p className="stat-number text-2xl font-extrabold text-xxm-green-900 leading-none">
        {prefix}{display}{suffix}
      </p>
      <p className="text-xs font-semibold text-xxm-gray-600 mt-1.5">{label}</p>
    </div>
  )
}
