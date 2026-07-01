import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Playfair_Display } from 'next/font/google'
import { env } from '@/lib/env'
import { NavigationProgressLoader } from '@/components/NavigationProgressLoader'
import './globals.css'

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
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
