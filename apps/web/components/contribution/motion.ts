/**
 * ── The animation policy for this page, written down ───────────────────────
 *
 * This page tore on Android phones through seven rounds of attempted fixes.
 * The cause was not a card, a shadow, a gradient or a hover state: `<main>` in
 * the app shell animated a 400ms **translateY**, so every page began life
 * inside a compositing layer that was moving, and the count-up hooks rewrote
 * their subtree sixty times a second inside it. Blink rasterises tiles it then
 * never invalidates, so the intermediate frames stayed on the screen.
 *
 * The page is now visibly clean on the owner's phone. Keeping it that way is a
 * question of one rule, not of restraint:
 *
 *   **Nothing that contains a live-updating value may have an animating or
 *   transitioning ancestor.**
 *
 * Everything below follows from it.
 *
 * ── What is safe ───────────────────────────────────────────────────────────
 *
 *   - **Opacity.** It composites without moving geometry, so a repaint inside
 *     a fading box has nothing to be stranded against. Every entrance on this
 *     page is opacity-only, which is why `ENTER` exists.
 *   - **Transforms on leaves.** An icon that scales on hover owns no
 *     descendants and repaints nothing. Fine.
 *   - **Transforms on siblings.** A decorative element beside the number,
 *     rather than around it, gets its own layer and does not promote its
 *     parent.
 *   - **`Reveal`.** `RevealGuard` settles it in the document head before first
 *     paint: on a touch device it renders the finished state with no transform
 *     at all.
 *
 * ── What is not ────────────────────────────────────────────────────────────
 *
 *   - A transform animation or transition on a **section, card or wrapper**.
 *     That is the shape of the original bug.
 *   - `transition-all` anywhere. It arms `transform` whether or not anything
 *     ever moves, which is enough to promote the element.
 *   - An **infinite** transform animation on anything that *wraps* content —
 *     the shape the shell had. The dashboard's drifting orbs are not that
 *     shape: they are absolutely positioned siblings that move their own layer
 *     and nothing else's, which is why the hero here carries them beside the
 *     counting total rather than around it. Each is `absolute`, `aria-hidden`
 *     and `will-change: transform`, so the promotion is explicit rather than
 *     left to Blink's heuristics — an orb can never be rasterised into the
 *     same layer as the text it drifts behind.
 *   - An ungated hover transform. A phone cannot hover, so it is pure cost;
 *     every one here is `sm:`-gated, transition included.
 *
 * `apps/web/__tests__/contributions-motion-policy.test.ts` enforces the parts
 * of this that can be read off the source.
 */

/**
 * The one entrance used on this page: fade, no movement.
 *
 * `animate-fade-in` resolves to `fade-in 0.3s ease-out both`, and `both` holds
 * the *first* keyframe during the delay — so a staggered element is invisible
 * until its turn rather than flashing at full opacity and then starting.
 */
export const ENTER = 'animate-fade-in'

/**
 * Stagger in milliseconds, as an inline `animationDelay`.
 *
 * Tailwind's `delay-*` utilities set `transition-delay`, which does nothing to
 * a CSS animation — the dashboard hero has `animate-fade-in-up delay-100` on a
 * line that has never actually been delayed.
 */
export function enterDelay(ms: number): React.CSSProperties {
  return ms > 0 ? { animationDelay: `${ms}ms` } : {}
}

/**
 * The dashboard's card surface, which this page now matches.
 *
 * `sm:` covers the transition as well as the hover. An armed transform
 * transition makes an element a compositing candidate at rest, and no phone
 * can produce the hover that would justify it.
 */
export const CARD =
  'rounded-2xl border bg-gradient-to-b to-white shadow-xxm-sm ' +
  'sm:transition-[box-shadow,transform] sm:duration-fast sm:ease-smooth ' +
  'sm:hover:-translate-y-0.5 sm:hover:shadow-xxm'

/** The icon tile that sits at the top of a dashboard card. */
export const CARD_ICON =
  'flex h-10 w-10 items-center justify-center rounded-xl ' +
  'sm:transition-transform sm:duration-slow sm:group-hover:scale-110'
