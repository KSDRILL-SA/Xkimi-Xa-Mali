import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AdminLoginForm } from '@/components/auth/AdminLoginForm'
import { XmmLogo, Reveal } from '@xxm/ui'
import { Lock, FileText, Scale, Landmark } from 'lucide-react'

export const metadata: Metadata = { title: 'Login' }

/**
 * The console's front door.
 *
 * What it said before was ordinary product marketing — "manage all member
 * accounts", "view financial reports", "full audit trail". True, and it could
 * have belonged to any admin panel ever built.
 *
 * What is actually true of this one is narrower and worth saying: everything
 * done here is recorded against a name, the rules that protect members bind
 * leadership identically, and money only ever leaves the pool through a Goal
 * the circle agreed. That is the Leadership Handbook's opening argument, and a
 * person signing in to exercise those powers should be reminded of it on the
 * way through the door.
 */
const RESPONSIBILITIES = [
  {
    icon: FileText,
    title: 'Everything here is recorded',
    body: 'Every action carries your name and the time. Nobody can remove an entry, including you.',
  },
  {
    icon: Scale,
    title: 'The same rules bind you',
    body: 'No exemption from the minimum, the collection or the record. You are a member first.',
  },
  {
    icon: Landmark,
    title: 'The pool has one door',
    body: 'Money leaves it for a Goal the circle agreed, and no single leader can move it.',
  },
]

export default function AdminLoginPage() {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr]">

      {/* ── What you are signing in to do ─────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-xxm-green-900 via-xxm-green to-xxm-canopy text-white">
        <div className="noise-overlay" aria-hidden />

        {/* The gold ring-work from the printed documents, so the console and
            the handbook read as one organisation. */}
        <div
          className="absolute inset-0 opacity-[0.14] pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 18%, transparent 0, transparent 46px, rgba(212,175,55,.55) 46px, rgba(212,175,55,.55) 47px, transparent 47px), ' +
              'radial-gradient(circle at 80% 18%, transparent 0, transparent 96px, rgba(212,175,55,.42) 96px, rgba(212,175,55,.42) 97px, transparent 97px), ' +
              'radial-gradient(circle at 80% 18%, transparent 0, transparent 154px, rgba(212,175,55,.32) 154px, rgba(212,175,55,.32) 155px, transparent 155px), ' +
              'radial-gradient(circle at 80% 18%, transparent 0, transparent 224px, rgba(212,175,55,.22) 224px, rgba(212,175,55,.22) 225px, transparent 225px)',
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-3 animate-fade-in-down">
          <XmmLogo variant="light" size={38} />
          <span className="font-display font-extrabold text-lg tracking-tight leading-tight">
            Xkimm Xa Mali
            <span className="block text-[10px] font-bold tracking-[0.2em] text-xxm-gold/90 mt-0.5">
              FOUNDATION
            </span>
          </span>
        </div>

        <div className="relative space-y-9">
          <Reveal variant="left">
            <p className="flex items-center gap-2 text-xxm-gold text-[11px] font-bold tracking-[0.2em] uppercase mb-4">
              <span className="w-5 h-px bg-xxm-gold" aria-hidden />
              Admin Portal
            </p>
            <h1 className="font-display text-4xl xl:text-[2.6rem] font-extrabold tracking-tight leading-[1.12]">
              You are holding
              <br />
              <span className="text-xxm-gold">other people&rsquo;s money.</span>
            </h1>
            <p className="text-green-100/70 mt-5 text-sm leading-relaxed max-w-sm">
              Not because they trust you to be careful — because nothing you do in here can be
              hidden from them.
            </p>
          </Reveal>

          <Reveal variant="left" delay={100} className="space-y-4">
            {RESPONSIBILITIES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 w-9 h-9 rounded-xl bg-white/10 ring-1 ring-xxm-gold/25 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-xxm-gold" aria-hidden />
                </span>
                <div>
                  <p className="text-white font-bold text-sm leading-snug">{title}</p>
                  <p className="text-green-100/60 text-xs leading-relaxed mt-1">{body}</p>
                </div>
              </div>
            ))}
          </Reveal>
        </div>

        <p className="relative text-[11px] text-green-200/40 animate-fade-in delay-300">
          © {new Date().getFullYear()} Xkimm Xa Mali Foundation. Restricted access only.
        </p>
      </div>

      {/* ── Signing in ────────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 bg-xxm-champagne">
        <div className="w-full max-w-sm">

          {/* Mobile mark, for when the panel beside it is gone. */}
          <div className="flex flex-col items-center text-center lg:hidden mb-8 animate-fade-in-down">
            <div className="w-14 h-14 rounded-2xl bg-xxm-green flex items-center justify-center mb-4">
              <XmmLogo variant="light" size={32} />
            </div>
            <h1 className="font-display text-xl font-extrabold text-xxm-green-900">Admin Portal</h1>
            <p className="text-sm text-xxm-gray-500 mt-1">Restricted to authorised administrators</p>
          </div>

          {/* No card wrapper here: `AdminLoginForm` renders its own, and nesting
              the two produced a white panel inside a white panel. */}
          <div className="animate-scale-in">
            <div className="hidden lg:block mb-7">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-xxm-green flex items-center justify-center">
                  <Lock size={13} className="text-white" aria-hidden />
                </div>
                <p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-[0.18em]">
                  Secure Sign In
                </p>
              </div>
              <h2 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">
                Welcome back
              </h2>
              <p className="text-sm text-xxm-gray-500 mt-1.5">Sign in to your administrator account</p>
            </div>

            <Suspense>
              <AdminLoginForm />
            </Suspense>
          </div>

          <p className="text-center text-[11px] text-xxm-gray-400 mt-6 animate-fade-in delay-300">
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
