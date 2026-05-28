import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'

const startTime = Date.now()

export async function GET() {
  const checks = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    redis.ping(),
  ])

  const dbOk    = checks[0].status === 'fulfilled'
  const redisOk = checks[1].status === 'fulfilled'
  const allOk   = dbOk && redisOk

  return NextResponse.json(
    {
      status:  allOk ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime:  Math.floor((Date.now() - startTime) / 1000),
      checks: {
        db:    dbOk    ? 'ok' : 'error',
        redis: redisOk ? 'ok' : 'error',
      },
      ts: new Date().toISOString(),
    },
    {
      status: allOk ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
