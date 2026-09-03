import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The reveal transform must never exist on a touch device — in any frame.
 *
 * The contributions page tore on phones through six rounds of fixes. The cause
 * was correctly identified early: a transform promotes the element to its own
 * GPU layer, `reveal-done` later sets `transform: none` and destroys it, and
 * Android Chrome does not reliably repaint the region the layer occupied. Whole
 * bands of the page stayed on screen at a stale scroll offset.
 *
 * The cure was wrong, and every subsequent attempt inherited the mistake.
 * `Reveal` skipped the animation on touch devices — from a layout effect, which
 * cannot run until React has hydrated. The server-rendered HTML arrives
 * carrying the bare `reveal` class, which is opacity 0 **and**
 * `transform: translateY(28px)`. The browser paints that immediately, creating
 * the layer, and hydration then tears it down. The guard was correct about
 * every frame except the ones that actually existed.
 *
 * These are source assertions rather than a rendering test on purpose: the
 * claim is about what the browser receives before any of our JavaScript runs,
 * which is exactly what a JSDOM render cannot reproduce.
 */

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')

const CSS = read('../../../packages/ui/src/globals.css')
const GUARD = read('../../../packages/ui/src/components/RevealGuard.tsx')
const REVEAL = read('../../../packages/ui/src/components/Reveal.tsx')

describe('the decision is made before the first paint', () => {
  it('is a blocking inline script, not a module or a deferred one', () => {
    // async or defer would put it back after the paint it needs to influence,
    // which is the whole defect.
    expect(GUARD).toContain('dangerouslySetInnerHTML')
    // Only the element, not the prose around it — the comment explains why
    // async would be wrong, and matching that would fail on the explanation
    // rather than on the code.
    const tag = GUARD.slice(GUARD.indexOf('<script'), GUARD.indexOf('/>') + 2)
    expect(tag).not.toMatch(/defer|async|type="module"/)
  })

  it('keys on maxTouchPoints, which Chrome desktop mode cannot spoof away', () => {
    // A hover/pointer media query would need no script at all, but Chrome's
    // "Desktop site" reports hover:hover and pointer:fine on the same phone
    // driving the same GPU — and the tearing was reported in that mode.
    expect(GUARD).toContain('maxTouchPoints')
  })

  it('honours reduced motion too', () => {
    expect(GUARD).toContain('prefers-reduced-motion')
  })

  it('is mounted in the head of both apps', () => {
    for (const app of ['web', 'admin']) {
      const layout = read(`../../../apps/${app}/app/layout.tsx`)
      expect(layout, `${app} must mount the guard`).toContain('<RevealGuard />')
      expect(layout, `${app} must mount it in <head>`).toMatch(/<head>[\s\S]*<RevealGuard \/>[\s\S]*<\/head>/)
    }
  })
})

describe('what the stylesheet neutralises', () => {
  const block = CSS.slice(CSS.indexOf('.no-reveal'), CSS.indexOf('.reveal {'))

  it('neutralises the BASE classes, not only the finished ones', () => {
    // The base class is what the server-rendered HTML carries. Overriding only
    // `.revealed` or `.reveal-done` would leave the transform in the very frame
    // that creates the layer.
    for (const cls of ['.no-reveal .reveal', '.no-reveal .reveal-left', '.no-reveal .reveal-right', '.no-reveal .reveal-scale']) {
      expect(block, `${cls} must be neutralised`).toContain(cls)
    }
  })

  it('removes the transform, the transition and the hiding', () => {
    // The transition matters on its own: a transition on `transform` is enough
    // for some engines to keep compositing the element even at rest.
    expect(block).toMatch(/transform:\s*none\s*!important/)
    expect(block).toMatch(/transition:\s*none\s*!important/)
    expect(block).toMatch(/opacity:\s*1\s*!important/)
  })
})

describe('the component defers to that decision', () => {
  it('reads the class rather than asking the question a second time', () => {
    // Two answers to one question is how the old guard came to be correct and
    // ineffective at the same time.
    expect(REVEAL).toContain("classList.contains('no-reveal')")
  })

  it('still has its own fallback, for a host that never mounted the guard', () => {
    expect(REVEAL).toContain('maxTouchPoints')
  })
})
