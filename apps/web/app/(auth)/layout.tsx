import type { Metadata } from 'next'
import Link from 'next/link'

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
        {/* Each page brings its own card.
            This used to be one narrow white box wrapped around every auth page,
            which meant sign in — the front door, and the page most people see
            most often — could never be anything other than the same shape as
            the password-reset form. */}
        {children}

        <div className="mt-6 flex items-center gap-4 text-white/35 text-xs animate-fade-in delay-300">
          <span>&copy; {new Date().getFullYear()} Xkimi Xa Mali Foundation</span>
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
