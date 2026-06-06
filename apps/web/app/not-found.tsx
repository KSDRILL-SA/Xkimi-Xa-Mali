'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { Button } from '@/components/ui/Button'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  const router = useRouter()
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-xxm-champagne px-4 text-center">
      {/* Logo */}
      <Link href="/dashboard" aria-label="Go to dashboard">
        <XmmLogo size={56} className="mb-6 hover:scale-105 transition-transform" />
      </Link>

      {/* 404 */}
      <div className="relative mb-2">
        <span
          className="text-[9rem] font-black leading-none select-none"
          style={{ color: 'rgba(27,67,50,0.07)' }}
          aria-hidden
        >
          404
        </span>
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-2xl font-bold text-xxm-green-900">Page not found</p>
        </div>
      </div>

      <p className="text-gray-400 text-sm max-w-xs mt-2 mb-8 leading-relaxed">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
      </p>

      <div className="flex items-center gap-3">
        <Button variant="primary" asChild>
          <Link href="/dashboard">
            <Home size={15} aria-hidden />
            Go to Dashboard
          </Link>
        </Button>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft size={15} aria-hidden />
          Go back
        </Button>
      </div>
    </div>
  )
}
