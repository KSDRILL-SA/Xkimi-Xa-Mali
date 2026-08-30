import { describe, it, expect, vi } from 'vitest'

// notification.service pulls in the validated env module and the db/provider
// clients at import time; none of that is involved in the pure hashing
// function under test, so it is stubbed out rather than configured.
vi.mock('@/lib/env', () => ({
  env: {
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_EMAIL: 'noreply@xxm.test',
    BULKSMS_USERNAME: 'test',
    BULKSMS_PASSWORD: 'test',
  },
}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/integrations/sms', () => ({ smsProvider: { send: vi.fn() } }))
vi.mock('@/integrations/email', () => ({ emailProvider: {} }))
vi.mock('@/repositories/notification.repository', () => ({ notificationRepo: {} }))
vi.mock('@/repositories/user.repository', () => ({ userRepo: {} }))

import { shortSuppliedId } from '@/services/notification.service'

/**
 * BulkSMS rejects the entire message when `userSuppliedId` exceeds 20
 * characters — it does not truncate, it 400s.
 *
 * This limit has now been violated three separate times in three different
 * places, each found only after the messages had been failing silently in
 * production for a while:
 *
 *   1. the notification path (25-char cuid), fixed 2026-08-29
 *   2. the phone-change warning SMS (`phone-change-<cuid>-<timestamp>`, ~51),
 *      which surfaced only as a recurring Sentry warning
 *   3. every invite SMS (`invite-<cuid>`, 32), swallowed by a `.catch`
 *
 * Each site failed quietly because all three deliberately never throw — the
 * member must not be blocked from changing their number, and an admin must not
 * be blocked from inviting someone, because an SMS gateway misbehaved. Correct
 * behaviour, but it means the length limit has no natural alarm. This test is
 * that alarm.
 */
const BULKSMS_SUPPLIED_ID_MAX = 20

describe('shortSuppliedId', () => {
  it('never exceeds the BulkSMS limit, whatever it is handed', () => {
    const inputs = [
      'cmte4f48o0006ib045r783zg1',
      `phone-change-cmte4f48o0006ib045r783zg1-${Date.now()}`,
      'invite-cmte4f48o0006ib045r783zg1',
      'x',
      'a'.repeat(500),
    ]
    for (const input of inputs) {
      expect(shortSuppliedId(input).length).toBeLessThanOrEqual(BULKSMS_SUPPLIED_ID_MAX)
    }
  })

  it('is deterministic — the same input always yields the same id', () => {
    // Recovery depends on this: BulkSMS deduplicates a resend after a worker
    // crash by this value, so a re-dispatch of the same notification must
    // produce the id the provider already saw.
    const id = 'cmte4f48o0006ib045r783zg1'
    expect(shortSuppliedId(id)).toBe(shortSuppliedId(id))
  })

  it('distinguishes inputs that share a long prefix', () => {
    // Cuids share a timestamp-ish prefix, which is exactly why truncation was
    // rejected in favour of hashing: the first 20 characters of two ids
    // minted in the same moment can collide.
    const a = shortSuppliedId('phone-change-cmte4f48o0006ib045r783zg1-1756500000000')
    const b = shortSuppliedId('phone-change-cmte4f48o0006ib045r783zg1-1756500000001')
    expect(a).not.toBe(b)
  })

  it('REGRESSION: the raw ids these call sites used to send were over the limit', () => {
    // Proves the fix addresses a real violation rather than passing for an
    // unrelated reason — each of these is what was actually being sent.
    const userId = 'cmte4f48o0006ib045r783zg1'
    expect(`phone-change-${userId}-${Date.now()}`.length).toBeGreaterThan(BULKSMS_SUPPLIED_ID_MAX)
    expect(`invite-${userId}`.length).toBeGreaterThan(BULKSMS_SUPPLIED_ID_MAX)
    expect(userId.length).toBeGreaterThan(BULKSMS_SUPPLIED_ID_MAX)
  })
})
