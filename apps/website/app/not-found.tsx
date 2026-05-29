import Link from 'next/link'
import type { Metadata } from 'next'
import { XmmLogo } from '@/components/ui/XmmLogo'

export const metadata: Metadata = { title: 'Page Not Found' }

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-xxm-green-950 flex flex-col items-center justify-center px-4 text-center gap-8">
      <XmmLogo size={56} />
      <div>
        <p className="text-xxm-gold text-xs font-bold tracking-widest uppercase mb-3">404</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Page not found</h1>
        <p className="text-white/50 text-base max-w-xs mx-auto">
          This page doesn&rsquo;t exist. Perhaps you were looking for the member portal.
        </p>
      </div>
      <Link
        href="/"
        className="px-6 py-3 rounded-2xl bg-xxm-gold text-xxm-green-950 font-bold text-sm hover:bg-xxm-gold-light transition-colors"
      >
        Back to homepage
      </Link>
    </div>
  )
}
