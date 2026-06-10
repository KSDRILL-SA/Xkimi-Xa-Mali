import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Playfair_Display } from 'next/font/google'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { template: '%s — XXM Admin', default: 'XXM Admin' },
  description: 'Xkimm Xa Mali — Admin Portal',
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
