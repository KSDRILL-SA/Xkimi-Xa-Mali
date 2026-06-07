'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

// Self-contained top progress bar — deliberately depends on nothing but React
// and next/navigation. The member app's client bundle is heavy enough that a
// lazily-resolved / externally-packaged first client component (nextjs-toploader
// via next/dynamic) was losing the webpack-dev client-reference resolution race,
// crashing hydration with "Cannot read properties of undefined (reading 'call')"
// at the root layout. Keeping this trivial and statically bundled removes that
// failure surface entirely.

const COLOR = '#D4AF37'
const HEIGHT = 3

export function TopLoader() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0) // 0 = idle/hidden
  const [fading, setFading] = useState(false)
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null)
  const finish = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (trickle.current) { clearInterval(trickle.current); trickle.current = null }
    if (finish.current) { clearTimeout(finish.current); finish.current = null }
    if (reset.current) { clearTimeout(reset.current); reset.current = null }
  }

  const start = () => {
    clearTimers()
    setFading(false)
    setProgress(8)
    trickle.current = setInterval(() => {
      setProgress((p) => (p === 0 || p >= 90 ? p : p + (90 - p) * 0.1))
    }, 200)
  }

  const done = () => {
    clearTimers()
    setProgress(100)
    finish.current = setTimeout(() => {
      setFading(true)
      reset.current = setTimeout(() => {
        setProgress(0)
        setFading(false)
      }, 300)
    }, 150)
  }

  // Detect navigation starts: internal link clicks + browser back/forward.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest?.('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      const target = anchor.getAttribute('target')
      if (!href || href.startsWith('#') || (target && target !== '_self')) return
      try {
        const url = new URL(href, window.location.href)
        if (url.origin !== window.location.origin) return
        if (url.pathname === window.location.pathname && url.search === window.location.search) return
      } catch {
        return
      }
      start()
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', start)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', start)
    }
  }, [])

  // The route actually changed — complete the bar.
  useEffect(() => {
    done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Tidy up on unmount.
  useEffect(() => clearTimers, [])

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: HEIGHT,
        width: `${progress}%`,
        backgroundColor: COLOR,
        boxShadow: `0 0 8px ${COLOR}, 0 0 4px ${COLOR}`,
        opacity: fading || progress === 0 ? 0 : 1,
        transition: 'width 200ms ease, opacity 300ms ease',
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    />
  )
}
