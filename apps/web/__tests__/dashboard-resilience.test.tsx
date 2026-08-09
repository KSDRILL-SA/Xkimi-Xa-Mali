import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * One failing section used to take the member's home screen with it.
 *
 * The dashboard is five independent sections behind five `<Suspense>`
 * boundaries. Suspense handles a section that is *slow*. It does nothing at all
 * for a section that *throws* — the error travels past it to the route's
 * `error.tsx`, which replaces the whole page.
 *
 * So a forecast widget hitting a slow query, or a badge lookup finding Redis
 * unreachable, replaced the member's balance, their recent contributions and
 * the button that starts a payment with an error card. On debit night that is
 * the difference between a member paying and a member phoning somebody.
 */

const mocks = vi.hoisted(() => ({ logError: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.logError },
}))

import { SectionBoundary } from '@/components/ui/SectionBoundary'

beforeEach(() => vi.clearAllMocks())

/**
 * Driven through the component's own contract rather than a renderer.
 *
 * `renderToStaticMarkup` does not run error boundaries — React only engages
 * them in the client renderer and in streaming SSR. Rendering a throwing child
 * through it therefore proves nothing about the boundary and everything about
 * the renderer, so the boundary is exercised the way React itself drives it:
 * `getDerivedStateFromError` on the throw, `componentDidCatch` for the report,
 * then `render` in the failed state.
 */
function boundary(props: { label: string; fallback?: React.ReactNode; children?: React.ReactNode }) {
  const instance = new SectionBoundary(props as never)
  instance.state = SectionBoundary.getDerivedStateFromError()
  instance.componentDidCatch(new Error('insights query timed out'))
  return instance
}

describe('a section that throws', () => {
  it('marks itself failed rather than rethrowing', () => {
    expect(SectionBoundary.getDerivedStateFromError()).toEqual({ failed: true })
  })

  it('drops the section rather than showing a broken panel', () => {
    // Nothing is rendered in its place: a missing panel reads better to a
    // member than a broken one, and the page around it is untouched.
    expect(boundary({ label: 'insights' }).render()).toBeNull()
  })

  it('renders a fallback when one is given', () => {
    const fallback = <span>Unavailable</span>
    expect(boundary({ label: 'insights', fallback }).render()).toBe(fallback)
  })

  it('reports the disappearance, naming the section', () => {
    // A section vanishing silently is how a broken dashboard goes unnoticed for
    // a month. It is invisible to the member and never invisible to us.
    boundary({ label: 'insights' })

    expect(mocks.logError).toHaveBeenCalledWith(
      'Dashboard section failed to render',
      expect.objectContaining({ section: 'insights', reason: 'insights query timed out' }),
    )
  })

  it('leaves a healthy section completely alone', () => {
    const children = <p>R4 500</p>
    const instance = new SectionBoundary({ label: 'stats', children } as never)

    expect(instance.render()).toBe(children)
    expect(mocks.logError).not.toHaveBeenCalled()
  })
})

describe('the dashboard wires every section', () => {
  const page = readFileSync(
    resolve(__dirname, '../app/(member)/dashboard/page.tsx'),
    'utf8',
  )

  it('wraps all five, so none of them can take the page', () => {
    for (const label of ['stats', 'badge', 'insights', 'recent-contributions', 'active-goals']) {
      expect(page, label).toContain(`label="${label}"`)
    }
  })

  it('leaves no Suspense unguarded', () => {
    const suspenses = page.match(/<Suspense/g) ?? []
    const boundaries = page.match(/<SectionBoundary/g) ?? []
    expect(boundaries.length).toBe(suspenses.length)
  })

  it('redirects on a missing session rather than asserting one', () => {
    // Every other member page guards; this one used `session!`, so a middleware
    // matcher that stopped covering /dashboard meant a TypeError and a 500
    // rather than a trip to the login page.
    expect(page).toContain("redirect('/login')")
    expect(page).not.toContain('session!.user')
  })
})
