import type { NextRequest } from 'next/server'

export function getClientIP(req: NextRequest): string | undefined {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    undefined
  )
}
