import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis, REDIS_CONFIGURED } from '@/lib/redis'

const startTime = Date.now()

export async function GET() {
  const checks = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    // Only a genuinely-configured Redis is pinged. The no-op client returns
    // 'PONG' unconditionally, so pinging it would falsely report "ok".
    REDIS_CONFIGURED ? redis.ping() : Promise.resolve('skipped'),
  ])

  const dbOk = checks[0].status === 'fulfilled'
  // Distinguish reachable, unreachable, and deliberately-unconfigured so a
  // production deploy missing the Upstash env is visible instead of green.
  const redisStatus = !REDIS_CONFIGURED
    ? 'not_configured'
    : checks[1].status === 'fulfilled'
      ? 'ok'
      : 'error'

  // The DB is always required. A configured-but-unreachable Redis is a real
  // outage; an unconfigured Redis is a config state that does not fail health,
  // but is surfaced in the body so monitors can alert on it.
  const healthy = dbOk && redisStatus !== 'error'

  return NextResponse.json(
    {
      status:  healthy ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime:  Math.floor((Date.now() - startTime) / 1000),
      checks: {
        db:    dbOk ? 'ok' : 'error',
        redis: redisStatus,
      },
      ts: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
