'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@xxm/utils'

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

  useEffect(() => {
    const el = ref.current
    if (!el) return

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
