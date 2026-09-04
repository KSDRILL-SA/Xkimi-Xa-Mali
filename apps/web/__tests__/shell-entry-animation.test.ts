import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The app shells must not animate `<main>` with a transform.
 *
 * ── What this pins, and why it took seven attempts to find ──────────────────
 *
 * Both shells wrapped every page in `<main class="… animate-fade-in-up">` — a
 * 400ms `translateY`. For the first 400ms after any navigation the entire page
 * was therefore inside a compositing layer that was moving.
 *
 * `useCountUp` runs a `requestAnimationFrame` loop calling `setState` around
 * sixty times a second. When a subtree rewrites itself that fast inside a
 * moving layer, Blink rasterises tiles it then never invalidates, and the old
 * frames stay on the screen. On a member's phone the contributions page showed
 * "Make a payment" painted three times at three different offsets — three
 * stranded frames of the entry animation.
 *
 * The correlation was complete and had been visible the whole time:
 *
 *   contributions   calls useCountUp   tore
 *   dashboard       calls useCountUp   tore
 *   transactions    does not           never tore, with the same gradients,
 *                                      rounded-3xl, shadow-xxm and Reveal
 *
 * Six rounds removed cards, shadows, hover lifts, reveal transforms and armed
 * `transition-transform` from a page whose visual twin had all of them and was
 * fine. A seventh disabled the count-up, which removed one half of the
 * collision and so appeared to work — and the wrong lesson ("phones cannot
 * afford this animation") was recorded, so restoring the animation on request
 * brought the bug straight back.
 *
 * `animate-fade-in` is opacity only. Opacity does not move geometry, so there
 * is no moving layer for a repaint to be stranded in, and the count-up is free
 * to run everywhere.
 *
 * Read as source: what matters is the class a developer will find on `<main>`
 * and copy into the next shell.
 */

const SHELLS = {
  member: resolve(__dirname, '../components/layout/MemberAppShell.tsx'),
  admin: resolve(__dirname, '../../admin/components/layout/AdminAppShell.tsx'),
} as const

/** The `<main …>` opening tag, which is the only element under test. */
function mainTag(source: string): string {
  const at = source.indexOf('<main')
  expect(at, 'the shell renders a <main>').toBeGreaterThan(-1)
  return source.slice(at, source.indexOf('>', at) + 1)
}

describe.each(Object.entries(SHELLS))('%s shell <main>', (_name, path) => {
  const tag = mainTag(readFileSync(path, 'utf8'))

  it('fades with opacity', () => {
    // Anchored: `animate-fade-in` is a prefix of `animate-fade-in-up`, so a
    // bare `toContain` would pass on exactly the value this file exists to
    // forbid.
    expect(tag).toMatch(/animate-fade-in(?![-\w])/)
  })

  it('does not animate a transform', () => {
    // Every one of these ends its keyframes on a translate.
    for (const animation of [
      'animate-fade-in-up',
      'animate-fade-in-down',
      'animate-slide-in-right',
      'animate-slide-left',
      'animate-slide-right',
      'animate-scale-in',
      'animate-count-up',
    ]) {
      expect(tag, animation).not.toContain(animation)
    }
  })

  it('carries no transform utility of its own', () => {
    // A static transform would create the same moving-layer conditions the
    // moment anything transitioned it.
    expect(tag).not.toMatch(/\btransition-transform\b/)
    expect(tag).not.toMatch(/\btransition-all\b/)
    expect(tag).not.toMatch(/\b-?translate-[xy]-/)
  })
})
