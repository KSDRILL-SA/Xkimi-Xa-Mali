import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.xkimimamali.co.za'

export const NAV_LINKS = [
  { label: 'Home',         href: '/',            sectionId: 'hero' },
  { label: 'Features',     href: '/#features',   sectionId: 'features' },
  { label: 'How It Works', href: '/#how-it-works', sectionId: 'how-it-works' },
  { label: 'The Mission',  href: '/#mission',    sectionId: 'mission' },
  { label: 'Brotherhood',  href: '/#founders',   sectionId: 'founders' },
  { label: 'About',        href: '/about',       sectionId: null },
] as const
