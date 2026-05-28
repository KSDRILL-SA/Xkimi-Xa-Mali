import type { Metadata } from 'next'
import { Navbar } from '@/components/Navbar'
import { HeroSection } from '@/components/sections/HeroSection'
import { StatsSection } from '@/components/sections/StatsSection'
import { FeaturesSection } from '@/components/sections/FeaturesSection'
import { HowItWorksSection } from '@/components/sections/HowItWorksSection'
import { MissionSection } from '@/components/sections/MissionSection'
import { FoundersSection } from '@/components/sections/FoundersSection'
import { CTASection } from '@/components/sections/CTASection'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Xkimm Xa Mali — Contributing. Growing. Securing.',
}

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main id="main-content">
        <HeroSection />
        <StatsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <MissionSection />
        <FoundersSection />
        <CTASection />
      </main>

      <Footer />
    </>
  )
}
