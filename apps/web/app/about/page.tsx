import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { env } from '@/lib/env'

/**
 * The About page lived here as a full, independent copy — its own founders
 * array, pillars, and values, none of it sourced from anywhere shared. The
 * public website (`apps/website/app/about/page.tsx`) carries the canonical
 * version, built from the same `founders.ts` its own Hero backdrop uses so
 * the two can never drift from each other. This copy had no such guarantee
 * against either of them, and every past product-copy fix (the "Xkimm" typo,
 * the FACTS-derived claims work) had to remember this page existed too.
 *
 * One canonical page, reached from here by redirect, removes the drift
 * risk instead of requiring discipline to avoid it.
 */
export default function AboutPage() {
  redirect(`${env.NEXT_PUBLIC_SITE_URL}/about` as Route)
}
