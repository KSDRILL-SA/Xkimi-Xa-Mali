import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * Bypass Blocks — WCAG 2.4.1, Level A.
 *
 * This site puts a seven-item navigation ahead of its content on every page, so
 * a keyboard or screen-reader visitor walked all of it before reaching anything
 * they came for. The member and admin apps get a skip link from `packages/ui`'s
 * `AppHeader`; this app has its own `Navbar` and never had one — it had the
 * *target*, `#main-content`, with nothing pointing at it.
 *
 * The link now lives in the root layout, so it covers every page. That is what
 * makes the second case here necessary: a skip link in a shared layout is only
 * as good as the target on each individual page, and `/about` had a `<main>`
 * with no id at all. Pressing the link there did nothing, silently — which is
 * the worst kind of accessibility feature, because it looks present.
 *
 * A source scan rather than a rendered-DOM test: this app has no component test
 * harness, and the property being asserted is structural and true of every page
 * file rather than of one render.
 */

const APP = path.resolve(__dirname, '..', 'app')

function pageFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...pageFiles(full))
    else if (entry === 'page.tsx') out.push(full)
  }
  return out
}

describe('a keyboard visitor can reach the content', () => {
  it('the root layout offers a skip link', () => {
    const layout = readFileSync(path.join(APP, 'layout.tsx'), 'utf8')

    expect(layout).toContain('href="#main-content"')
    expect(layout).toContain('skip-to-main')
  })

  it('the skip link is styled, not merely present', () => {
    // This app does not import `packages/ui`'s stylesheet, so the class it uses
    // has to exist here. Without the CSS the link is visible at all times and
    // sits over the header — present, and worse than absent.
    const css = readFileSync(path.join(APP, 'globals.css'), 'utf8')

    expect(css).toContain('.skip-to-main')
    expect(css).toContain('.skip-to-main:focus')
  })

  it('every page gives the link somewhere to land', () => {
    const missing = pageFiles(APP)
      .filter((file) => !readFileSync(file, 'utf8').includes('id="main-content"'))
      .map((file) => path.relative(APP, file))

    expect(missing, `these pages have no #main-content, so the skip link does nothing on them:\n  ${missing.join('\n  ')}`)
      .toEqual([])
  })

  it('finds pages at all, so a pass means something', () => {
    // If the page-file convention changes, the case above would otherwise pass
    // by scanning nothing.
    expect(pageFiles(APP).length).toBeGreaterThan(1)
  })
})
