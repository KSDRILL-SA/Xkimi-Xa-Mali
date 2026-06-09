import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import dynamic from 'next/dynamic'
import { env } from '@/lib/env'
import './globals.css'

// Client-only: loads after hydration so the module factory is never
// executed during the synchronous SSR/hydration pass.
const NavigationProgress = dynamic(
  () => import('@/components/NavigationProgress').then(m => m.NavigationProgress),
  { ssr: false },
)

export const viewport: Viewport = {
  themeColor: '#1B4332',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title:       { default: 'Xkimm Xa Mali', template: '%s | Xkimm Xa Mali' },
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
    siteName:    'Xkimm Xa Mali',
    title:       'Xkimm Xa Mali',
    description: 'A collective financial platform built on trust, brotherhood, and shared wealth.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-xxm-champagne antialiased">
        <NavigationProgress />
        {children}
        <script src="/nav-progress.js" defer />
        <script src="/pwa-register.js" defer />
      </body>
    </html>
  )
}
