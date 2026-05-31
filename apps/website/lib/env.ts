/* Public env vars for the website app.
   All NEXT_PUBLIC_ so they're available in client components. */
export const siteEnv = {
  SITE_URL:        process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xkimimamali.co.za',
  APP_URL:         process.env.NEXT_PUBLIC_APP_URL  ?? 'https://app.xkimimamali.co.za',
  ADMIN_URL:       process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://admin.xkimimamali.co.za',
  WA_LINK:         process.env.NEXT_PUBLIC_WHATSAPP_GROUP_LINK ?? 'https://chat.whatsapp.com/EMFpa8pjiiCLHhO8Eg8pCb',
  ADMIN_WA_NUMBER: process.env.NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER ?? '27810780859',
} as const
