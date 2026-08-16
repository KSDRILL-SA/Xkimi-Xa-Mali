// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

/**
 * Proof that the component harness works, kept as a test rather than deleted.
 *
 * Until now this monorepo had no way to render a component and look at what it
 * produced: vitest runs `environment: 'node'` in all three apps and nothing
 * pulled in a DOM. So every "test" of a page was really a test of the logic
 * beside it, and the markup — which on a marketing site is most of what there
 * is — went unchecked.
 *
 * The environment is opted into **per file**, by the docblock at the top rather
 * than in `vitest.config.ts`. Switching the whole app to a DOM would slow every
 * existing test that does not need one, and across the monorepo that is roughly
 * 1 470 of them. A component file asks for a DOM; a service file should not pay
 * for it.
 *
 * This file exists so that a harness failure reads as "the harness is broken"
 * rather than surfacing as a confusing failure inside a real component test.
 */

afterEach(cleanup)

describe('the component harness', () => {
  it('renders an element and finds it by role', () => {
    render(<button type="button">Sign in</button>)

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('exposes the accessible name, not just the text', () => {
    // The distinction matters for everything below: an icon-only control with
    // an aria-label is reachable here and invisible to a text search.
    render(
      <a href="/about" aria-label="Read about the Foundation">
        <span aria-hidden>→</span>
      </a>,
    )

    expect(screen.getByRole('link', { name: 'Read about the Foundation' })).toBeTruthy()
  })

  it('gives components a real document to write into', () => {
    render(<main id="main-content">content</main>)

    expect(document.getElementById('main-content')?.textContent).toBe('content')
  })
})
