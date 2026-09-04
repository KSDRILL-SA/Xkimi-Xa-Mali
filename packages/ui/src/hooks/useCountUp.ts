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
 * ── The count itself runs everywhere ────────────────────────────────────────
 *
 * It was briefly switched off on touch devices, on the theory that four
 * `requestAnimationFrame` loops repainting four gradient cards were what tore
 * the contributions page on Android. Screenshots taken afterwards showed the
 * tearing unchanged, and the owner wanted the animation back — so the theory
 * was wrong and the animation stays.
 *
 * What actually correlated with the ghosting was an armed
 * `transition-transform` on the icon inside each card: present on every card
 * that ghosted, absent from the one card on the page that never did. A
 * transition on `transform` makes an element a compositing candidate even at
 * rest, and the hover that would have triggered it was already `sm:`-gated
 * while the transition itself was not.
 *
 * Reduced motion is still honoured, because that is a stated preference rather
 * than a guess about hardware.
 */
function shouldAnimate(): boolean {
  if (typeof window === 'undefined') return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
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
