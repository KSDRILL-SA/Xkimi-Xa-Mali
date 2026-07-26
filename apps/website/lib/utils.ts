import { cn } from '@xxm/utils'
import { siteEnv } from '@/lib/env'

export { cn }

export const SITE_URL        = siteEnv.SITE_URL
export const APP_URL         = siteEnv.APP_URL
export const ADMIN_URL       = siteEnv.ADMIN_URL
export const WA_LINK         = siteEnv.WA_LINK
export const ADMIN_WA_NUMBER = siteEnv.ADMIN_WA_NUMBER

export function adminWhatsAppUrl(message: string): string {
  if (ADMIN_WA_NUMBER) {
    return `https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(message)}`
  }
  return WA_LINK
}

export const NAV_LINKS = [
  { label: 'Home',         href: '/',              sectionId: 'hero' },
  { label: 'Features',     href: '/#features',     sectionId: 'features' },
  { label: 'How It Works', href: '/#how-it-works', sectionId: 'how-it-works' },
  { label: 'The Mission',  href: '/#mission',      sectionId: 'mission' },
  // The founders live on /about, not on the home page. sectionId must stay null:
  // a non-null value makes the Navbar render a scroll button instead of a link,
  // and scrollToSection silently does nothing when the element is on another page.
  { label: 'Brotherhood',  href: '/about#founders', sectionId: null },
  { label: 'About',        href: '/about',         sectionId: null },
] as const
