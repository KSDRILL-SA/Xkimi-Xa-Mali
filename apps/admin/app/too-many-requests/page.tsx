import type { Metadata } from 'next'
import Link from 'next/link'
import { Timer } from 'lucide-react'

export const metadata: Metadata = { title: '429 — Too Many Requests' }

export default function TooManyRequestsPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-xxm-champagne p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 flex items-center justify-center">
          <Timer size={28} className="text-amber-600" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold text-xxm-green-900">Slow down a moment</h1>
        <p className="text-sm text-xxm-gray-500">
          That action was run too many times in a short window, so we stopped it. Nothing
          was changed. Wait a minute and try again.
        </p>
        <p className="text-xs text-xxm-gray-400">
          Bulk actions like generating contributions or broadcasting are limited more
          tightly, because running one twice is hard to undo.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
