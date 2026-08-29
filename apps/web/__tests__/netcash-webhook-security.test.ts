import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'

// ---------------------------------------------------------------------------
// The Netcash webhook's two-layer defence: HMAC-SHA256 signature (the real
// gate) then an IP allowlist (the backstop — "a second lock a caller can
// pick themselves is not one", per the route's own comment,
// apps/web/app/api/v1/webhooks/netcash/route.ts).
//
// Neither of these had a single test before this file. `mock-gateway.test.ts`
// only covers the mock adapter, which deliberately always returns false for
// both (by design, so a broken real verifier can never hide behind a mock
// that waves everything through) — it says nothing about whether the *real*
// implementation in lib/netcash.ts actually distinguishes an authentic
// Netcash callback from a forged one.
//
// This is document 1's §13.f ("unauthorized webhook request") from
// docs/production-readiness/01-financial-integration-test-plan.md — the one
// webhook-reliability test case that doesn't need a live Netcash account,
// because it's a property of this codebase's own verification logic, not of
// anything Netcash does.
// ---------------------------------------------------------------------------

vi.mock('@/lib/env', () => ({
  env: { NETCASH_WEBHOOK_SECRET: 'test-webhook-secret-do-not-use-in-prod' },
}))

import { verifyWebhookSignature, isAllowedNetcashIp } from '@/lib/netcash'

const REAL_SECRET = 'test-webhook-secret-do-not-use-in-prod'

function hmacHex(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

function hmacBase64(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64')
}

describe('verifyWebhookSignature — is this actually Netcash?', () => {
  const body = JSON.stringify({ transactionRef: 'REF-123', status: 'SUCCESS', amount: 400 })

  it('accepts a correctly-signed body, hex-encoded', () => {
    expect(verifyWebhookSignature(body, hmacHex(body, REAL_SECRET))).toBe(true)
  })

  it('accepts a correctly-signed body, base64-encoded', () => {
    expect(verifyWebhookSignature(body, hmacBase64(body, REAL_SECRET))).toBe(true)
  })

  it('rejects a signature forged with the wrong secret', () => {
    // The attacker doesn't know the real secret and has to guess one —
    // this is the actual attack this whole mechanism defends against.
    expect(verifyWebhookSignature(body, hmacHex(body, 'attacker-guessed-secret'))).toBe(false)
  })

  it('rejects a valid signature applied to a different, tampered body', () => {
    // Proves the signature actually covers the payload content, not just
    // its presence — a signature for one amount/status can't be replayed
    // against a different one.
    const signatureForOriginal = hmacHex(body, REAL_SECRET)
    const tamperedBody = JSON.stringify({ transactionRef: 'REF-123', status: 'SUCCESS', amount: 999999 })
    expect(verifyWebhookSignature(tamperedBody, signatureForOriginal)).toBe(false)
  })

  it('rejects a garbage signature that is neither valid hex nor valid base64', () => {
    expect(verifyWebhookSignature(body, 'not-a-real-signature')).toBe(false)
  })

  it('rejects an empty signature', () => {
    expect(verifyWebhookSignature(body, '')).toBe(false)
  })

  it('rejects a well-formed hex string of the wrong length', () => {
    // Same shape as a real signature (all hex chars) but truncated — must
    // not be accepted just because it superficially looks right.
    expect(verifyWebhookSignature(body, hmacHex(body, REAL_SECRET).slice(0, 32))).toBe(false)
  })
})

describe('isAllowedNetcashIp — the second lock', () => {
  it('accepts a real Netcash IP from the documented default range', () => {
    // apps/web/lib/netcash.ts's DEFAULT_WEBHOOK_IPS — used whenever
    // NETCASH_WEBHOOK_IPS is unset, which is the current production state
    // (see docs/production-readiness/01-financial-integration-test-plan.md
    // §13, and project-deployment-phase memory: the real list has not yet
    // been confirmed with Netcash).
    expect(isAllowedNetcashIp('196.10.1.152')).toBe(true)
  })

  it('rejects an arbitrary attacker IP', () => {
    expect(isAllowedNetcashIp('1.2.3.4')).toBe(false)
  })

  it('rejects an empty IP (e.g. a proxy header that failed to resolve)', () => {
    expect(isAllowedNetcashIp('')).toBe(false)
  })
})
