import { cn } from '@xxm/utils'
import { siteEnv } from '@/lib/env'

export { cn }

export const SITE_URL        = siteEnv.SITE_URL
export const APP_URL         = siteEnv.APP_URL
export const ADMIN_URL       = siteEnv.ADMIN_URL
export const ADMIN_WA_NUMBER = siteEnv.ADMIN_WA_NUMBER
export const SUPPORT_EMAIL   = siteEnv.SUPPORT_EMAIL

/**
 * A message to an administrator asking to be let in.
 *
 * Deliberately **not** the group's join link. This is a private, invite-only
 * collective: someone who finds this site should be able to ask, and an
 * administrator decides. A join link on a public page lets anyone walk into the
 * group where members discuss their money.
 *
 * The group link is reachable from `siteEnv.WA_LINK` and is deliberately not
 * re-exported here. This function used to fall back to it when no admin number
 * was configured — unreachable in practice, because `lib/env` always resolves
 * that variable to a real value or a placeholder, but it was the join link
 * sitting one config change away from a public page. It is also not a degraded
 * version of asking an administrator; it is the opposite of it.
 */
export function adminWhatsAppUrl(message: string): string {
  return `https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(message)}`
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
