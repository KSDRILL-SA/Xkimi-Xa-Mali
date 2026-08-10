'use client'

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

/**
 * Render a dialog at the top of the document, out of whatever it was declared in.
 *
 * `position: fixed` is only fixed to the viewport while no ancestor carries a
 * transform. The reveal-on-scroll wrapper these cards sit in keeps
 * `transform: translateY(0)` after it has finished animating — still a
 * transform, and enough to change the rules. A dialog declared inside one is
 * positioned against that card's box rather than the screen, and its `z-50` is
 * confined to a stacking context the card created, so later cards paint over
 * the top of it.
 *
 * The result was a dialog trapped behind the page furniture, on a page whose
 * scrolling that same dialog had just locked — nothing readable and no way to
 * reach it.
 *
 * A portal sidesteps all of it: `document.body` has no transformed ancestor, so
 * fixed means fixed and the stacking context is the root one.
 */

/** Never changes, so the store never notifies — this only distinguishes server from client. */
const neverChanges = () => () => {}

export function ModalPortal({ children }: { children: React.ReactNode }) {
  // `useSyncExternalStore` rather than the usual `useState` + `useEffect` pair:
  // the server snapshot is false and the client snapshot is true, which is
  // exactly the question being asked, and it does not set state during an
  // effect. `createPortal` needs a real DOM node, and a dialog is only ever
  // opened by a click, so there is nothing to server-render regardless.
  const onClient = useSyncExternalStore(neverChanges, () => true, () => false)

  if (!onClient) return null
  return createPortal(children, document.body)
}
