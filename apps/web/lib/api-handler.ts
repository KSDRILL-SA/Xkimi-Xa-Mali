import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { apiRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'

export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>
}

export type ApiHandlerOptions = {
  // Webhooks are authenticated by HMAC/IP and driven by an external provider —
  // per-IP limiting would drop legitimate deliveries under load, so they opt out.
  rateLimit?: boolean
}

// State-changing methods get the general per-IP limit (SEC-S05: 60 req/min).
// Reads are excluded; routes with stricter needs (auth) also apply their own.
const RATE_LIMITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function withApiHandler<P extends Record<string, string> = Record<string, string>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse>,
  options: ApiHandlerOptions = {},
): (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse> {
  return async (req, ctx) => {
    const traceId = req.headers.get('x-trace-id') ?? randomUUID()

    if (options.rateLimit !== false && RATE_LIMITED_METHODS.has(req.method)) {
      const ip = getClientIP(req) ?? 'unknown'
      const { success } = await apiRatelimit.limit(ip)
      if (!success) {
        return NextResponse.json(
          { error: { code: 'SYS_005', message: 'Too many requests. Please try again shortly.', traceId } },
          { status: 429, headers: { 'x-trace-id': traceId } },
        )
      }
    }

    try {
      const response = await handler(req, ctx)
      response.headers.set('x-trace-id', traceId)
      return response
    } catch (err) {
      if (err instanceof AppError) {
        logger.warn('Application error', {
          code: err.code,
          message: err.message,
          status: err.status,
          traceId,
          path: req.nextUrl.pathname,
        })
        return NextResponse.json(
          {
            error: {
              code: err.code,
              message: err.message,
              traceId,
              ...(err.details ? { details: err.details } : {}),
            },
          },
          { status: err.status, headers: { 'x-trace-id': traceId } },
        )
      }

      logger.error('Unhandled API error', {
        err,
        traceId,
        path: req.nextUrl.pathname,
        method: req.method,
      })

      return NextResponse.json(
        { error: { code: 'SYS_500', message: 'An unexpected error occurred', traceId } },
        { status: 500, headers: { 'x-trace-id': traceId } },
      )
    }
  }
}
