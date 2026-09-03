'use client'

import { useEffect, useLayoutEffect, useState, useRef } from 'react'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Count a number up to its target, on the devices that should animate.
 *
 * ── Why it starts at the target, not at zero ────────────────────────────────
 *
 * It used to be `useState(0)`, which meant the server-rendered HTML carried
 * **zero** for every figure. A member opening their contributions page was
 * shown "R 0,00 total contributed" until React hydrated and 900ms of animation
 * had run. On a fast connection that is a flicker; on a phone it is long enough
 * to read, and what it says is wrong about their money.
 *
 * Starting at the target makes the first paint correct. The animation is then
 * an enhancement that runs backwards from it — the desktop path drops to zero
 * in a layout effect, before the browser paints, so nothing flashes.
 *
 * ── Why touch devices get no animation ──────────────────────────────────────
 *
 * Each call runs a `requestAnimationFrame` loop that calls `setState` on every
 * frame. The contributions page mounts four of them at once, and each re-render
 * repaints a card carrying a gradient fill, a coloured border and a shadow —
 * four continuously recomposited boxes for the better part of a second.
 *
 * Those are the two pages that tore on Android: contributions and the
 * dashboard. The transactions page, which has never torn, does not use this
 * hook at all. That correlation is the reason for the guard.
 *
 * The decision is read from the `no-reveal` class that `RevealGuard` sets in
 * the document head before first paint, so the whole app answers "does this
 * device animate" the same way, once, rather than each component asking again
 * with its own slightly different test.
 */
function shouldAnimate(): boolean {
  if (typeof window === 'undefined') return false
  if (document.documentElement.classList.contains('no-reveal')) return false
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
  return (navigator.maxTouchPoints ?? 0) === 0
}

export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(target)
  const rafRef = useRef<number | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (!shouldAnimate()) {
      // Nothing to do: the value is already correct and no frame loop starts.
      setValue(target)
      return
    }

    // Before the paint, so the drop to zero is never visible.
    setValue(0)

    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      setValue(Math.round(eased * target))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
      // Land exactly on the target rather than on the last eased value.
      else setValue(target)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return value
}
