'use client'

import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/hooks/usePrefersReducedMotion'

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
  const reduce = usePrefersReducedMotion()
  const [animated, setAnimated] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (reduce || to === 0) return

    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setAnimated(to * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [to, durationMs, reduce])

  // Derived rather than assigned from the effect: with no animation to run
  // there is nothing to store, and setting state to reach the final value cost
  // a second render every time.
  const value = reduce || to === 0 ? to : animated

  const formatted = value.toLocaleString('en-ZA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return <span className={className}>{prefix}{formatted}{suffix}</span>
}
