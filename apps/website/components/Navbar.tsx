'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { APP_URL, NAV_LINKS } from '@/lib/utils'

export function Navbar() {
  const [atTop, setAtTop]             = useState(true)
  const [menuOpen, setMenuOpen]       = useState(false)
  const [activeSection, setActive]    = useState<string>('hero')
  const [showLeftFade, setLeftFade]   = useState(false)
  const [showRightFade, setRightFade] = useState(true)
  const navScrollRef                  = useRef<HTMLDivElement>(null)

  /* ── Scroll state — visible only when exactly at the top ────────── */
  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY === 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* ── Active section tracking ────────────────────────────────────── */
  useEffect(() => {
    const sections = NAV_LINKS.map((l) => l.sectionId).filter(Boolean) as string[]
    const observers = sections.map((id) => {
      const el = document.getElementById(id)
      if (!el) return null
      const obs = new IntersectionObserver(
        ([e]) => { if (e.isIntersecting) setActive(id) },
        { threshold: 0.3, rootMargin: '-64px 0px 0px 0px' }
      )
      obs.observe(el)
      return obs
    })
    return () => observers.forEach((o) => o?.disconnect())
  }, [])

  /* ── Mobile nav scroll fades ────────────────────────────────────── */
  const onNavScroll = () => {
    const el = navScrollRef.current
    if (!el) return
    setLeftFade(el.scrollLeft > 12)
    setRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 12)
  }

  const scrollToSection = (id: string | null) => {
    if (!id) return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMenuOpen(false)
  }

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          atTop
            ? 'bg-transparent'
            : 'bg-xxm-green-950/95 backdrop-blur-md shadow-lg border-b border-white/10'
        }`}
        style={{ height: 'var(--nav-height)' }}
      >
        <div className="h-full max-w-screen-xl mx-auto px-4 md:px-8 flex items-center justify-between gap-6">

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
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
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
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-all duration-400 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!menuOpen}
      >
        {/* backdrop */}
        <div
          className="absolute inset-0 bg-xxm-green-950/95 backdrop-blur-xl"
          onClick={() => setMenuOpen(false)}
        />

        {/* panel */}
        <div
          className={`absolute inset-x-0 top-0 bottom-0 flex flex-col p-8 pt-24 transition-transform duration-400 ${
            menuOpen ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
            {NAV_LINKS.map(({ label, href, sectionId }, i) => {
              const itemClass = "text-left px-4 py-4 rounded-2xl text-xl font-bold text-white/80 hover:text-white hover:bg-white/8 transition-all duration-200 outline-none"
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

          <div className="mt-auto pt-8 border-t border-white/10 flex flex-col gap-3">
            <a
              href={`${APP_URL}/login`}
              className="btn-primary flex items-center justify-center gap-2 py-4 rounded-2xl bg-xxm-gold text-xxm-green-950 text-base font-bold shadow-gold"
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
