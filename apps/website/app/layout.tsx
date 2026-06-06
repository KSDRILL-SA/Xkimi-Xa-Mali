import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'

export const viewport: Viewport = {
  themeColor: '#1B4332',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    default: 'Xkimm Xa Mali — Contributing. Growing. Securing.',
    template: '%s | Xkimm Xa Mali',
  },
  description:
    'Xkimm Xa Mali is a private, invite-only collective financial platform built on trust, brotherhood, and shared wealth — powered by the African wisdom of ubuntu.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xkimimamali.co.za'),
  keywords: ['savings group', 'stokvel', 'collective savings', 'South Africa', 'financial platform'],
  authors: [{ name: 'KSDRILL-SA' }],
  openGraph: {
    type: 'website',
    siteName: 'Xkimm Xa Mali',
    title: 'Xkimm Xa Mali — Contributing. Growing. Securing.',
    description:
      'A private, invite-only collective financial platform built on trust, brotherhood, and shared wealth.',
    locale: 'en_ZA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Xkimm Xa Mali',
    description: 'A collective financial platform built on trust, brotherhood, and shared wealth.',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-xxm-champagne antialiased selection:bg-xxm-gold/30 selection:text-xxm-green-900">
        <NextTopLoader color="#D4AF37" height={3} showSpinner={false} />
        {children}
      </body>
    </html>
  )
}
