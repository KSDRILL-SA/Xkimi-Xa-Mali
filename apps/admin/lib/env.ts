import { z } from 'zod'

const schema = z.object({
  DATABASE_URL:    z.string().url(),
  AUTH_SECRET:     z.string().min(32),
  NEXTAUTH_URL:    z.string().url().optional(),
  NODE_ENV:        z.enum(['development', 'test', 'production']).default('development'),

  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN:      z.string().optional(),
  SENTRY_ORG:             z.string().optional(),
  SENTRY_PROJECT:         z.string().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Invalid admin environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data
