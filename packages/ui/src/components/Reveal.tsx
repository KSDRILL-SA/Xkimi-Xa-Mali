'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@xxm/utils'

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The decision below has to be made *before* the browser paints, or a device
 * that skips the animation would still show one frame of `opacity: 0` — a
 * blink on every page load, which is worse than the animation it replaces.
 * React warns when `useLayoutEffect` runs during SSR, hence the swap.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Whether this device should skip the reveal animation and render the final
 * state immediately.
 *
 * ── Why touch devices get no animation at all ───────────────────────────────
 *
 * ── Corrected 2026-09-04: the guard alone was not enough ───────────────────
 *
 * Everything below was right about the cause and wrong about the cure. A
 * layout effect cannot run before hydration, and the server-rendered HTML
 * already carries the bare `reveal` class — `opacity: 0` **and**
 * `transform: translateY(28px)`. The browser paints that first, creating the
 * very layer this was meant to prevent, and hydration then destroys it.
 *
 * `RevealGuard` now settles it in the document head, before any paint, and the
 * stylesheet neutralises the base classes under `.no-reveal`. This function
 * reads that decision rather than making a second one.
 *
 * Phones showed torn, doubled, "scratched" cards on the contributions page:
 * whole bands of the page painted at a stale scroll offset, on top of the
 * correct content, getting worse the further you scrolled. Screenshots showed
 * one card drawn twice about 100px apart, and a section drawn both ghosted and
 * solid at once.
 *
 * That is a compositor-invalidation failure, and this component causes it. A
 * transform transition promotes the element to its own GPU layer for the
 * duration of the animation. `reveal-done` then sets `transform: none`, which
 * destroys that layer — and on Android Chrome the region the layer occupied is
 * not reliably repainted, so its last frame stays on screen. Four `Reveal`s
 * with staggered delays tear down four layers at four different moments, which
 * is why the artifacts appeared in bands and at different offsets, and why
 * they accumulated while scrolling rather than settling.
 *
 * `reveal-done` cannot simply be dropped — it exists because a lingering
 * transform makes the element a containing block for `position: fixed`
 * descendants and a stacking context, which broke dropdowns and modals. Both
 * that fix and this one are necessary; the only way to have neither problem is
 * for the transform never to exist on the devices where the teardown misbehaves.
 *
 * So the animation is desktop-only, and the test is `maxTouchPoints` rather
 * than a `hover`/`pointer` media query. Chrome's "Desktop site" mode reports
 * `hover: hover` and `pointer: fine` while still being the same phone and the
 * same GPU — and the tearing was reported on the dashboard in exactly that
 * mode. `maxTouchPoints` still reports the truth there.
 *
 * Nothing about layout, spacing or appearance changes: the element lands in
 * the identical final state, just without travelling to it.
 */
function shouldSkipReveal(): boolean {
  if (typeof window === 'undefined') return false

  // The decision was already made, before the first paint, by `RevealGuard` in
  // the document head. Reading it back rather than asking again is the point:
  // this code cannot run until React has hydrated, and by then the
  // server-rendered `reveal` class has already applied its transform and had a
  // GPU layer created for it. Two answers to one question is how the guard came
  // to be correct and ineffective at the same time.
  if (document.documentElement.classList.contains('no-reveal')) return true

  // Fallbacks, for a host that has not mounted the guard. Late is better than
  // never, and the stylesheet has nothing to neutralise in that case.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true
  return (navigator.maxTouchPoints ?? 0) > 0
}

type RevealVariant = 'up' | 'left' | 'right' | 'scale'

interface RevealProps {
  children: React.ReactNode
  variant?: RevealVariant
  /** Delay in milliseconds before the reveal transition starts. */
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'article' | 'span'
}

const variantClass: Record<RevealVariant, string> = {
  up: 'reveal',
  left: 'reveal-left',
  right: 'reveal-right',
  scale: 'reveal-scale',
}

/** Longest reveal transition in the stylesheet, plus room for the delay. */
const TRANSITION_MS = 700

/**
 * Self-observing scroll-reveal wrapper for a single element.
 *
 * ── The transform is removed when the animation finishes ────────────────────
 *
 * This matters far more than it looks. A non-`none` transform creates a
 * stacking context and becomes the containing block for `position: fixed`
 * descendants, and both last as long as the transform does. The finished state
 * used to keep `translateY(0)`: a transform that moves nothing and changes
 * everything.
 *
 * Because this component wraps nearly every section of both apps, every
 * revealed section became a box its children could not paint out of. A dropdown
 * opened inside one section could not rise above the section beneath it at any
 * z-index, and anything `fixed` anchored to the card rather than the viewport.
 * The symptom was menus and panels vanishing behind neighbouring content the
 * moment they opened.
 *
 * `reveal-done` sets `transform: none`, and is applied only after the
 * transition has ended — writing `none` into the animated state instead would
 * make the element jump, because a transition to `none` does not animate.
 *
 * `transitionend` is the signal, with a timer as backstop: the event does not
 * fire when the element is off-screen with the animation optimised away, when
 * the tab is hidden, or under `prefers-reduced-motion`, where the stylesheet
 * removes the transition entirely. Being late to drop the transform is
 * survivable; never dropping it is the bug this exists to prevent.
 */
export function Reveal({ children, variant = 'up', delay = 0, className, as = 'div' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [done, setDone] = useState(false)

  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // Straight to the finished state: `revealed` supplies the final opacity,
    // `reveal-done` supplies `transform: none; transition: none`. No transform
    // is ever applied, so no layer is created and none has to be torn down.
    if (shouldSkipReveal()) {
      setVisible(true)
      setDone(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || done) return
    const el = ref.current
    if (!el) return

    // Only the element's own transform transition ends the reveal. Without the
    // target check, a transition on any descendant — a button's hover, a
    // progress bar filling — would report the reveal finished early.
    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'transform') setDone(true)
    }
    el.addEventListener('transitionend', onEnd)
    const timer = setTimeout(() => setDone(true), delay + TRANSITION_MS + 100)

    return () => {
      el.removeEventListener('transitionend', onEnd)
      clearTimeout(timer)
    }
  }, [visible, done, delay])

  const Tag = as as 'div'

  return (
    <Tag
      ref={ref}
      className={cn(variantClass[variant], visible && 'revealed', done && 'reveal-done', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
