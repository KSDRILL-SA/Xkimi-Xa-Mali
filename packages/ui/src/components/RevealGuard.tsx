/**
 * Decides, before the browser's first paint, whether this device animates.
 *
 * ── Why this cannot be done in React ────────────────────────────────────────
 *
 * The contributions page tore on phones through six rounds of fixes: cards
 * drawn twice about 100px apart, bands of the page painted at a stale scroll
 * offset, worse the further you scrolled. That is a compositor failing to
 * invalidate a region after a GPU layer is destroyed.
 *
 * `Reveal` already knew this and already skipped the animation on touch
 * devices. It was still wrong, and this is the part every previous attempt
 * missed: the guard runs in a layout effect, and a layout effect cannot run
 * until React has hydrated. The server-rendered HTML arrives carrying the bare
 * `reveal` class, which is `opacity: 0` **and `transform: translateY(28px)`**.
 * The browser paints that immediately — creating exactly the layer the guard
 * exists to prevent — and hydration then adds `reveal-done`, setting
 * `transform: none` and destroying it. On a phone, with JavaScript arriving
 * late, that is many frames apart.
 *
 * So the component's own comment — "no transform is ever applied, so no layer
 * is created and none has to be torn down" — was true of every frame except
 * the ones that actually existed.
 *
 * A blocking inline script is the only thing that runs earlier than the first
 * paint. It sets a class on `<html>`, and the stylesheet neutralises every
 * reveal class beneath it, so on a touch device the transform never exists in
 * any frame at all. Nothing to promote, nothing to tear down, nothing to
 * repaint incorrectly.
 *
 * ── Why `maxTouchPoints` and not a media query ──────────────────────────────
 *
 * A `hover`/`pointer` query would be pure CSS and need no script — but Chrome's
 * "Desktop site" mode reports `hover: hover` and `pointer: fine` while still
 * being the same phone driving the same GPU, and the tearing was reported in
 * exactly that mode. `maxTouchPoints` still tells the truth there.
 *
 * ── Placement ───────────────────────────────────────────────────────────────
 *
 * Render inside `<head>`, before the stylesheet is applied to anything. It is
 * deliberately tiny and synchronous: a few microseconds of blocking is the
 * price of the decision being made in time, and an async script would be back
 * to deciding after the paint it needed to influence.
 */
export function RevealGuard() {
  return (
    <script
      // The class is added, never removed. A device does not stop being a
      // phone, and re-enabling animation later would reintroduce a layer
      // teardown at an arbitrary moment — which is the bug.
      dangerouslySetInnerHTML={{
        __html:
          'try{var d=document.documentElement;' +
          'if((navigator.maxTouchPoints||0)>0||' +
          "(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches))" +
          "d.classList.add('no-reveal')}catch(e){}",
      }}
    />
  )
}
