import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Navbar } from '@/components/Navbar'
import { HeroSection } from '@/components/sections/HeroSection'
import { StatsSection } from '@/components/sections/StatsSection'
import { FeaturesSection } from '@/components/sections/FeaturesSection'
import { HowItWorksSection } from '@/components/sections/HowItWorksSection'
import { MissionSection } from '@/components/sections/MissionSection'
import { CTASection } from '@/components/sections/CTASection'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Xkimm Xa Mali Foundation — Contributing. Growing. Securing.',
}

function StatsFallback() {
  return (
    <div className="bg-xxm-green py-16 md:py-20" aria-hidden>
      <div className="max-w-screen-xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/8 animate-pulse">
              <div className="h-12 w-16 rounded-lg bg-white/10" />
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="h-2.5 w-20 rounded bg-white/8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main id="main-content">
        <HeroSection />
        <Suspense fallback={<StatsFallback />}>
          <StatsSection />
        </Suspense>
        <FeaturesSection />
        <HowItWorksSection />
        <MissionSection />
        <CTASection />
      </main>

      <Footer />
    </>
  )
}
