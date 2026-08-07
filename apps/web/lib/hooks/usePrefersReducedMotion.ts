'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/**
 * Whether the viewer has asked for less motion.
 *
 * Read as external state rather than discovered in an effect. The effect
 * version — check `matchMedia`, then `setState` — renders once with the
 * animation assumed, commits, sets state, and renders again. That second pass
 * is a cascading render on every mount, and it is what
 * `react-hooks/set-state-in-effect` flags.
 *
 * The server answer is `false`: there is no media query to consult, and
 * assuming motion is allowed matches what every one of these components did
 * before. Anyone who has asked for reduced motion gets it on the first client
 * render, without a frame of animation in between.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
