import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The contributions page must not animate a transform on anything that wraps
 * something else.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 *
 * This page tore on Android through seven rounds. The cause was `<main>` in the
 * app shell animating a 400ms `translateY`: every page began inside a moving
 * compositing layer, and the count-up hooks rewrote their subtree sixty times a
 * second inside it. Blink rasterises tiles it then never invalidates, so the
 * intermediate frames stayed on screen — the owner's screenshot showed "Make a
 * payment" painted three times at three scroll offsets.
 *
 * `shell-entry-animation.test.ts` pins the shell. This file pins the page, so
 * that restyling it cannot reintroduce the same shape one card at a time.
 *
 * The rule, stated once in `motion.ts`: **nothing containing a live-updating
 * value may have an animating or transitioning ancestor.** Transforms are for
 * leaves — an icon, an arrow — and only where a hover can actually occur.
 *
 * Read as source. What is under test is the class a developer will copy when
 * adding the next card.
 */

const DIR = resolve(__dirname, '../components/contribution')
const PAGE = resolve(__dirname, '../app/(member)/dashboard/contributions/page.tsx')

const files: { name: string; source: string }[] = [
  ...readdirSync(DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ name: f, source: readFileSync(resolve(DIR, f), 'utf8') })),
  { name: 'page.tsx', source: readFileSync(PAGE, 'utf8') },
]

/** Strip block and line comments — the notes here discuss the banned classes. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('every contribution component', () => {
  it.each(files.map((f) => f.name))('%s uses no transform-based entrance', (name) => {
    const source = code(files.find((f) => f.name === name)!.source)
    for (const animation of [
      'animate-fade-in-up',
      'animate-fade-in-down',
      'animate-slide-in-right',
      'animate-slide-left',
      'animate-slide-right',
      'animate-scale-in',
      'animate-count-up',
    ]) {
      expect(source, `${name} must not use ${animation}`).not.toContain(animation)
    }
  })

  it.each(files.map((f) => f.name))('%s uses no transition-all', (name) => {
    // `transition-all` arms `transform` whether or not anything ever moves,
    // which is enough on its own to promote the element to a layer.
    const source = code(files.find((f) => f.name === name)!.source)
    expect(source).not.toMatch(/\btransition-all\b/)
  })

  it.each(files.map((f) => f.name))('%s gates every transform transition on sm:', (name) => {
    // A phone cannot hover, so an ungated transform transition is pure cost —
    // and cost of exactly the kind that caused the original bug.
    const source = code(files.find((f) => f.name === name)!.source)
    for (const match of source.matchAll(/(\S*)transition-transform/g)) {
      expect(match[1], `${name}: "${match[0]}" must be sm:-gated`).toContain('sm:')
    }
  })
})

describe('the hero, which holds the counting total', () => {
  const hero = code(readFileSync(resolve(DIR, 'ContributionHero.tsx'), 'utf8'))

  /**
   * Infinite animations are allowed, but only in one shape.
   *
   * The bug was an **ancestor** transform: the shell moved and the count
   * repainted inside the layer that was moving. A drifting orb is the opposite
   * arrangement — an absolutely positioned sibling that moves its own layer and
   * wraps nothing. So the test is not "is this class present" but "is every
   * element carrying it decorative and out of flow".
   */
  const INFINITE = [
    'animate-orb-drift-1',
    'animate-orb-drift-2',
    'animate-orb-drift-3',
    'animate-float',
    'animate-float-delayed',
    'animate-gold-glow',
    'animate-border-glow',
    'animate-pulse-gold',
    'animate-pulse-ring',
    'animate-rotate-slow',
  ]

  /** The `<div …/>` (or `<span …/>`) that carries a given class. */
  function elementWith(cls: string): string | null {
    const at = hero.indexOf(cls)
    if (at === -1) return null
    const open = hero.lastIndexOf('<', at)
    const close = hero.indexOf('/>', at)
    return hero.slice(open, close + 2)
  }

  it.each(INFINITE)('%s, if used, is a decorative absolute sibling', (cls) => {
    const el = elementWith(cls)
    if (el === null) return // not used — nothing to prove

    expect(el, `${cls} must be positioned out of flow`).toMatch(/\babsolute\b/)
    expect(el, `${cls} must be hidden from assistive tech`).toContain('aria-hidden')
    expect(el, `${cls} must not swallow taps`).toMatch(/\bpointer-events-none\b/)
    // Explicit promotion, so the orb never shares a layer with the text it
    // drifts behind.
    expect(el, `${cls} must declare willChange`).toContain('willChange')
    // Self-closing: an element that wraps children is the banned shape.
    expect(el.endsWith('/>'), `${cls} must not wrap content`).toBe(true)
  })

  it('keeps the counting total outside every animated element', () => {
    // The amount is rendered in the `relative z-10` block, which carries no
    // animation of its own.
    const content = hero.slice(hero.indexOf('relative z-10'))
    for (const cls of INFINITE) {
      expect(content, `${cls} must not appear around the total`).not.toContain(cls)
    }
  })

  it('still counts', () => {
    expect(hero).toContain('useCountUp')
  })
})

describe('the page wrapper', () => {
  const page = code(readFileSync(PAGE, 'utf8'))

  it('staggers with animationDelay rather than delay-*', () => {
    // Tailwind's `delay-*` sets `transition-delay`, which does nothing to a CSS
    // animation. The dashboard hero has `animate-fade-in-up delay-100` on a
    // line that has never actually been delayed.
    expect(page).toContain('enterDelay(')
    expect(page).not.toMatch(/animate-fade-in\s+delay-\d/)
  })
})
