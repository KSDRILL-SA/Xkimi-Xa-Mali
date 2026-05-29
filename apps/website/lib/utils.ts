import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { siteEnv } from '@/lib/env'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function normalizeOrigin(url: string) {
  return url.replace(/\/$/, '')
}

export const SITE_URL = siteEnv.SITE_URL
export const APP_URL = siteEnv.APP_URL
export const WA_LINK = siteEnv.WA_LINK

/** Member-portal link; relative when marketing site and app share one origin. */
export function appHref(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const site = normalizeOrigin(SITE_URL)
  const app = normalizeOrigin(APP_URL)
  if (!app || app === site) return p
  return `${app}${p}`
}

export const NAV_LINKS = [
  { label: 'Home',         href: '/',              sectionId: 'hero' },
  { label: 'Features',     href: '/#features',     sectionId: 'features' },
  { label: 'How It Works', href: '/#how-it-works', sectionId: 'how-it-works' },
  { label: 'The Mission',  href: '/#mission',      sectionId: 'mission' },
  { label: 'Brotherhood',  href: '/#founders',     sectionId: 'founders' },
  { label: 'About',        href: '/about',         sectionId: null },
] as const
