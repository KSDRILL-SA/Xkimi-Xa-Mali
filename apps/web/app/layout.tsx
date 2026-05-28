import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { PWARegister } from '@/components/PWARegister'
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
  title:       { default: 'Xkimm Xa Mali', template: '%s | Xkimm Xa Mali' },
  description: 'A collective financial platform built on trust, brotherhood, and shared wealth.',
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-xxm-champagne antialiased">
        {children}
        <PWARegister />
      </body>
    </html>
  )
}
