// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * The public site's navigation.
 *
 * Four defects were found reading this component and all four are pinned below.
 * The first is the one that matters: the mobile overlay was hidden with
 * `opacity-0 pointer-events-none` and `aria-hidden`, which stops a mouse and
 * does nothing whatever to the Tab key. Every link inside stayed in the focus
 * order while invisible, and `aria-hidden` over focusable children is an ARIA
 * violation for precisely that reason — the screen reader stops announcing the
 * menu while focus still travels into it, so a keyboard user tabs into a menu
 * that is not on screen and cannot see where they are.
 *
 * These are the first component tests in this repository. Until the harness
 * landed there was no way to render anything and look at it, which is why a
 * navigation this interactive had no coverage at all.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

vi.mock('@/lib/utils', async (orig) => {
  const actual = await orig<typeof import('@/lib/utils')>()
  return { ...actual, APP_URL: 'http://member.test' }
})

import { Navbar } from '@/components/Navbar'

beforeEach(() => {
  push.mockReset()
  // happy-dom has no IntersectionObserver or ResizeObserver; the component
  // uses both for the active-section underline and the scroll fades.
  vi.stubGlobal('IntersectionObserver', class {
    observe() {} disconnect() {} unobserve() {}
  })
  vi.stubGlobal('ResizeObserver', class {
    observe() {} disconnect() {} unobserve() {}
  })
})
afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

function mobileMenu(): HTMLElement {
  const el = document.getElementById('mobile-menu')
  if (!el) throw new Error('the mobile menu is not in the document at all')
  return el
}

describe('the mobile menu, while closed', () => {
  it('is inert, so nothing inside it can be tabbed to', () => {
    render(<Navbar />)

    // The whole defect in one assertion. `pointer-events-none` would pass a
    // click test and fail a keyboard user.
    expect(mobileMenu().hasAttribute('inert')).toBe(true)
  })

  it('still contains its links — they are removed from focus, not from the DOM', () => {
    render(<Navbar />)

    // Worth stating: the fix is `inert`, not conditional rendering. If someone
    // later swaps to unmounting, this fails and they can decide deliberately.
    expect(within(mobileMenu()).getAllByRole('link', { hidden: true }).length).toBeGreaterThan(0)
  })
})

describe('opening and closing it', () => {
  it('opens on the toggle and is no longer inert', async () => {
    const user = userEvent.setup()
    render(<Navbar />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(mobileMenu().hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeTruthy()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Navbar />)
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    await user.keyboard('{Escape}')

    expect(mobileMenu().hasAttribute('inert')).toBe(true)
  })

  it('stops the page behind it scrolling, and lets it again on close', async () => {
    const user = userEvent.setup()
    render(<Navbar />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('returns focus to the toggle, rather than dropping it at the top of the page', async () => {
    const user = userEvent.setup()
    render(<Navbar />)
    const toggle = screen.getByRole('button', { name: 'Open menu' })

    await user.click(toggle)
    await user.keyboard('{Escape}')

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open menu' }))
  })

  it('points the toggle at the menu it controls', () => {
    render(<Navbar />)

    expect(screen.getByRole('button', { name: 'Open menu' }).getAttribute('aria-controls'))
      .toBe('mobile-menu')
  })
})

describe('what the navigation offers', () => {
  it('gives the primary nav an accessible name', () => {
    render(<Navbar />)

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy()
  })

  it('sends Sign In to the member app, not to a path on this site', () => {
    render(<Navbar />)

    // The marketing site does not host the login. A relative href here would
    // 404 on the public domain.
    const signIn = screen.getAllByRole('link', { name: /sign in/i })[0]
    expect(signIn?.getAttribute('href')).toBe('http://member.test/login')
  })
})
