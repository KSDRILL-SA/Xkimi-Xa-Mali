import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'

export const metadata: Metadata = { title: 'Auth' }

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="auth-bg fixed inset-0 -z-20" />
      <div className="noise-overlay -z-20" aria-hidden />

      {/* Decorative drifting orbs */}
      <div
        className="fixed -z-10 w-96 h-96 rounded-full blur-3xl opacity-20 animate-orb-drift-1"
        style={{
          background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
          top: '-8rem',
          right: '-8rem',
        }}
        aria-hidden
      />
      <div
        className="fixed -z-10 w-80 h-80 rounded-full blur-3xl opacity-15 animate-orb-drift-2"
        style={{
          background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
          bottom: '-6rem',
          left: '-6rem',
        }}
        aria-hidden
      />
      <div
        className="fixed -z-10 w-64 h-64 rounded-full blur-3xl opacity-10 animate-orb-drift-3"
        style={{
          background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)',
          top: '40%',
          left: '50%',
        }}
        aria-hidden
      />

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Brand mark */}
        <Link
          href="/"
          className="mb-8 flex flex-col items-center gap-3 group outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-2xl p-2 -m-2 animate-fade-in-down"
          aria-label="Xkimm Xa Mali home"
        >
          <div className="group-hover:scale-105 transition-transform duration-slow ease-bounce">
            <XmmLogo size={64} />
          </div>
          <span className="font-display text-white font-extrabold text-2xl tracking-wide drop-shadow-sm">
            Xkimm Xa Mali
          </span>
          <span className="text-white/50 text-xs italic tracking-wide">
            &ldquo;Blessed is the hand that giveth.&rdquo;
          </span>
        </Link>

        {/* Card */}
        <div className="relative w-full max-w-md animate-scale-in">
          <div className="absolute -top-px left-6 right-6 h-px bg-gold-shimmer opacity-70" aria-hidden />
          <div className="bg-white rounded-2xl shadow-glass ring-1 ring-black/5 p-8">
            {children}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4 text-white/35 text-xs animate-fade-in delay-300">
          <span>&copy; {new Date().getFullYear()} Xkimm Xa Mali</span>
          <Link
            href="/about"
            className="gold-underline hover:text-white/60 transition-colors"
          >
            About
          </Link>
        </div>
      </div>
    </div>
  )
}
