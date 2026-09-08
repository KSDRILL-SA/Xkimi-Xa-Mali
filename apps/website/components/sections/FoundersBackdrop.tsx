'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * The hero's photographic backdrop.
 *
 * ── Mobile gets the photo now too — with a much heavier scrim ────────────
 *
 * An earlier version of this component put a founder's own portrait card
 * directly behind the mobile hero text, and the stat pills ended up sitting
 * on top of that card's own printed name three separate times. That bug
 * doesn't apply to this photograph: it has no baked-in text, logo, or UI of
 * its own for anything to land on top of — the only risk here is ordinary
 * contrast/legibility, not a second layer of information getting obscured.
 *
 * Desktop can afford a scrim that's heavy on the left and nearly clear on
 * the right because the headline only ever sits on the left half. Mobile's
 * scrim is top-weighted instead: strong behind the badge and headline,
 * which genuinely need the contrast, and lighter from roughly the CTA
 * button downward — the button is solid gold and the stat pills carry
 * their own translucent panel, so neither depends on the scrim, and
 * leaving that area lighter lets the actual photograph show through
 * rather than reading as a dark texture behind everything.
 *
 * ── Why one static photo instead of the four founders rotating ───────────
 *
 * A previous version cross-faded the four founders' own portrait cards
 * behind this same scrim, and HeroSection.tsx carried a second, mobile-only
 * grid of the same four cards further down the page — on top of the About
 * page's own founder grid, that was three separate places claiming to be
 * "the" founder presentation. Both are gone now. This backdrop is purely
 * atmospheric — a single golden-hour photograph
 * that carries the "Brotherhood" headline's mood without standing in for
 * anyone's actual likeness — and the "Meet the founders" link below points
 * at the one place that still shows their real faces and names.
 */
export function FoundersBackdrop() {
  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      {/* Two separate photos, not one crop shared across breakpoints: the
          desktop shot is landscape (a narrow phone cropping it always lost
          either the group or the skyline), so mobile gets its own
          purpose-shot portrait photo of the same scene instead — 768×1376,
          close enough to a real phone's aspect ratio that `object-cover`
          barely has to crop it at all.

          Both stay mounted with CSS `hidden`/`md:hidden` toggling which one
          paints, rather than a client-side matchMedia check that mounts
          only one: that would delay this image's fetch until after
          hydration, which costs LCP far more than the bandwidth this
          approach spends fetching the breakpoint that isn't shown. */}
      <Image
        src="/hero/brotherhood-terrace-mobile.jpg"
        alt=""
        fill
        priority
        quality={85}
        className="object-cover md:hidden"
        sizes="100vw"
      />
      <Image
        src="/hero/brotherhood-terrace.jpg"
        alt=""
        fill
        priority
        quality={85}
        className="hidden md:block object-cover object-right"
        sizes="100vw"
      />

      {/* Mobile scrim — one gradient, not two stacked layers. An earlier
          version put a flat 80%-opacity layer *underneath* a 60-90%
          gradient, and the two compounded into a uniformly dark, muddy
          wash that buried the photo rather than showing it through. This
          is deliberately top-weighted instead: strong where the badge and
          headline actually need the contrast, easing off by the point the
          CTA button sits (solid gold, needs no scrim help) and staying
          moderate rather than heavy past that, since the stat pills carry
          their own `.glass` backdrop-blur panel and don't depend on this
          scrim either. The photo reads as an actual photo in its lower
          two-thirds instead of dark texture. */}
      <div className="absolute inset-0 md:hidden bg-gradient-to-b from-xxm-green-950/82 from-0% via-xxm-green-950/50 via-52% to-xxm-green-950/56" />
      {/* Quiet golden-hour glow, upper-right — echoes the photo's own sun
          rather than fighting it, and sits where the badge/headline's
          shortest lines leave the most breathing room. */}
      <div
        className="absolute inset-0 md:hidden opacity-40"
        style={{ background: 'radial-gradient(ellipse 65% 45% at 88% 8%, #D4AF37 0%, transparent 65%)' }}
      />

      {/* Desktop scrim — heavy on the left where the headline sits, let
          almost all the way up on the right so the photograph is actually
          seen — the whole point of putting it there. */}
      <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-xxm-green-950 from-25% via-xxm-green-950/70 via-55% to-xxm-green-950/5" />
      <div className="hidden md:block absolute inset-0 bg-gradient-to-b from-xxm-green-950/45 via-transparent to-xxm-green-950/75" />
    </div>
  )
}

/**
 * "Meet the founders" — the hero's own link to the real faces behind the
 * brotherhood, now that the backdrop above is a photograph rather than the
 * founders' own portraits. Renders on every breakpoint: mobile used to
 * carry a small grid of the founders' actual portrait cards instead, but
 * that duplicated the About page's own founder grid (the real bios live
 * there, not in the hero) and would have competed with this same photo for
 * attention. This link is the one thing that survived that trim — sized
 * and positioned the same on mobile and desktop rather than getting a
 * separate mobile treatment, since there's no longer a grid layout to
 * differ from.
 */
export function FoundersLink() {
  return (
    <Link
      href="/about#founders"
      className="inline-flex absolute bottom-8 right-4 sm:right-10 z-10 items-center gap-1.5 glass rounded-full px-4 py-2 text-xs font-semibold tracking-wide text-white/80 transition-colors hover:text-xxm-gold"
    >
      Meet the founders
      <ArrowRight size={12} aria-hidden />
    </Link>
  )
}
