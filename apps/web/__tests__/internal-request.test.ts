import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

// A fixed 32+ char secret so the length rule is satisfied for the happy path.
// vi.hoisted so the (hoisted) vi.mock factory can safely reference it.
const { SECRET } = vi.hoisted(() => ({ SECRET: 'x'.repeat(40) }))

vi.mock('@/lib/env', () => ({ env: { ADMIN_API_SECRET: SECRET } }))

import { isValidInternalRequest } from '@/lib/internal-request'

function req(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/v1/admin/notifications/broadcast', {
    method: 'POST',
    headers,
  })
}

const fresh = () => String(Date.now())

describe('isValidInternalRequest — trusted server-to-server auth', () => {
  it('accepts the correct secret with a fresh timestamp', () => {
    expect(isValidInternalRequest(req({ 'x-admin-secret': SECRET, 'x-admin-timestamp': fresh() }))).toBe(true)
  })

  it('rejects a wrong secret of the same length', () => {
    expect(isValidInternalRequest(req({ 'x-admin-secret': 'y'.repeat(40), 'x-admin-timestamp': fresh() }))).toBe(false)
  })

  it('rejects a secret of a different length (no timingSafeEqual throw)', () => {
    expect(isValidInternalRequest(req({ 'x-admin-secret': 'short', 'x-admin-timestamp': fresh() }))).toBe(false)
  })

  it('rejects a missing secret header', () => {
    expect(isValidInternalRequest(req({ 'x-admin-timestamp': fresh() }))).toBe(false)
  })

  it('rejects a missing timestamp', () => {
    expect(isValidInternalRequest(req({ 'x-admin-secret': SECRET }))).toBe(false)
  })

  it('rejects a stale timestamp (older than 5 minutes)', () => {
    const stale = String(Date.now() - 6 * 60 * 1000)
    expect(isValidInternalRequest(req({ 'x-admin-secret': SECRET, 'x-admin-timestamp': stale }))).toBe(false)
  })

  it('rejects a non-numeric timestamp', () => {
    expect(isValidInternalRequest(req({ 'x-admin-secret': SECRET, 'x-admin-timestamp': 'not-a-number' }))).toBe(false)
  })
})
