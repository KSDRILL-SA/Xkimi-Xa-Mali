import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

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
    <html lang="en-ZA" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-xxm-champagne antialiased selection:bg-xxm-gold/30 selection:text-xxm-green-900">
        {children}
      </body>
    </html>
  )
}
