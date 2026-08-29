import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { siteEnv } from '@/lib/env'
import './globals.css'

/**
 * Self-hosted rather than fetched from Google at build time.
 *
 * `next/font/google` downloads the file during the build, which makes every
 * build depend on `fonts.googleapis.com` being reachable. On 2026-08-15 it was
 * not reachable from GitHub's runners and two consecutive CI runs failed on it,
 * having passed every other step. See `packages/ui/fonts/README.md`.
 *
 * One file covers 700 through 900 because Playfair Display is a variable font;
 * `weight` states the range rather than a list, which is what tells Next it may
 * synthesise the weights in between rather than treating 800 as missing.
 */
const playfairDisplay = localFont({
  src: '../../../packages/ui/fonts/playfair-display-latin.woff2',
  weight: '700 900',
  variable: '--font-display',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#1B4332',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    default: 'Xkimi Xa Mali Foundation — Contributing. Growing. Securing.',
    template: '%s | Xkimi Xa Mali Foundation',
  },
  description:
    'Xkimi Xa Mali Foundation is a private, invite-only collective financial platform built on trust, brotherhood, and shared wealth — powered by the African wisdom of ubuntu.',
  metadataBase: new URL(siteEnv.SITE_URL),
  keywords: ['savings group', 'stokvel', 'collective savings', 'South Africa', 'financial platform'],
  authors: [{ name: 'KSDRILL-SA' }],
  openGraph: {
    type: 'website',
    siteName: 'Xkimi Xa Mali Foundation',
    title: 'Xkimi Xa Mali Foundation — Contributing. Growing. Securing.',
    description:
      'A private, invite-only collective financial platform built on trust, brotherhood, and shared wealth.',
    locale: 'en_ZA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Xkimi Xa Mali Foundation',
    description: 'A collective financial platform built on trust, brotherhood, and shared wealth.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${GeistSans.variable} ${GeistMono.variable} ${playfairDisplay.variable}`}>
      <body className="min-h-dvh bg-xxm-champagne antialiased selection:bg-xxm-gold/30 selection:text-xxm-green-900">
        {/* First focusable element on the page. WCAG 2.4.1 (Bypass Blocks) is
            a Level A requirement, and this site has a nav of seven items ahead
            of its content — a keyboard or screen-reader visitor had to walk all
            of them on every page. The member and admin apps get this from
            `packages/ui`'s AppHeader; this app has its own Navbar and so had
            the target (`#main-content`) with nothing pointing at it. */}
        <a href="#main-content" className="skip-to-main">Skip to main content</a>
        {children}
        <Analytics />
        <script src="/nav-progress.js" defer />
      </body>
    </html>
  )
}
