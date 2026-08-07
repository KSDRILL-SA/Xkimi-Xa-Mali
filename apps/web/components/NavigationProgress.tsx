'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window {
    navProgress?: { start: () => void; done: () => void }
  }
}

export function NavigationProgress() {
  const pathname  = usePathname()
  const isFirst   = useRef(true)

  useEffect(() => {
    // Skip the initial mount — no navigation happened yet
    if (isFirst.current) { isFirst.current = false; return }
    window.navProgress?.done()
  }, [pathname])

  return null
}
