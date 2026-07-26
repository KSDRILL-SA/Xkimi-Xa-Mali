import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AdminLoginForm } from '@/components/auth/AdminLoginForm'
import { XmmLogo, Reveal } from '@xxm/ui'
import { ShieldCheck, Lock, Users, BarChart3 } from 'lucide-react'

export const metadata: Metadata = { title: 'Login — XXM Admin' }

const features = [
  { icon: Users,    text: 'Manage all member accounts' },
  { icon: BarChart3, text: 'View financial reports' },
  { icon: ShieldCheck, text: 'Full audit trail' },
]

export default function AdminLoginPage() {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">

      {/* ── Left panel (branding) ─────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 text-white">
        <div className="noise-overlay" aria-hidden />

        {/* Decorative drifting orbs */}
        <div
          className="absolute -z-0 w-96 h-96 rounded-full blur-3xl opacity-20 animate-orb-drift-1"
          style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)', top: '-8rem', right: '-8rem' }}
          aria-hidden
        />
        <div
          className="absolute -z-0 w-80 h-80 rounded-full blur-3xl opacity-15 animate-orb-drift-2"
          style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)', bottom: '-6rem', left: '-6rem' }}
          aria-hidden
        />

        <div className="relative flex items-center gap-3 animate-fade-in-down">
          <XmmLogo variant="light" size={36} />
          <span className="font-bold text-lg tracking-tight">Xkimm Xa Mali Foundation</span>
        </div>

        <div className="relative space-y-8">
          <Reveal variant="left">
            <p className="text-xxm-gold text-xs font-bold tracking-widest uppercase mb-3">Admin Portal</p>
            <h1 className="font-display text-4xl font-extrabold tracking-tight leading-tight">
              Manage your<br />
              <span className="text-xxm-gold">collective platform</span>
            </h1>
            <p className="text-green-200/80 mt-4 text-sm leading-relaxed max-w-xs">
              A secure portal for authorised administrators to manage members, contributions, and the financial collective.
            </p>
          </Reveal>

          <Reveal variant="left" delay={100} className="space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="group flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
                  <Icon size={14} className="text-xxm-gold" aria-hidden />
                </div>
                <span className="text-sm text-green-100">{text}</span>
              </div>
            ))}
          </Reveal>
        </div>

        <p className="relative text-[11px] text-green-200/40 animate-fade-in delay-300">
          © {new Date().getFullYear()} Xkimm Xa Mali Foundation. Restricted access only.
        </p>
      </div>

      {/* ── Right panel (form) ───────────────────────────── */}
      <div className="flex items-center justify-center p-6 bg-xxm-champagne">
        <div className="w-full max-w-sm space-y-8">

          {/* Mobile logo */}
          <div className="flex flex-col items-center text-center lg:hidden animate-fade-in-down">
            <div className="w-14 h-14 rounded-2xl bg-xxm-green flex items-center justify-center mb-4">
              <XmmLogo variant="light" size={32} />
            </div>
            <h1 className="font-display text-xl font-extrabold text-xxm-green-900">Admin Portal</h1>
            <p className="text-sm text-xxm-gray-500 mt-1">Restricted to authorised administrators</p>
          </div>

          <div className="hidden lg:block animate-fade-in-down">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-xxm-green flex items-center justify-center">
                <Lock size={13} className="text-white" aria-hidden />
              </div>
              <p className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">Secure Sign In</p>
            </div>
            <h2 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Welcome back</h2>
            <p className="text-sm text-xxm-gray-500 mt-1">Sign in to your administrator account</p>
          </div>

          <div className="animate-scale-in">
            <Suspense>
              <AdminLoginForm />
            </Suspense>
          </div>

          <p className="text-center text-[11px] text-xxm-gray-400 animate-fade-in delay-300">
            Not an administrator?{' '}
            <a
              // A live build cannot get here without the variable — lib/env
              // requires it — so this fallback only ever applies in development.
              href={process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}
              className="text-xxm-green font-semibold hover:underline"
            >
              Go to member portal
            </a>
          </p>

        </div>
      </div>

    </div>
  )
}
