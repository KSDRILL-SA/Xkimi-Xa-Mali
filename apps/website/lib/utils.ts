import { cn } from '@xxm/utils'
import { siteEnv } from '@/lib/env'

export { cn }

export const APP_URL         = siteEnv.APP_URL
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
  { label: 'Brotherhood',  href: '/#founders',     sectionId: 'founders' },
  { label: 'About',        href: '/about',         sectionId: null },
] as const
