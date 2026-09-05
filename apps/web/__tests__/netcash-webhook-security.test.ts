import { describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
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


// ---------------------------------------------------------------------------
// The allowlist is a security control that can become a reliability hazard.
//
// It is four addresses the provider chose, and providers move infrastructure.
// If Netcash moves, every settlement notification arrives at a 403 — and the
// only trace was a `logger.warn` in a log nobody is reading, while members'
// payments quietly stopped being recorded as settled. Silence on the money path
// is the failure this repository keeps rediscovering.
//
// Asserted against the route's source rather than by driving the handler: the
// value here is that the alert cannot be dropped by a later edit, and pinning
// that does not need the whole webhook mock surface stood up. What the alert
// does once raised is `alert.service`'s own tested behaviour.
// ---------------------------------------------------------------------------

describe('a refused webhook is not silent', () => {
  const route = () => {
    const { readFileSync } = fs
    return readFileSync(path.resolve(__dirname, '../app/api/v1/webhooks/netcash/route.ts'), 'utf8')
  }

  it('raises an operational alert when the IP is refused', () => {
    const src = route()

    expect(src).toContain('WEBHOOK_IP_REFUSED')
    expect(src).toMatch(/raiseOperationalAlert\(/)
  })

  it('treats it as critical, because settlements stop while it lasts', () => {
    const src = route()
    const alert = src.slice(src.indexOf('WEBHOOK_IP_REFUSED'), src.indexOf('WEBHOOK_IP_REFUSED') + 200)

    expect(alert).toContain("severity: 'critical'")
  })

  it('names the variable that fixes it', () => {
    // An alert that says something is wrong and not what to do about it costs
    // the reader the one thing they needed at 2am.
    expect(route()).toContain('NETCASH_WEBHOOK_IPS')
  })

  it('does not let a failed alert swallow the refusal', () => {
    // The 403 still has to happen if the alert cannot be sent.
    const src = route()
    const block = src.slice(src.indexOf('isAllowedWebhookIp'))

    expect(block).toMatch(/\.catch\(/)
    expect(block).toContain("status: 403")
  })
})
