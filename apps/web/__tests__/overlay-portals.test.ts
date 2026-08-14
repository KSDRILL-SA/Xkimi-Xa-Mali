import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Overlays must not be positioned inside the content they cover.
 *
 * Two different ways that goes wrong, both fixed here and both cheap to undo by
 * accident:
 *
 * - `position: fixed` means "the viewport" only while no ancestor has a
 *   transform, filter or perspective. Any of those makes the ancestor the
 *   containing block, and a full-page dialog covers a card instead of the
 *   screen.
 * - An absolutely positioned menu is clipped by any ancestor that hides or
 *   scrolls its overflow, whatever its z-index — clipping is not paint order.
 *   `DataTable`, `StatCard` and `ScrollNav` all clip.
 *
 * Rendering into the body settles both, and neither depends on what a future
 * caller nests these inside.
 *
 * Read as source because the assertions are about structure, and the repository
 * has no DOM to mount into. The behaviour itself was checked by opening the
 * cancel-mandate dialog in a browser: parent was `<body>`, it covered
 * 1536x720 against a 1536x720 viewport, the page was scroll-locked, focus moved
 * inside, and `aria-labelledby` resolved.
 */

const ui = (f: string) => readFileSync(resolve(__dirname, `../../../packages/ui/src/components/${f}`), 'utf8')

describe('the confirm dialog', () => {
  const src = ui('ConfirmModal.tsx')

  it('renders into the body', () => {
    expect(src).toContain('createPortal')
    expect(src).toContain('document.body')
  })

  it('waits for mount before portalling', () => {
    // `document` does not exist while rendering on the server, and this
    // component is imported by server-rendered pages.
    expect(src).toMatch(/setMounted\(true\)/)
    expect(src).toMatch(/!mounted/)
  })

  it('gives each instance its own heading id', () => {
    // Two dialogs mounted at once both claimed `confirm-title`, so every
    // `aria-labelledby` pointed at whichever the browser found first.
    expect(src).toContain('useId')
    expect(src).not.toContain('"confirm-title"')
  })

  it('restores the scroll position it found rather than assuming a default', () => {
    expect(src).toMatch(/const previous = document\.body\.style\.overflow/)
  })

  it('returns focus when it closes', () => {
    expect(src).toMatch(/document\.activeElement/)
    expect(src).toMatch(/restoreTo\?\.focus/)
  })
})

describe('the dropdown menu', () => {
  const src = ui('Dropdown.tsx')

  it('renders into the body', () => {
    expect(src).toContain('createPortal')
    expect(src).toContain('document.body')
  })

  it('positions itself from the trigger', () => {
    expect(src).toContain('getBoundingClientRect')
    expect(src).toMatch(/position: 'fixed'/)
  })

  it('still closes on an outside click, and does not treat itself as outside', () => {
    // The menu is no longer inside the wrapper it is anchored to, so the
    // click-outside check has to know about both. Without this, a mousedown on
    // a menu item counted as outside, unmounted the menu, and the click that
    // followed landed on nothing.
    expect(src).toMatch(/menuRef\.current\?\.contains/)
    expect(src).toMatch(/ref\.current\?\.contains/)
  })

  it('follows the trigger when the page moves', () => {
    // A fixed menu does not travel with a scrolling ancestor on its own.
    expect(src).toMatch(/addEventListener\('scroll'[^)]*true\)/)
    expect(src).toMatch(/addEventListener\('resize'/)
  })

  it('is not painted before it has been measured', () => {
    expect(src).toContain('invisible')
  })
})
