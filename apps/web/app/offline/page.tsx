'use client'

import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { Button } from '@/components/ui/Button'
import { WifiOff, RefreshCw } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-xxm-champagne px-4 text-center">
      <XmmLogo size={52} className="mb-6" />

      <div className="rounded-2xl bg-white border border-gray-100 p-8 mb-6 shadow-xxm max-w-sm w-full">
        <WifiOff size={40} className="text-gray-300 mx-auto mb-4" aria-hidden />
        <p className="font-bold text-xxm-green-900 text-lg">You&rsquo;re offline</p>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          Check your connection and try again. Your data will sync automatically when you&rsquo;re
          back online.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <Button variant="primary" onClick={() => window.location.reload()}>
          <RefreshCw size={15} aria-hidden />
          Try again
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/about">Go to homepage</Link>
        </Button>
      </div>

      <p className="mt-10 text-xs text-gray-400 italic">
        &ldquo;Blessed is the hand that giveth.&rdquo; — Acts 20:35
      </p>
    </div>
  )
}
