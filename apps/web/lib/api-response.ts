import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

type PaginationMeta = {
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
