'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { FOUNDERS } from '@/lib/founders'

/** How long each brother holds the hero before the next fades in. */
const ROTATE_MS = 7_000
/** Cross-fade duration — long enough to read as a dissolve, not a cut. */
const FADE_MS = 1_200

/**
 * The four founders, rotating behind the hero — desktop only.
 *
 * ── Why this is desktop-only now ─────────────────────────────────────────
 *
 * On desktop the portrait sits to the right (`object-right`) and the
 * headline sits to the left — different halves of the screen, so the text
 * never sits *on* a founder, only ever beside one.
 *
 * On a single narrow column there is no "beside." The mobile treatment this
 * replaces put the text directly on top of the photo instead, and the stat
 * pills ended up on top of a founder's own printed name three separate
 * times — three different fixes, each patching where the pills sat rather
 * than the arrangement that made a collision possible at all. The one that
 * actually holds is not putting text over a decorative background photo on
 * a phone in the first place.
 *
 * So mobile carries no photo at all now — a plain brand gradient instead —
 * and the founders get their own dedicated, accessible presentation in the
 * hero's own content (real photo cards with real `alt` text, in
 * HeroSection.tsx), the same treatment the About page's founder grid
 * already uses. Nothing about who they are was lost by removing the
 * backdrop; it moved to a place it can't collide with anything.
 *
 * ── What's kept, and why ─────────────────────────────────────────────────
 *
 * Each desktop portrait still renders twice: a blurred, scaled copy fills
 * the frame edge to edge so the brother's own colours bleed into the
 * background, and the sharp copy sits on top under `object-contain` so the
 * card is shown whole — the name and title are baked into the artwork, and
 * cropping to fill the frame would cut that band off. The blur also
 * absorbs the difference between a dark studio card and a light grey one,
 * which as a hard cut would flash on every rotation.
 *
 * The rotation timer itself still runs regardless of viewport — gating a
 * `setInterval` by a `matchMedia` check would be one more thing to keep in
 * sync with the CSS breakpoints below for a cost (one idle timer) not worth
 * the risk of the two disagreeing.
 */
export function FoundersBackdrop() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    // Honour a reduced-motion preference by not auto-advancing at all: the
    // rotation is decorative, and motion nobody asked for is exactly what that
    // setting exists to stop.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const id = setInterval(() => setIndex((i) => (i + 1) % FOUNDERS.length), ROTATE_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      {/* Plain brand gradient — mobile's entire background now, since the
          photo no longer renders there. Kept simple and dark rather than
          matching the desktop scrim's lopsided treatment, which was
          balancing text-contrast against a photo that mobile doesn't
          show; nothing here needs balancing against. */}
      <div className="absolute inset-0 md:hidden bg-gradient-to-b from-xxm-green-950 via-xxm-green-900 to-xxm-green-950" />

      {/* Everything below is desktop-only: the rotating portraits, their
          scrims, and the rotation dots that indicate which one is showing. */}
      <div className="hidden md:block absolute inset-0">
        {FOUNDERS.map((founder, i) => (
          <div
            key={founder.photo}
            className="absolute inset-0 transition-opacity ease-in-out"
            style={{ opacity: i === index ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
          >
            {/* Ambient fill — the portrait blown out and blurred to the edges. */}
            <Image
              src={founder.photo}
              alt=""
              fill
              priority={i === 0}
              quality={40}
              className="object-cover scale-125 blur-2xl opacity-70"
              sizes="55vw"
            />
            {/* The card itself, whole and uncropped. Held clear of the hero's
                bottom bleed into the next section, which otherwise washes out
                the name band printed across the foot of each portrait. */}
            <div className="absolute inset-x-0 top-0 bottom-32">
              <Image
                src={founder.photo}
                alt=""
                fill
                priority={i === 0}
                quality={85}
                className="object-contain object-right"
                sizes="55vw"
              />
            </div>
          </div>
        ))}

        {/* Readability scrim. Heavy on the left where the headline sits, let
            almost all the way up on the right so the brother is actually
            seen — the whole point of putting him there. */}
        <div className="absolute inset-0 bg-gradient-to-r from-xxm-green-950 from-25% via-xxm-green-950/70 via-55% to-xxm-green-950/5" />
        <div className="absolute inset-0 bg-gradient-to-b from-xxm-green-950/45 via-transparent to-xxm-green-950/75" />

        {/* Which brother is showing — the only thing the artwork doesn't say. */}
        <div className="absolute bottom-8 right-10 flex gap-1.5">
          {FOUNDERS.map((founder, i) => (
            <span
              key={founder.photo}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === index ? 'w-6 bg-xxm-gold' : 'w-1.5 bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
