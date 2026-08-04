import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { env } from '@/lib/env'
import { NavigationProgressLoader } from '@/components/NavigationProgressLoader'
import './globals.css'

const playfairDisplay = {
  variable: '--font-display',
}

/**
 * Every page renders per request.
 *
 * This is the cost of the nonce-based CSP, and it is not optional. The nonce in
 * `Content-Security-Policy` changes on every request, so Next can only stamp it
 * onto its inline bootstrap script while rendering that request. A page
 * prerendered at build time has HTML fixed long before the nonce exists — its
 * inline scripts carry no nonce, the browser refuses them, React never hydrates,
 * and the page renders blank. Which is exactly what happened here: thirteen
 * public pages, `/login` among them, came back as an empty document.
 *
 * Ninety-five of this app's routes were already dynamic — it is an
 * authenticated dashboard behind a session. The thirteen that were not are the
 * public pages, and serving those per request is a far smaller price than
 * leaving `script-src 'unsafe-inline'` on the page where members type their
 * password.
 */
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#1B4332',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title:       { default: 'Xkimm Xa Mali Foundation', template: '%s | Xkimm Xa Mali Foundation' },
  description: 'A collective financial platform built on trust, brotherhood, and shared wealth.',
  metadataBase: new URL(env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  manifest:    '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'XkiMali',
  },
  formatDetection: { telephone: false },
  openGraph: {
    type:        'website',
    siteName:    'Xkimm Xa Mali Foundation',
    title:       'Xkimm Xa Mali Foundation',
    description: 'A collective financial platform built on trust, brotherhood, and shared wealth.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${playfairDisplay.variable}`}>
      <body className="min-h-dvh bg-xxm-champagne antialiased">
        <NavigationProgressLoader />
        {children}
        <script src="/nav-progress.js" defer />
        {/* Register the PWA service worker only in production. In dev a SW that
            caches Next.js chunks serves stale assets and crashes pages after
            load, so we actively unregister it instead. */}
        <script
          src={process.env.NODE_ENV === 'production' ? '/pwa-register.js' : '/pwa-unregister.js'}
          defer
        />
      </body>
    </html>
  )
}
