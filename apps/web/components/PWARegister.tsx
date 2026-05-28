'use client'

import { useEffect } from 'react'

async function clearServiceWorkers() {
  if (!('serviceWorker' in navigator)) return

  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((r) => r.unregister()))

  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
  }
}

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    // Service workers break local dev (port forwarding, HMR) by serving /offline
    if (process.env.NODE_ENV !== 'production') {
      void clearServiceWorkers()
      return
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // SW registration failure is non-fatal — app works without it
    })
  }, [])

  return null
}
