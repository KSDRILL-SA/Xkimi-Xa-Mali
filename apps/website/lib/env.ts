import { isLiveDeployment } from '@xxm/utils/deployment'

/**
 * Public config for the marketing site. Everything here is `NEXT_PUBLIC_`, so
 * it is inlined at build time and carries no secrets — this is the one app that
 * holds none.
 *
 * These used to fall back to hardcoded production values: a domain, the
 * WhatsApp group invite, an admin phone number. That is the failure this file
 * now exists to prevent. A fallback that looks like a real value cannot be told
 * apart from one, so a misconfigured deploy published a plausible site pointing
 * at the wrong domain and inviting members through a link nobody had checked
 * was current.
 *
 * On the live deployment every value must be supplied and the build fails
 * naming what is missing. Everywhere else they fall back to localhost and
 * obviously-fake placeholders, so a stray one is self-evidently wrong.
 */

const LIVE = isLiveDeployment()

const PLACEHOLDERS = {
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_ADMIN_URL: 'http://localhost:3002',
  NEXT_PUBLIC_WHATSAPP_GROUP_LINK: 'https://chat.whatsapp.com/not-configured',
  NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER: '27000000000',
} as const

type PublicVar = keyof typeof PLACEHOLDERS

// Next inlines NEXT_PUBLIC_* only for statically analysable member expressions,
// so each one has to be written out in full — `process.env[name]` resolves to
// undefined in the browser bundle.
const RAW: Record<PublicVar, string | undefined> = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
  NEXT_PUBLIC_WHATSAPP_GROUP_LINK: process.env.NEXT_PUBLIC_WHATSAPP_GROUP_LINK,
  NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER,
}

function resolve(): Record<PublicVar, string> {
  const names = Object.keys(PLACEHOLDERS) as PublicVar[]
  // An unset Vercel variable arrives as an empty string rather than undefined.
  const missing = names.filter((name) => !RAW[name]?.trim())

  if (LIVE && missing.length > 0) {
    throw new Error(
      `Missing required public configuration on a production deploy: ${missing.join(', ')}. ` +
        'These are inlined at build time, so they must be set on the Vercel project ' +
        'before the build rather than added to the deployment afterwards.',
    )
  }

  return Object.fromEntries(
    names.map((name) => [name, RAW[name]?.trim() || PLACEHOLDERS[name]]),
  ) as Record<PublicVar, string>
}

const resolved = resolve()

export const siteEnv = {
  SITE_URL: resolved.NEXT_PUBLIC_SITE_URL,
  APP_URL: resolved.NEXT_PUBLIC_APP_URL,
  ADMIN_URL: resolved.NEXT_PUBLIC_ADMIN_URL,
  WA_LINK: resolved.NEXT_PUBLIC_WHATSAPP_GROUP_LINK,
  ADMIN_WA_NUMBER: resolved.NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER,
} as const
