import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Users, ShieldCheck, FileText } from 'lucide-react'
import { MAX_MEMBERS, FACTS } from '@xxm/utils'
import { LoginForm } from '@/components/auth/LoginForm'
import { SkeletonForm } from '@/components/ui/Skeleton'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { env } from '@/lib/env'

export const metadata: Metadata = { title: 'Sign in' }

/**
 * The front door.
 *
 * Every auth page used to be the same narrow white card, so signing in — the
 * page a member sees more often than any other — looked identical to resetting
 * a password. The admin console had a considered front door and the member app
 * did not.
 *
 * This is the member's own, not a copy of that one. The admin panel sells
 * control: manage accounts, view reports, full audit trail. A member is not
 * managing anything. What is true for them is that they are one of a small
 * number of people, that their money is theirs to check, and that the whole
 * arrangement rests on a promise — so that is what the left-hand side says.
 */
const PROMISES = [
  {
    icon: Users,
    title: `One of ${MAX_MEMBERS}`,
    body: 'A closed circle of people who know each other. Never advertised, never larger.',
  },
  {
    icon: FileText,
    title: 'Your record, not ours',
    body: 'Every rand you have put in, traceable to the day it moved, and yours to download.',
  },
  {
    icon: ShieldCheck,
    title: 'Money that stays where it belongs',
    body: 'Held at a bank in the Foundation’s name. It leaves only for a Goal the circle agreed.',
  },
]

export default function LoginPage() {
  return (
    <div className="w-full max-w-5xl animate-scale-in">
      <div className="grid lg:grid-cols-[1.05fr_1fr] rounded-3xl overflow-hidden shadow-glass ring-1 ring-white/10">

        {/* ── What a member is signing back in to ─────────────────────── */}
        <div className="relative hidden lg:flex flex-col justify-between bg-gradient-to-br from-xxm-green-900 via-xxm-green to-xxm-canopy p-10">
          {/* The same gold ring-work as the printed documents, so the app and
              the guide look like one organisation. */}
          <div
            className="absolute inset-0 opacity-[0.13] pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 78% 22%, transparent 0, transparent 38px, rgba(212,175,55,.55) 38px, rgba(212,175,55,.55) 39px, transparent 39px), ' +
                'radial-gradient(circle at 78% 22%, transparent 0, transparent 82px, rgba(212,175,55,.4) 82px, rgba(212,175,55,.4) 83px, transparent 83px), ' +
                'radial-gradient(circle at 78% 22%, transparent 0, transparent 132px, rgba(212,175,55,.3) 132px, rgba(212,175,55,.3) 133px, transparent 133px), ' +
                'radial-gradient(circle at 78% 22%, transparent 0, transparent 196px, rgba(212,175,55,.22) 196px, rgba(212,175,55,.22) 197px, transparent 197px)',
            }}
            aria-hidden
          />

          <div className="relative">
            {/* This app has no marketing homepage of its own — its `/` just
                redirects unauthenticated visitors back to `/login`, the page
                already showing — so "home" from here is the real public site. */}
            <a
              href={env.NEXT_PUBLIC_SITE_URL}
              className="inline-flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-xl"
              aria-label="Xkimi Xa Mali Foundation home"
            >
              <XmmLogo size={44} />
              <span className="font-display text-white font-extrabold text-lg tracking-wide leading-tight">
                Xkimi Xa Mali
                <span className="block text-[10px] font-bold tracking-[0.2em] text-xxm-gold/90 mt-0.5">
                  FOUNDATION
                </span>
              </span>
            </a>

            <h2 className="font-display text-white text-3xl xl:text-[2.1rem] font-extrabold leading-[1.15] mt-11">
              Contributing.
              <br />
              Growing.
              <span className="block text-xxm-gold">Securing.</span>
            </h2>
            <p className="text-green-100/70 text-sm leading-relaxed mt-4 max-w-sm">
              A private savings collective built by {FACTS.founderWord} brothers, for the people closest to them.
            </p>
          </div>

          <ul className="relative space-y-5 mt-10">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 w-9 h-9 rounded-xl bg-white/10 ring-1 ring-xxm-gold/25 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-xxm-gold" aria-hidden />
                </span>
                <div>
                  <p className="text-white font-bold text-sm leading-snug">{title}</p>
                  <p className="text-green-100/60 text-xs leading-relaxed mt-1">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="relative text-white/35 text-[11px] italic mt-10">
            &ldquo;Blessed is the hand that giveth.&rdquo; &mdash; Acts 20:35
          </p>
        </div>

        {/* ── Signing in ──────────────────────────────────────────────── */}
        <div className="bg-white p-8 sm:p-11 flex flex-col justify-center">
          {/* The mark, for the narrow layout where the panel beside it is gone. */}
          <a
            href={env.NEXT_PUBLIC_SITE_URL}
            className="lg:hidden mb-7 inline-flex items-center gap-2.5 self-start outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-xl"
            aria-label="Xkimi Xa Mali Foundation home"
          >
            <XmmLogo size={34} />
            <span className="font-display font-extrabold text-xxm-green-900 tracking-wide">
              Xkimi Xa Mali Foundation
            </span>
          </a>

          <div className="mb-7">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-xxm-gold-dark">
              <span className="w-4 h-px bg-xxm-gold" aria-hidden />
              MEMBER SIGN IN
            </span>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-xxm-green-900 mt-3">
              Welcome back
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">
              Sign in to see your contributions, the Goals and where the pool stands.
            </p>
          </div>

          <Suspense fallback={<SkeletonForm fields={2} />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
