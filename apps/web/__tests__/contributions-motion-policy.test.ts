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

  it('runs no infinite animation around the count', () => {
    // The dashboard hero's drifting orbs are safe there because its count-ups
    // live in a sibling section. Here the count is inside the hero, so a
    // perpetually moving layer would wrap a 60fps repaint — the original bug,
    // rebuilt as decoration.
    for (const animation of [
      'animate-orb-drift-1',
      'animate-orb-drift-2',
      'animate-orb-drift-3',
      'animate-float',
      'animate-gold-glow',
      'animate-pulse-ring',
      'animate-rotate-slow',
    ]) {
      expect(hero, animation).not.toContain(animation)
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
