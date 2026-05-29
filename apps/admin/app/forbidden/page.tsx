import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldOff } from 'lucide-react'

export const metadata: Metadata = { title: '403 — Access Denied' }

export default function ForbiddenPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-xxm-champagne p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 mx-auto xxm-icon-bg-danger">
          <ShieldOff size={28} />
        </div>
        <h1 className="text-2xl font-bold text-xxm-green-900">Access Denied</h1>
        <p className="text-sm text-xxm-gray-500">
          This portal is restricted to XXM administrators. Your account does not have the required permissions.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors"
        >
          Back to Login
        </Link>
      </div>
    </div>
  )
}
