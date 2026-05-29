import { PrismaClient, Prisma } from '@prisma/client'

export { Prisma }

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['error'],
    // Neon serverless: single connection per Lambda invocation.
    // The DATABASE_URL should already include ?pgbouncer=true when using Neon's
    // pooled connection string, so no extra datasource config needed here.
  })
}

// Global singleton prevents exhausting the DB connection pool during
// Next.js hot-module reloads in development.
export const db: PrismaClient = globalThis.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = db
}

// Graceful shutdown — prevents lingering connections in test environments.
if (process.env.NODE_ENV === 'test') {
  process.on('beforeExit', async () => {
    await db.$disconnect()
  })
}
