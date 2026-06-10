'use client'

import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-dvh bg-xxm-green-950 flex flex-col items-center justify-center px-4 text-center gap-8">
      <XmmLogo size={56} />
      <div>
        <p className="text-xxm-gold text-xs font-bold tracking-widest uppercase mb-3">Error</p>
        <h1 className="font-display text-3xl sm:text-4xl font-black text-white mb-3">Something went wrong</h1>
        <p className="text-white/50 text-base max-w-xs mx-auto">
          An unexpected error occurred. Please try again or return to the homepage.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={reset}
          className="px-6 py-3 rounded-2xl bg-xxm-gold text-xxm-green-950 font-bold text-sm hover:bg-xxm-gold-light transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-6 py-3 rounded-2xl border border-white/20 text-white font-bold text-sm hover:bg-white/10 transition-colors"
        >
          Back to homepage
        </Link>
      </div>
    </div>
  )
}
