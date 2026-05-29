'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type BarSize    = 'sm' | 'md' | 'lg'
type BarVariant = 'default' | 'gold' | 'success' | 'danger'

interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  size?: BarSize
  variant?: BarVariant
  animated?: boolean
  className?: string
}

const sizeClasses: Record<BarSize, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
}

const variantClasses: Record<BarVariant, string> = {
  default: 'bg-xxm-green',
  gold:    'bg-xxm-gold',
  success: 'bg-xxm-green-500',
  danger:  'bg-red-500',
}

const trackClasses: Record<BarVariant, string> = {
  default: 'bg-xxm-green-100',
  gold:    'bg-xxm-gold/20',
  success: 'bg-xxm-green-100',
  danger:  'bg-red-100',
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue,
  size = 'md',
  variant = 'default',
  animated,
  className,
}: ProgressBarProps) {
  const [width, setWidth] = useState(0)
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(pct))
    return () => cancelAnimationFrame(raf)
  }, [pct])

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-xs font-medium text-xxm-gray-600">{label}</span>}
          {showValue && (
            <span className="text-xs font-semibold tabular-nums text-xxm-gray-600">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        className={cn('w-full rounded-full overflow-hidden', sizeClasses[size], trackClasses[variant])}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out',
            variantClasses[variant],
            animated && pct < 100 && 'bg-[length:200%_100%] animate-shimmer',
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}
