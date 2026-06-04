import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { AppError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>
}

export function withApiHandler<P extends Record<string, string> = Record<string, string>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse>,
): (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse> {
  return async (req, ctx) => {
    const traceId = req.headers.get('x-trace-id') ?? randomUUID()

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
          { error: { code: err.code, message: err.message, traceId } },
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
