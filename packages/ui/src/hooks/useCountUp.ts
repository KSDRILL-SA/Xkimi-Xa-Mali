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
 * This hook was, for a while, the prime suspect in the tearing on Android: the
 * only two pages that ever tore — contributions and the dashboard — are
 * exactly the two that call it, and switching it off on touch devices did stop
 * the tearing. The conclusion drawn was "a phone cannot afford four rAF loops",
 * which was wrong, and it cost the owner an animation they wanted.
 *
 * The loops were never the problem by themselves. `<main>` in both app shells
 * carried `animate-fade-in-up`, a 400ms **translateY**, so every page began
 * life inside a moving compositing layer — and a subtree that rewrites itself
 * sixty times a second inside a moving layer leaves its old frames stranded,
 * because Blink never invalidates the tiles it already rasterised. Disabling
 * the count-up removed one half of a collision and so looked like a fix.
 *
 * The shells now fade with opacity alone, which removes the other half — the
 * actual cause. The animation runs everywhere again.
 *
 * If tearing ever returns: look for a transform animation or transition on an
 * ancestor of whatever is repainting, not at the repaint itself.
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
