'use client'

import { useEffect, useRef, useState } from 'react'

type CountUpProps = {
  to: number
  durationMs?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
}

/**
 * Eases a number from 0 → `to` once, on mount, using requestAnimationFrame.
 * Respects prefers-reduced-motion (jumps straight to the final value).
 */
export function CountUp({ to, durationMs = 1100, decimals = 0, prefix = '', suffix = '', className }: CountUpProps) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || to === 0) { setValue(to); return }

    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setValue(to * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [to, durationMs])

  const formatted = value.toLocaleString('en-ZA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return <span className={className}>{prefix}{formatted}{suffix}</span>
}
