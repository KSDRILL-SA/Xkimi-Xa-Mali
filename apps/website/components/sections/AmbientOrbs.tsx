'use client'

import { useEffect, useRef } from 'react'

/**
 * The hero's three ambient gradient orbs, now drifting a few pixels toward
 * wherever the pointer is — a restrained depth cue a handful of premium
 * product sites use instead of a flat background, layered on top of each
 * orb's own autonomous drift rather than replacing it.
 *
 * ── Pointer-only, by construction, not by a media query alone ───────────────
 *
 * `(pointer: fine)` is checked before the listener is ever attached, so a
 * touchscreen — which cannot fire `mousemove` in a way that means anything —
 * never pays for one. `prefers-reduced-motion` is checked the same way and
 * turns this off outright, on top of the global rule in globals.css that
 * already flattens every keyframe animation's duration to near-zero for that
 * preference.
 *
 * ── Why position and the parallax transform live on different elements ──────
 *
 * Each orb needs three things: a fixed place in the hero (`top-1/4
 * right-1/4`, …), its own autonomous drift (`animate-orb-drift-*`, a
 * `transform`-based keyframe), and now this pointer offset (also a
 * `transform`). All three cannot live on one property of one element.
 *
 * Splitting position from motion isn't just for that — any element carrying
 * a non-`none` `transform` becomes the containing block for `position:
 * fixed`/`absolute` descendants, *regardless of its own `position` value*
 * (the same trap `Reveal.tsx` documents and was built to avoid). Putting the
 * parallax transform directly on an absolutely-positioned orb, with the
 * drift animation on the same element, would fight over one `transform`
 * property outright: a running CSS animation overrides an inline style on
 * the property it animates, so the parallax offset would simply have no
 * visible effect. So each orb is an absolutely-positioned wrapper (parallax
 * transform, no drift) around a plain, unpositioned inner div (drift
 * animation, no parallax) — two elements, two transforms, nothing to fight.
 *
 * ── Why a CSS variable instead of `useState` ─────────────────────────────────
 *
 * A rapid `mousemove` re-rendering this component on every event would cost
 * a great deal for a purely decorative background layer. Writing straight
 * to a CSS custom property via `element.style.setProperty`, throttled to one
 * write per animation frame, moves nothing through React and touches only
 * `transform` — compositor-cheap, and the same discipline the mobile
 * tearing fixes elsewhere in this app depend on.
 */
export function AmbientOrbs() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    let x = 0
    let y = 0

    const onMove = (e: MouseEvent) => {
      // -1..1 from the viewport centre, so the offset scales with whatever
      // size the window actually is rather than assuming a fixed hero height.
      x = (e.clientX / window.innerWidth - 0.5) * 2
      y = (e.clientY / window.innerHeight - 0.5) * 2
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        container.style.setProperty('--px', x.toFixed(3))
        container.style.setProperty('--py', y.toFixed(3))
      })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={ref}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ '--px': 0, '--py': 0 } as React.CSSProperties}
    >
      {/* Nearest layer: moves most. */}
      <div
        className="absolute top-1/4 right-1/4 w-[600px] h-[600px] pointer-events-none"
        style={{ transform: 'translate3d(calc(var(--px, 0) * 18px), calc(var(--py, 0) * 18px), 0)' }}
      >
        <div
          className="w-full h-full rounded-full opacity-10 animate-orb-drift-1"
          style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
          aria-hidden
        />
      </div>

      <div
        className="absolute bottom-1/3 left-1/5 w-[400px] h-[400px] pointer-events-none"
        style={{ transform: 'translate3d(calc(var(--px, 0) * -10px), calc(var(--py, 0) * -10px), 0)' }}
      >
        <div
          className="w-full h-full rounded-full opacity-8 animate-orb-drift-2"
          style={{ background: 'radial-gradient(circle, #2C5F47 0%, transparent 70%)' }}
          aria-hidden
        />
      </div>

      {/* Furthest layer: moves least. Centring (`-50%/-50%`) and the
          parallax offset are both `transform`, so they're combined into one
          `translate3d` rather than split across two utility classes the way
          the original markup did with `-translate-x-1/2 -translate-y-1/2` —
          a second, separate `transform` declaration on the same element
          would simply replace this one rather than compose with it. */}
      <div
        className="absolute top-1/2 left-1/2 w-[800px] h-[800px] pointer-events-none"
        style={{
          transform:
            'translate3d(calc(-50% + var(--px, 0) * 6px), calc(-50% + var(--py, 0) * 6px), 0)',
        }}
      >
        <div
          className="w-full h-full rounded-full opacity-5 animate-orb-drift-3"
          style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 60%)' }}
          aria-hidden
        />
      </div>

      {/* noise grain texture */}
      <div className="noise-overlay" aria-hidden />
    </div>
  )
}
