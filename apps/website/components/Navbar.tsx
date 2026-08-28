'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowRight, Menu, X } from 'lucide-react'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { APP_URL, NAV_LINKS } from '@/lib/utils'

export function Navbar() {
  const pathname                       = usePathname()
  const router                         = useRouter()
  const isHome                         = pathname === '/'
  const [atTop, setAtTop]             = useState(true)
  const [hidden, setHidden]           = useState(false)
  const [menuOpen, setMenuOpen]       = useState(false)
  const [activeSection, setActive]    = useState<string>('hero')
  const [showLeftFade, setLeftFade]   = useState(false)
  const [showRightFade, setRightFade] = useState(false)
  const navScrollRef                  = useRef<HTMLDivElement>(null)
  const menuButtonRef                 = useRef<HTMLButtonElement>(null)
  const headerRef                     = useRef<HTMLElement>(null)

  /* ── Publish the header's REAL rendered height ─────────────────────
     `--nav-height` used to be a hardcoded 72px — the top bar's height
     alone. Below `lg:`, this header also renders a second row (the
     horizontal-scroll section pills), which that constant never
     accounted for: `-translate-y-full` only translates by the element's
     *own* box height, so hiding the header on scroll left the second
     row's overflow still visible, overlapping whatever content sat right
     below it — and every page reserving top space via `--nav-height`
     (this file's mobile menu, HeroSection, the About page) under-reserved
     by the same amount. Measuring the actual box and writing it back
     fixes both at once, and adapts automatically per breakpoint since the
     second row simply isn't there above `lg:`. */
  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const publish = () => {
      document.documentElement.style.setProperty('--nav-height', `${el.getBoundingClientRect().height}px`)
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ── Scroll state — visible only when exactly at the top ────────── */
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY === 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── Hide on scroll down, reveal on scroll up ──────────────────────
     Never hide near the top (nothing to reclaim yet, and it would flicker
     in and out as `atTop`'s background toggles), and never hide while the
     mobile menu is open — hiding the bar out from under an open menu would
     strand the close button off-screen. A small threshold on the delta
     stops the header twitching on sub-pixel/momentum scroll events. */
  useEffect(() => {
    let lastY = window.scrollY
    const THRESHOLD = 8
    const REVEAL_ZONE = 96 // px from top where the header always stays put

    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY

      if (menuOpen || y < REVEAL_ZONE) {
        setHidden(false)
      } else if (delta > THRESHOLD) {
        setHidden(true)
      } else if (delta < -THRESHOLD) {
        setHidden(false)
      }

      lastY = y
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [menuOpen])

  /* ── Active section tracking ────────────────────────────────────── */
  useEffect(() => {
    const sections = NAV_LINKS.map((l) => l.sectionId).filter(Boolean) as string[]
    const observers = sections.map((id) => {
      const el = document.getElementById(id)
      if (!el) return null
      const obs = new IntersectionObserver(
        ([e]) => { if (e?.isIntersecting) setActive(id) },
        { threshold: 0.3, rootMargin: '-64px 0px 0px 0px' }
      )
      obs.observe(el)
      return obs
    })
    return () => observers.forEach((o) => o?.disconnect())
  }, [])

  /* ── The overlay menu is a modal, so it behaves like one ─────────
     Escape closes it, the page behind stops scrolling while it is open,
     and focus returns to the button that opened it rather than being
     dropped at the top of the document. */
  useEffect(() => {
    if (!menuOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Captured now rather than read in cleanup: by the time cleanup runs the
    // ref may point somewhere else, and focus would be handed to whatever
    // happened to be there instead of the button the user actually pressed.
    const toggle = menuButtonRef.current

    return () => {
      document.removeEventListener('keydown', onKey)
      // Restore what was there rather than clearing to '', which would
      // undo a lock some other component is still relying on.
      document.body.style.overflow = previousOverflow
      toggle?.focus()
    }
  }, [menuOpen])

  /* ── Mobile nav scroll fades ────────────────────────────────────── */

  const onNavScroll = () => {
    const el = navScrollRef.current
    if (!el) return
    setLeftFade(el.scrollLeft > 12)
    setRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 12)
  }

  /* Measured on mount, not assumed. `showRightFade` used to default to true,
     so on a screen wide enough to show every pill without scrolling, the fade
     sat there permanently hinting at content that was not there. Declared
     after `onNavScroll` deliberately — an effect that calls a `const` defined
     below it reads as fine and is one refactor away from a runtime error. */
  useEffect(() => {
    onNavScroll()
    const el = navScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(onNavScroll)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scrollToSection = (id: string | null) => {
    if (!id) return
    if (!isHome) {
      const link = NAV_LINKS.find((l) => l.sectionId === id)
      router.push(link?.href ?? '/')
      setMenuOpen(false)
      return
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMenuOpen(false)
  }

  return (
    <>
      <header
        ref={headerRef}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          hidden ? '-translate-y-full' : 'translate-y-0'
        } ${
          atTop && isHome
            ? 'bg-transparent'
            : 'bg-xxm-green-950/95 backdrop-blur-md shadow-lg border-b border-white/10'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Fixed to a real pixel height rather than the old `h-full` —
            the header itself no longer declares one (see the
            `useLayoutEffect` above): it now sizes to its actual content,
            this bar plus the mobile pill row below it, so hiding the
            header hides all of it, not just this bar's worth. */}
        <div className="h-[72px] max-w-screen-xl mx-auto px-4 md:px-8 flex items-center justify-between gap-6">

          {/* ── Logo ──────────────────────────────────────────────── */}
          <button
            onClick={() => scrollToSection('hero')}
            className="flex items-center gap-0 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-xl shrink-0 group"
            aria-label="Scroll to top"
          >
            <XmmLogo size={40} showWordmark />
          </button>

          {/* ── Desktop nav ─────────────────────────────────────────
              Hidden on mobile — mobile gets the bottom sheet         */}
          <nav
            className="hidden lg:flex items-center gap-1"
            aria-label="Primary navigation"
          >
            {NAV_LINKS.map(({ label, href, sectionId }) => {
              const isActive = sectionId ? activeSection === sectionId : false
              const linkClass = `gold-underline relative px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold ${
                isActive ? 'text-xxm-gold active' : 'text-white/70 hover:text-white'
              }`
              return sectionId ? (
                <button
                  key={label}
                  onClick={() => scrollToSection(sectionId)}
                  className={linkClass}
                >
                  {label}
                </button>
              ) : (
                <Link key={label} href={href} className={linkClass}>
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* ── Desktop CTA ─────────────────────────────────────────── */}
          <a
            href={`${APP_URL}/login`}
            className="hidden lg:inline-flex btn-primary items-center gap-2 px-5 py-2.5 rounded-xl bg-xxm-gold text-xxm-green-950 text-sm font-bold shadow-gold-sm hover:shadow-gold shrink-0"
          >
            Sign In
            <ArrowRight size={14} aria-hidden />
          </a>

          {/* ── Mobile hamburger ──────────────────────────────────── */}
          <button
            ref={menuButtonRef}
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* ── Mobile: horizontal scroll nav ───────────────────────────
            Always visible below the header bar on small screens        */}
        <div className="lg:hidden border-t border-white/8">
          <div className={`nav-scroll-fade ${showLeftFade ? '' : '[&::before]:opacity-0'} ${showRightFade ? '' : '[&::after]:opacity-0'}`}>
            <div
              ref={navScrollRef}
              onScroll={onNavScroll}
              className="nav-scroll-container flex items-center gap-1 px-4 py-2"
            >
              {NAV_LINKS.map(({ label, href, sectionId }) => {
                const isActive = sectionId ? activeSection === sectionId : false
                const pillClass = `whitespace-nowrap shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold ${
                  isActive
                    ? 'bg-xxm-gold text-xxm-green-950 shadow-gold-sm'
                    : 'text-white/65 hover:text-white hover:bg-white/10'
                }`
                return sectionId ? (
                  <button
                    key={label}
                    onClick={() => scrollToSection(sectionId)}
                    className={pillClass}
                  >
                    {label}
                  </button>
                ) : (
                  <Link key={label} href={href} className={pillClass}>
                    {label}
                  </Link>
                )
              })}

              {/* Sign In pill at end of scroll */}
              <a
                href={`${APP_URL}/login`}
                className="whitespace-nowrap shrink-0 ml-2 px-4 py-1.5 rounded-full text-xs font-bold bg-xxm-gold/20 text-xxm-gold border border-xxm-gold/30 hover:bg-xxm-gold hover:text-xxm-green-950 transition-all duration-200"
              >
                Sign In →
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile full-screen overlay menu ─────────────────────────── */}
      {/* `inert` while closed, which is the whole point.

          This was `opacity-0 pointer-events-none` with `aria-hidden`.
          `pointer-events-none` stops a mouse and does nothing to the Tab key,
          so every link in here stayed focusable while invisible — and
          `aria-hidden` over focusable children is an ARIA violation for
          exactly that reason: the screen reader stops announcing the menu
          while focus still travels into it, and the user is left tabbing
          through something that is not on screen.

          `inert` removes the whole subtree from focus order and the
          accessibility tree together, which is the one attribute that makes
          those two agree. */}
      <div
        id="mobile-menu"
        className={`fixed inset-0 z-40 lg:hidden transition-all duration-400 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        inert={!menuOpen}
      >
        {/* backdrop */}
        <div
          className="absolute inset-0 bg-xxm-green-950/95 backdrop-blur-xl"
          onClick={() => setMenuOpen(false)}
        />

        {/* panel */}
        <div
          className={`absolute inset-x-0 top-0 bottom-0 flex flex-col p-8 transition-transform duration-400 ${
            menuOpen ? 'translate-y-0' : '-translate-y-full'
          }`}
          style={{ paddingTop: 'calc(var(--nav-height) + 1.5rem)' }}
        >
          <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
            {NAV_LINKS.map(({ label, href, sectionId }, i) => {
              // `animate-fade-in-up` re-plays every time `menuOpen` flips true — a
              // fresh `key` per open would work too, but this class already exists
              // and reads correctly: the panel opens, then each item drops in.
              const itemClass = menuOpen
                ? "text-left px-4 py-4 rounded-2xl text-xl font-bold text-white/80 hover:text-white hover:bg-white/8 active:bg-white/12 transition-colors duration-200 outline-none animate-fade-in-up"
                : "text-left px-4 py-4 rounded-2xl text-xl font-bold text-white/80 hover:text-white hover:bg-white/8 active:bg-white/12 transition-colors duration-200 outline-none opacity-0"
              return sectionId ? (
                <button
                  key={label}
                  onClick={() => scrollToSection(sectionId)}
                  className={itemClass}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {label}
                </button>
              ) : (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={itemClass}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          <div
            className={`mt-auto pt-8 border-t border-white/10 flex flex-col gap-3 ${menuOpen ? 'animate-fade-in-up' : 'opacity-0'}`}
            style={{ animationDelay: `${NAV_LINKS.length * 60}ms` }}
          >
            <a
              href={`${APP_URL}/login`}
              className="btn-primary flex items-center justify-center gap-2 py-4 rounded-2xl bg-xxm-gold text-xxm-green-950 text-base font-bold shadow-gold active:scale-[0.98] transition-transform"
              onClick={() => setMenuOpen(false)}
            >
              Sign In to Your Account
              <ArrowRight size={16} aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
