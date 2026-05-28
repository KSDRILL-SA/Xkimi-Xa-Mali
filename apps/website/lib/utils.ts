import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { siteEnv } from '@/lib/env'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const APP_URL = siteEnv.APP_URL
export const WA_LINK = siteEnv.WA_LINK

export const NAV_LINKS = [
  { label: 'Home',         href: '/',              sectionId: 'hero' },
  { label: 'Features',     href: '/#features',     sectionId: 'features' },
  { label: 'How It Works', href: '/#how-it-works', sectionId: 'how-it-works' },
  { label: 'The Mission',  href: '/#mission',      sectionId: 'mission' },
  { label: 'Brotherhood',  href: '/#founders',     sectionId: 'founders' },
  { label: 'About',        href: '/about',         sectionId: null },
] as const
