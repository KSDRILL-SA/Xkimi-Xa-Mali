import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * One-shot animations must not end `both`.
 *
 * `both` keeps the final keyframe applied for the life of the element. When
 * that keyframe sets a transform — every fade, slide and scale in this
 * preset — the element keeps a transform that moves nothing and never leaves.
 *
 * A non-`none` transform creates a stacking context and becomes the containing
 * block for `position: fixed` descendants. `animate-fade-in-up` sat on the
 * admin shell's `<main>`, so the entire page was one trapped layer: dropdowns
 * could not paint above neighbouring sections at any z-index, and `fixed
 * inset-0` overlays covered the padded, max-width `<main>` instead of the
 * viewport. The reported symptom was parts of the interface disappearing into
 * other content when opened.
 *
 * `backwards` holds the *first* keyframe before the animation starts — which is
 * what prevents the flash these exist for — and gives the element back to its
 * own styles afterwards. The resting appearance is identical, because the last
 * keyframe of each is the element's natural state.
 *
 * Read as source rather than imported: the preset is a Tailwind config consumed
 * by a build, and what matters is the string a developer will copy when adding
 * the next animation.
 */

const PRESET = resolve(__dirname, '../../../packages/config/tailwind/base.ts')
const source = readFileSync(PRESET, 'utf8')

/** The `animation:` block of the preset, without the keyframes below it. */
const block = source.slice(source.indexOf('animation: {'), source.indexOf('keyframes: {'))

type Entry = { name: string; value: string }

const entries: Entry[] = [...block.matchAll(/'([a-z0-9-]+)':\s*'([^']+)'/g)]
  .map((m) => ({ name: m[1]!, value: m[2]! }))

/** Runs forever, so it holds its transform by definition. Decorative only. */
const isInfinite = (e: Entry) => e.value.includes('infinite')

/**
 * Whether an animation's keyframes set a transform.
 *
 * This is the whole rule. An animation that only moves opacity may fill
 * `both` quite safely — `opacity: 1` creates no stacking context and traps
 * nothing. It is the transform that does the damage, so it is the transform
 * the check looks for, rather than banning a fill mode outright.
 */
const keyframes = source.slice(source.indexOf('keyframes: {'))
function endsWithTransform(name: string): boolean {
  // `count-up` reuses another animation's keyframes.
  const frameName = name === 'count-up' ? 'fade-in-up' : name
  const at = keyframes.indexOf(`'${frameName}':`)
  if (at === -1) return false
  // Bounded at the next key rather than by a character count. A fixed window
  // ran off the end of `fade-in` into `fade-in-up` and reported a transform
  // that belonged to the neighbour.
  const rest = keyframes.slice(at + frameName.length + 3)
  const next = rest.search(/\n {4}'[a-z0-9-]+':/)
  return /transform:/.test(next === -1 ? rest : rest.slice(0, next))
}

/**
 * Draws itself and must stay drawn.
 *
 * `draw-line` animates `stroke-dashoffset` on an SVG path; reverting would
 * erase the line the moment it finished. It sets no transform, so it traps
 * nothing — the exemption costs nothing.
 */
const MUST_PERSIST = new Set(['draw-line', 'fade-out'])

describe('the animation preset', () => {
  it('defines some animations to check', () => {
    expect(entries.length).toBeGreaterThan(10)
    // If this ever hits zero the checks below would pass by describing nothing.
    expect(entries.filter((e) => !isInfinite(e) && endsWithTransform(e.name)).length)
      .toBeGreaterThan(4)
  })

  it.each(entries.filter((e) => !isInfinite(e) && !MUST_PERSIST.has(e.name) && endsWithTransform(e.name)))(
    'does not leave $name filling forwards',
    (entry) => {
      // `forwards` has the same consequence as `both`; both retain the last
      // keyframe. Only the entries that genuinely end invisible may do that.
      expect(entry.value).not.toMatch(/\bboth\b/)
      expect(entry.value).not.toMatch(/\bforwards\b/)
    },
  )

  it('still prevents the pre-animation flash', () => {
    // The reason `both` was chosen originally. `backwards` keeps the first
    // keyframe before the animation starts, which covers that case — so
    // removing it entirely would be a different regression.
    const oneShot = entries.filter(
      (e) => !isInfinite(e) && !MUST_PERSIST.has(e.name) && endsWithTransform(e.name),
    )
    for (const e of oneShot) {
      expect(e.value, `${e.name} needs a fill mode`).toMatch(/\bbackwards\b/)
    }
  })
})

describe('the hand-written animations in the shared stylesheet', () => {
  const css = readFileSync(resolve(__dirname, '../../../packages/ui/src/globals.css'), 'utf8')

  it('does not park a transform on the page wrapper', () => {
    // `.page-enter` wraps page content the same way `<main>` does.
    const rule = css.slice(css.indexOf('.page-enter'), css.indexOf('.page-enter') + 120)
    expect(rule).toContain('backwards')
    expect(rule).not.toMatch(/\bboth\b/)
  })

  it('leaves the exit animation alone', () => {
    // `.toast-exit` ends at opacity 0 and must stay there; reverting would
    // flash the toast back to full opacity before it is removed.
    const rule = css.slice(css.indexOf('.toast-exit'), css.indexOf('.toast-exit') + 120)
    expect(rule).toMatch(/\bboth\b/)
  })
})

describe('the reveal wrapper', () => {
  const reveal = readFileSync(resolve(__dirname, '../../../packages/ui/src/components/Reveal.tsx'), 'utf8')
  const css = readFileSync(resolve(__dirname, '../../../packages/ui/src/globals.css'), 'utf8')

  it('drops its transform once the animation has finished', () => {
    // The same fault as the fill mode, reached a different way: the revealed
    // state holds translateY(0) for good unless something removes it.
    expect(reveal).toContain('reveal-done')
    expect(reveal).toContain('transitionend')
  })

  it('has a rule specific enough to win against the revealed state', () => {
    // `.reveal.revealed` is two classes. A single `.reveal-done` would lose.
    expect(css).toMatch(/\.reveal\.reveal-done/)
    expect(css.slice(css.indexOf('.reveal.reveal-done'))).toMatch(/transform:\s*none/)
  })

  it('does not wait on the event alone', () => {
    // transitionend does not fire under prefers-reduced-motion, on a hidden
    // tab, or when the animation is optimised away. Late is survivable; never
    // is the bug.
    expect(reveal).toContain('setTimeout')
  })
})
