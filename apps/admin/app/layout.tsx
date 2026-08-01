import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import localFont from 'next/font/local'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'

const playfairDisplay = localFont({
  src: [
    { path: '../../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-800-normal.woff2', weight: '800', style: 'normal' },
    { path: '../../../node_modules/@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { template: '%s — XXM Admin', default: 'XXM Admin' },
  description: 'Xkimm Xa Mali Foundation — Admin Portal',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${playfairDisplay.variable}`}>
      <body>
        <NextTopLoader color="#D4AF37" height={3} showSpinner={false} />
        {children}
      </body>
    </html>
  )
}
