import { XmmLogo } from '@/components/ui/XmmLogo'
import { env } from '@/lib/env'

/**
 * The white card the auth pages sit in, with the brand mark above it.
 *
 * This used to live in the auth layout, which meant every page under it — sign
 * in, register, forgot, reset, invite, verify — was the same narrow card and
 * could not be anything else. Sign in is the front door and deserved its own
 * shape, so the card moved out here and each page opts into it.
 *
 * Everything except sign in still uses it, and looks exactly as it did.
 */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <>
        {/* Brand mark — this app has no marketing homepage of its own (its `/`
            just redirects to `/login` when signed out), so "home" for a
            logged-out visitor is the actual public site. */}
        <a
          href={env.NEXT_PUBLIC_SITE_URL}
          className="mb-8 flex flex-col items-center gap-3 group outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-2xl p-2 -m-2 animate-fade-in-down"
          aria-label="Xkimi Xa Mali Foundation home"
        >
          <div className="group-hover:scale-105 transition-transform duration-slow ease-bounce">
            <XmmLogo size={64} />
          </div>
          <span className="font-display text-white font-extrabold text-2xl tracking-wide drop-shadow-sm">
            Xkimi Xa Mali Foundation
          </span>
          <span className="text-white/50 text-xs italic tracking-wide">
            &ldquo;Blessed is the hand that giveth.&rdquo;
          </span>
        </a>

    <div className="relative w-full max-w-md animate-scale-in">
      <div className="absolute -top-px left-6 right-6 h-px bg-gold-shimmer opacity-70" aria-hidden />
      <div className="bg-white rounded-2xl shadow-glass ring-1 ring-black/5 p-8">
        {children}
      </div>
    </div>
    </>
  )
}
