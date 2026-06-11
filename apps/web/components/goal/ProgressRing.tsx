'use client'

import { useEffect, useState } from 'react'
import { CountUp } from './CountUp'

type ProgressRingProps = {
  value: number               // 0–100
  size?: number
  strokeWidth?: number
  /** text-* colour class — drives the stroke via currentColor */
  colorClass?: string
  trackClass?: string
  showLabel?: boolean
  labelClass?: string
  sublabel?: string
  className?: string
}

/**
 * Animated radial progress ring. The arc grows from 0 to `value` on mount
 * (stroke-dashoffset transition) while the centre percentage counts up.
 */
export function ProgressRing({
  value,
  size = 132,
  strokeWidth = 11,
  colorClass = 'text-xxm-gold',
  trackClass = 'text-xxm-gray-100',
  showLabel = true,
  labelClass = 'text-xxm-green-900',
  sublabel,
  className,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  // Start empty, then animate to the real value once mounted.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setShown(clamped); return }
    const id = requestAnimationFrame(() => setShown(clamped))
    return () => cancelAnimationFrame(id)
  }, [clamped])

  const offset = circumference - (shown / 100) * circumference

  return (
    <div className={`relative shrink-0 ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          className={trackClass} stroke="currentColor"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
          className={colorClass} stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.15s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ fontSize: Math.round(size * 0.2) }}>
          <CountUp to={clamped} suffix="%" className={`stat-number font-extrabold leading-none ${labelClass}`} />
          {sublabel && <span className="text-[10px] font-semibold text-xxm-gray-400 uppercase tracking-wider mt-1">{sublabel}</span>}
        </div>
      )}
    </div>
  )
}
