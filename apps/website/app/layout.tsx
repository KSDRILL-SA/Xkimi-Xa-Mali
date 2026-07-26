import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Playfair_Display } from 'next/font/google'
import { siteEnv } from '@/lib/env'
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
  title: {
    default: 'Xkimm Xa Mali Foundation — Contributing. Growing. Securing.',
    template: '%s | Xkimm Xa Mali Foundation',
  },
  description:
    'Xkimm Xa Mali Foundation is a private, invite-only collective financial platform built on trust, brotherhood, and shared wealth — powered by the African wisdom of ubuntu.',
  metadataBase: new URL(siteEnv.SITE_URL),
  keywords: ['savings group', 'stokvel', 'collective savings', 'South Africa', 'financial platform'],
  authors: [{ name: 'KSDRILL-SA' }],
  openGraph: {
    type: 'website',
    siteName: 'Xkimm Xa Mali Foundation',
    title: 'Xkimm Xa Mali Foundation — Contributing. Growing. Securing.',
    description:
      'A private, invite-only collective financial platform built on trust, brotherhood, and shared wealth.',
    locale: 'en_ZA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Xkimm Xa Mali Foundation',
    description: 'A collective financial platform built on trust, brotherhood, and shared wealth.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${GeistSans.variable} ${GeistMono.variable} ${playfairDisplay.variable}`}>
      <body className="min-h-dvh bg-xxm-champagne antialiased selection:bg-xxm-gold/30 selection:text-xxm-green-900">
        {children}
        <script src="/nav-progress.js" defer />
      </body>
    </html>
  )
}
