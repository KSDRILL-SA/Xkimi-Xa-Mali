import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'

export const metadata: Metadata = { title: 'Auth' }

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="auth-bg fixed inset-0 -z-10" />

      {/* Decorative blobs */}
      <div
        className="fixed -z-10 w-96 h-96 rounded-full blur-3xl opacity-20"
        style={{
          background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
          top: '-8rem',
          right: '-8rem',
        }}
        aria-hidden
      />
      <div
        className="fixed -z-10 w-80 h-80 rounded-full blur-3xl opacity-15"
        style={{
          background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
          bottom: '-6rem',
          left: '-6rem',
        }}
        aria-hidden
      />

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Brand mark */}
        <Link
          href="/"
          className="mb-8 flex flex-col items-center gap-3 group outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-2xl p-2 -m-2"
          aria-label="Xkimm Xa Mali home"
        >
          <div className="group-hover:scale-105 transition-transform duration-200">
            <XmmLogo size={64} />
          </div>
          <span className="text-white font-bold text-xl tracking-wide drop-shadow-sm">
            Xkimm Xa Mali
          </span>
          <span className="text-white/50 text-xs italic tracking-wide">
            &ldquo;Blessed is the hand that giveth.&rdquo;
          </span>
        </Link>

        {/* Card */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xxm-lg p-8 animate-scale-in">
          {children}
        </div>

        <p className="mt-6 text-white/35 text-xs text-center">
          &copy; {new Date().getFullYear()} Xkimm Xa Mali. Private members&rsquo; platform.
        </p>
      </div>
    </div>
  )
}
