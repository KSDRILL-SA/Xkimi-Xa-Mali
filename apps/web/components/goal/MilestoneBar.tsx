'use client'

import { useEffect, useState } from 'react'

type MilestoneBarProps = {
  value: number               // 0–100
  fromClass: string           // tailwind from-* gradient stop
  toClass: string             // tailwind to-* gradient stop
  milestones?: number[]
  height?: string
  shimmer?: boolean
  className?: string
}

/**
 * Progress bar that animates its width on mount, with milestone tick marks and
 * an optional moving sheen — gives goals a sense of momentum.
 */
export function MilestoneBar({
  value,
  fromClass,
  toClass,
  milestones = [25, 50, 75],
  height = 'h-2.5',
  shimmer = true,
  className,
}: MilestoneBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setWidth(clamped); return }
    const id = requestAnimationFrame(() => setWidth(clamped))
    return () => cancelAnimationFrame(id)
  }, [clamped])

  return (
    <div className={`relative ${height} w-full rounded-full bg-xxm-gray-100 overflow-hidden ${className ?? ''}`}>
      <div
        className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${fromClass} ${toClass}`}
        style={{ width: `${width}%`, transition: 'width 1.15s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        {shimmer && clamped > 0 && clamped < 100 && (
          <div
            className="absolute inset-0 animate-shimmer"
            style={{
              backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
            }}
            aria-hidden
          />
        )}
      </div>
      {milestones.map((m) => (
        <span
          key={m}
          className="absolute top-1/2 -translate-y-1/2 w-px h-full bg-white/60"
          style={{ left: `${m}%` }}
          aria-hidden
        />
      ))}
    </div>
  )
}
