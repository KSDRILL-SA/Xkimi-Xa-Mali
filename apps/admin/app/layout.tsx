import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import localFont from 'next/font/local'
import NextTopLoader from 'nextjs-toploader'
import { Analytics } from '@vercel/analytics/next'
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

// Both member and marketing apps declare this explicitly; the admin app
// never did. Next.js's own bare default (`width=device-width,
// initial-scale=1`) is close, but without `viewportFit: 'cover'` the safe
// area on a notch/Dynamic-Island phone is unaccounted for, and there's no
// theme-color for the browser chrome.
export const viewport: Viewport = {
  themeColor: '#1B4332',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: { template: '%s — XXM Admin', default: 'XXM Admin' },
  description: 'Xkimi Xa Mali Foundation — Admin Portal',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${playfairDisplay.variable}`}>
      <body>
        <NextTopLoader color="#D4AF37" height={3} showSpinner={false} />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
