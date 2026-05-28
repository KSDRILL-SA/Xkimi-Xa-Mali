import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { APP_URL } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn about Xkimm Xa Mali — a collective financial platform built on trust, brotherhood, and shared wealth.',
}

export default function AboutPage() {
  return (
    <>
      <Navbar />

      <main className="pt-28">
        {/* hero */}
        <section className="relative bg-xxm-green py-20 md:py-28 px-4 overflow-hidden">
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 70% 30%, #D4AF37 0%, transparent 60%)' }}
            aria-hidden
          />
          <div className="relative max-w-screen-md mx-auto text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-8 transition-colors"
            >
              <ArrowLeft size={14} aria-hidden />
              Back to home
            </Link>
            <h1 className="text-4xl md:text-6xl font-black text-white leading-tight mb-5">
              About Xkimm Xa Mali
            </h1>
            <p className="text-white/60 text-lg leading-relaxed max-w-lg mx-auto">
              A collective financial pact built on trust, brotherhood, and a shared vision
              for building generational wealth.
            </p>
          </div>
        </section>

        {/* story */}
        <section className="py-16 md:py-24 px-4 bg-white">
          <div className="max-w-screen-md mx-auto space-y-6 text-gray-600 text-[15px] leading-relaxed">
            <h2 className="text-3xl font-black text-xxm-green-900 mb-8">How it all began</h2>
            <p>
              Xkimm Xa Mali was born from a conversation between four men who shared a common
              frustration: despite earning consistently, individual financial progress felt slow,
              scattered, and unaccountable.
            </p>
            <p>
              They recognised what generations of their people had always known — that money moves
              faster and further when it moves together. Rooted in the age-old African wisdom of
              ubuntu, Xkimm Xa Mali was conceived as something more than ordinary group savings: a
              structured, transparent, technology-powered platform that takes the principle of
              collective financial discipline and gives it the rigour, accountability, and automation
              of a proper financial institution.
            </p>
            <p>
              The name itself is a Tsonga phrase representing the idea of collective financial
              purpose — a pact that money be treated with the seriousness it deserves. What began
              as a WhatsApp group message between four friends has become a fully governed, audited,
              and automated financial collective.
            </p>
          </div>
        </section>

        {/* cta back */}
        <section className="py-16 px-4 bg-xxm-champagne">
          <div className="max-w-sm mx-auto text-center flex flex-col items-center gap-5">
            <h2 className="text-2xl font-black text-xxm-green-900">Already a member?</h2>
            <p className="text-gray-500 text-sm">This is a private, invite-only platform.</p>
            <a
              href={`${APP_URL}/login`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-xxm-green text-white font-bold text-sm hover:bg-xxm-canopy transition-colors shadow-xxm"
            >
              Sign in to your account
              <ArrowRight size={14} aria-hidden />
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
