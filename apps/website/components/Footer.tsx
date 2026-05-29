import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { appHref, WA_LINK } from '@/lib/utils'

const year = new Date().getFullYear()

const links = {
  Platform: [
    { label: 'Features',      href: '/#features' },
    { label: 'How It Works',  href: '/#how-it-works' },
    { label: 'The Mission',   href: '/#mission' },
    { label: 'Brotherhood',   href: '/#founders' },
  ],
  Account: [
    { label: 'Sign In',       href: appHref('/login') },
    { label: 'Member Portal', href: appHref('/dashboard') },
    { label: 'Admin Panel',   href: appHref('/admin') },
  ],
  Legal: [
    { label: 'About',         href: '/about' },
    { label: 'Privacy Policy', href: appHref('/privacy') },
    { label: 'Terms of Service', href: appHref('/terms') },
    { label: 'Support',       href: appHref('/support') },
  ],
}

export function Footer() {
  return (
    <footer className="bg-xxm-green-950 border-t border-white/8" aria-label="Site footer">

      {/* divider gradient */}
      <div className="h-px bg-gradient-to-r from-transparent via-xxm-gold/25 to-transparent" />

      <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 md:gap-12">

          {/* brand column */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            <XmmLogo size={44} showWordmark />

            <p className="text-white/45 text-sm leading-relaxed max-w-xs">
              A private, invite-only collective financial platform built on trust,
              brotherhood, and shared wealth — powered by the African wisdom of ubuntu.
            </p>

            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xxm-gold/70 hover:text-xxm-gold text-sm font-medium transition-colors w-fit"
            >
              <MessageCircle size={15} aria-hidden />
              Join our WhatsApp group
            </a>

            <p className="text-white/20 text-xs">
              A{' '}
              <span className="font-bold text-white/35">KSDRILL-SA</span>
              {' '}platform
            </p>
          </div>

          {/* link columns */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <p className="text-white/35 text-[11px] font-bold tracking-widest uppercase mb-4">
                {group}
              </p>
              <ul className="space-y-2.5">
                {items.map(({ label, href }) => (
                  <li key={label}>
                    {href.startsWith('http') ? (
                      <a
                        href={href}
                        className="text-white/55 hover:text-white text-sm transition-colors duration-200"
                      >
                        {label}
                      </a>
                    ) : (
                      <Link
                        href={href}
                        className="text-white/55 hover:text-white text-sm transition-colors duration-200"
                      >
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* bottom bar */}
      <div className="border-t border-white/6">
        <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/25 text-xs text-center sm:text-left">
            © {year} Xkimm Xa Mali. All rights reserved.
          </p>
          <p className="text-white/20 text-xs italic text-center sm:text-right">
            &ldquo;Contributing · Growing · Securing&rdquo;
          </p>
        </div>
      </div>
    </footer>
  )
}
