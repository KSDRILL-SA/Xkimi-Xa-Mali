'use client'

import { useCallback, useRef } from 'react'

/* Returns a callback ref — assign directly to the section's ref prop.
   React calls the callback with the element once mounted and null on unmount,
   so we never need to cast and the typing is clean. */
export function useScrollReveal(threshold = 0.12) {
  const cleanup = useRef<(() => void) | null>(null)

  return useCallback(
    (el: HTMLElement | null) => {
      cleanup.current?.()
      cleanup.current = null

      if (!el) return

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed')
              observer.unobserve(entry.target)
            }
          })
        },
        { threshold, rootMargin: '0px 0px -60px 0px' }
      )

      const targets = el.querySelectorAll<HTMLElement>(
        '.reveal, .reveal-left, .reveal-right, .reveal-scale, .step-line'
      )
      targets.forEach((t) => observer.observe(t))

      cleanup.current = () => observer.disconnect()
    },
    [threshold]
  )
}
