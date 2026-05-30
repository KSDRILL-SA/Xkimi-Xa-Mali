import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { AppError } from './errors'
import { logger } from './logger'

export type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
}

export function apiSuccess<T>(data: T, status = 200, pagination?: PaginationMeta) {
  return NextResponse.json(
    {
      data,
      meta: {
        requestId: randomUUID(),
        timestamp: new Date().toISOString(),
        ...(pagination && { pagination }),
      },
    },
    { status },
  )
}

export function apiError(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        traceId: randomUUID(),
      },
    },
    { status },
  )
}

// Single catch-all handler for route error boundaries.
// Reads code/status from AppError; logs and returns 500 for everything else.
export function handleServiceError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    // 4xx are expected domain conditions — don't log as errors
    if (err.status >= 500) {
      logger.error('Service error', { err, code: err.code })
    }
    return apiError(err.code, err.message, err.status)
  }

  logger.error('Unhandled error in API route', { err })
  return apiError('SYS_500', 'An unexpected error occurred', 500)
}
