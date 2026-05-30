'use client'

import { useEffect } from 'react'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { Button } from '@/components/ui/Button'
import { RefreshCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-xxm-champagne px-4 text-center">
      <Link href="/dashboard" aria-label="Go to dashboard">
        <XmmLogo size={56} className="mb-6 hover:scale-105 transition-transform" />
      </Link>

      <div className="relative mb-2">
        <span
          className="text-[9rem] font-black leading-none select-none"
          style={{ color: 'rgba(27,67,50,0.07)' }}
          aria-hidden
        >
          500
        </span>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-2xl font-bold text-xxm-green-900">Something went wrong</p>
        </div>
      </div>

      <p className="text-gray-400 text-sm max-w-xs mt-2 mb-8 leading-relaxed">
        An unexpected error occurred. Please try again or return to the dashboard.
      </p>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={reset}>
          <RefreshCw size={15} aria-hidden />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <Home size={15} aria-hidden />
            Dashboard
          </Link>
        </Button>
      </div>
    </div>
  )
}
