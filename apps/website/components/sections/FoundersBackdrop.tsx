'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { FOUNDERS } from '@/lib/founders'

/** How long each brother holds the hero before the next fades in. */
const ROTATE_MS = 7_000
/** Cross-fade duration — long enough to read as a dissolve, not a cut. */
const FADE_MS = 1_200

/**
 * The four founders, rotating behind the hero.
 *
 * Each portrait renders TWICE. A blurred, scaled copy fills the frame edge to
 * edge so the brother genuinely is the background and his own colours bleed into
 * it; the sharp copy sits on top under `object-contain`, so the card is shown
 * whole — the name and title are part of the artwork, and cropping to fill a
 * landscape hero would cut that band off. The blur also absorbs the difference
 * between a dark studio card and a light grey one, which as hard-cut backgrounds
 * would flash on every change.
 *
 * The scrim is deliberately lopsided: heavy on the left where the headline sits,
 * light on the right where the portrait is, so the copy keeps its contrast
 * without burying the face.
 *
 * No caption — each card already carries its own name and title.
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
            sizes="100vw"
          />
          {/* The card itself, whole and uncropped. Held clear of the hero's
              bottom bleed into the next section, which otherwise washes out the
              name band printed across the foot of each portrait. */}
          {/* `bottom-[var(--founder-caption-zone)]` rather than a literal
              `bottom-28`: HeroSection's mobile content needs to know exactly
              how much of this frame it must stay clear of, and a value
              stated once in globals.css and read by both files can't drift
              out of agreement the way two separately guessed ones already
              did — repeatedly. Desktop keeps its own literal `bottom-32`:
              the photo sits beside the text there rather than behind it,
              so nothing on that side depends on this number. */}
          <div className="absolute inset-x-0 top-0 bottom-[var(--founder-caption-zone)] md:bottom-32">
            <Image
              src={founder.photo}
              alt=""
              fill
              priority={i === 0}
              quality={85}
              className="object-contain object-center md:object-right"
              sizes="(max-width: 768px) 100vw, 55vw"
            />
          </div>
        </div>
      ))}

      {/* Readability scrim. Weighted hard to the left, where the headline sits,
          and let almost all the way up on the right so the brother is actually
          seen — the whole point of putting him there. */}
      <div className="absolute inset-0 bg-xxm-green-950/72 md:hidden" />
      <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-xxm-green-950 from-25% via-xxm-green-950/70 via-55% to-xxm-green-950/5" />
      <div className="absolute inset-0 bg-gradient-to-b from-xxm-green-950/45 via-transparent to-xxm-green-950/75" />

      {/* Which brother is showing — the only thing the artwork doesn't say. */}
      <div className="absolute bottom-8 right-6 md:right-10 flex gap-1.5">
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
  )
}
