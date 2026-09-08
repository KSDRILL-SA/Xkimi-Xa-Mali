'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * The hero's photographic backdrop — desktop only.
 *
 * ── Why this is desktop-only ──────────────────────────────────────────────
 *
 * On desktop the photo sits to the right (`object-right`) and the headline
 * sits to the left — different halves of the screen, so the text never sits
 * *on* the photo, only ever beside it.
 *
 * On a single narrow column there is no "beside." An earlier version of this
 * component put a founder portrait behind the mobile text directly, and the
 * stat pills ended up on top of a printed name three separate times — three
 * different fixes, each patching where the pills sat rather than the
 * arrangement that made a collision possible at all. The one that actually
 * held was not putting text over a decorative background photo on a phone in
 * the first place. So mobile carries no photo at all — a plain brand
 * gradient with a quiet glow instead — and stays that way here.
 *
 * ── Why one static photo instead of the four founders rotating ───────────
 *
 * The previous version cross-faded the four founders' own portrait cards
 * behind this same scrim. That doubled up against the mobile founders grid
 * further down the page (HeroSection.tsx) and the About page's founder
 * grid — three separate places claiming to be "the" founder presentation.
 * This backdrop is now purely atmospheric — a single golden-hour photograph
 * that carries the "Brotherhood" headline's mood without standing in for
 * anyone's actual likeness — and the "Meet the founders" link below points
 * at the one place that still shows their real faces and names.
 */
export function FoundersBackdrop() {
  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      {/* Plain brand gradient — mobile's entire background, since the photo
          below never renders there. Kept simple and dark rather than
          matching the desktop scrim's lopsided treatment, which balances
          text-contrast against a photo mobile doesn't show; nothing here
          needs balancing against. */}
      <div className="absolute inset-0 md:hidden bg-gradient-to-b from-xxm-green-950 via-xxm-green-900 to-xxm-green-950" />
      {/* Quiet golden-hour glow, upper-right — mobile's headline and stat
          pills sit in the upper-left two-thirds, so the warmth lives where
          nothing needs to stay legible against it. */}
      <div
        className="absolute inset-0 md:hidden opacity-60"
        style={{ background: 'radial-gradient(ellipse 65% 45% at 88% 8%, #D4AF37 0%, transparent 65%)' }}
      />

      {/* Everything below is desktop-only: the photograph and its scrims. */}
      <div className="hidden md:block absolute inset-0">
        <Image
          src="/hero/brotherhood-terrace.jpg"
          alt=""
          fill
          priority
          quality={85}
          className="object-cover object-right"
          sizes="100vw"
        />

        {/* Readability scrim. Heavy on the left where the headline sits, let
            almost all the way up on the right so the photograph is actually
            seen — the whole point of putting it there. */}
        <div className="absolute inset-0 bg-gradient-to-r from-xxm-green-950 from-25% via-xxm-green-950/70 via-55% to-xxm-green-950/5" />
        <div className="absolute inset-0 bg-gradient-to-b from-xxm-green-950/45 via-transparent to-xxm-green-950/75" />
      </div>
    </div>
  )
}

/**
 * "Meet the founders" — desktop's own link to the real faces behind the
 * brotherhood, now that the backdrop above is a photograph rather than the
 * founders' own portraits. Sits where the old rotation dots used to,
 * `pointer-events-auto` because its parent tree is `aria-hidden`/decorative
 * up to the hero section, not because this link itself is decorative.
 */
export function FoundersLinkDesktop() {
  return (
    <Link
      href="/about#founders"
      className="hidden md:inline-flex absolute bottom-8 right-10 z-10 items-center gap-1.5 glass rounded-full px-4 py-2 text-xs font-semibold tracking-wide text-white/80 transition-colors hover:text-xxm-gold"
    >
      Meet the founders
      <ArrowRight size={12} aria-hidden />
    </Link>
  )
}
