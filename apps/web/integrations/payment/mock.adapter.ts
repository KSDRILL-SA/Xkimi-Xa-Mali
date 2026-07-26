import { createHash } from 'crypto'
import type {
  IPaymentGateway,
  CreateMandatePayload,
  MandateResponse,
  MandateStatusResponse,
  MandateUpdateChanges,
  DebitPayload,
  DebitResponse,
} from './types'

/**
 * A stand-in for Netcash, for development and for tests that need to walk the
 * whole money path.
 *
 * There was no way to exercise a payment end to end without charging a real
 * card: the gateway always talked to Netcash, so the one leg that matters most —
 * a member actually paying — was the one leg nothing could cover. This closes
 * that, and it does so deterministically, so a test can ask for a decline and
 * get one.
 *
 * It moves no money and must never be mistaken for something that does. See the
 * guard in ./index.ts: selecting this in production is a boot failure, not a
 * warning.
 *
 * ── Deterministic outcomes ──────────────────────────────────────────────────
 * The result is derived from the idempotency key rather than from a random
 * number, so the same request always produces the same answer and a failing test
 * fails again on the next run. Reference numbers steer the outcome:
 *
 *   …anything…          SUCCESS
 *   contains DECLINE    FAILED, insufficient funds
 *   contains PENDING    PENDING, settles later by webhook
 *   contains ERROR      throws, for testing the unhappy path
 */

const DECLINE_REASON = 'Insufficient funds'

function refFrom(prefix: string, seed: string): string {
  return `${prefix}-${createHash('sha256').update(seed).digest('hex').slice(0, 12).toUpperCase()}`
}

function outcomeFor(payload: DebitPayload): DebitResponse {
  const marker = `${payload.reference} ${payload.idempotencyKey}`.toUpperCase()

  if (marker.includes('ERROR')) {
    throw new Error('mock gateway: simulated gateway outage')
  }
  if (marker.includes('DECLINE')) {
    return {
      status: 'FAILED',
      transactionRef: refFrom('MOCKTX', payload.idempotencyKey),
      reason: DECLINE_REASON,
      errorCode: 'MOCK_DECLINED',
    }
  }
  if (marker.includes('PENDING')) {
    return { status: 'PENDING', transactionRef: refFrom('MOCKTX', payload.idempotencyKey) }
  }
  return { status: 'SUCCESS', transactionRef: refFrom('MOCKTX', payload.idempotencyKey) }
}

export const mockGateway: IPaymentGateway = {
  async createMandate(payload: CreateMandatePayload): Promise<MandateResponse> {
    // Netcash returns PENDING and confirms by webhook; mirroring that is the
    // point, since the code under test has to handle the wait.
    return {
      mandateId: refFrom('MOCKMND', `${payload.referenceNumber}:${payload.accountNumber}`),
      status: 'PENDING',
      message: 'mock gateway: mandate accepted, awaiting authorisation',
    }
  },

  async cancelMandate(mandateId: string): Promise<MandateResponse> {
    return { mandateId, status: 'CANCELLED' }
  },

  async updateMandate(mandateId: string, _changes: MandateUpdateChanges, _effectiveDate: string): Promise<MandateResponse> {
    return { mandateId, status: 'ACTIVE' }
  },

  async delayMandate(mandateId: string, _newDate: string): Promise<MandateResponse> {
    return { mandateId, status: 'ACTIVE' }
  },

  async getMandateStatus(mandateId: string): Promise<MandateStatusResponse> {
    return { mandateId, status: 'ACTIVE' }
  },

  async submitOnceOffDebit(payload: DebitPayload): Promise<DebitResponse> {
    return outcomeFor(payload)
  },

  async submitScheduledDebit(payload: DebitPayload): Promise<DebitResponse> {
    return outcomeFor(payload)
  },

  // The mapping and date rules below are shared with the real adapter on
  // purpose: a test that exercised different rules from production would be
  // testing the mock.
  mapTransactionStatus(raw: string) {
    const map: Record<string, 'SUCCESS' | 'FAILED' | 'REVERSED'> = {
      SUCCESS: 'SUCCESS', FAILED: 'FAILED', REVERSED: 'REVERSED',
    }
    return map[raw.toUpperCase()] ?? null
  },

  mapMandateStatus(raw: string) {
    const map: Record<string, 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'> = {
      PENDING: 'PENDING', AUTHORIZED: 'ACTIVE', ACTIVE: 'ACTIVE',
      SUSPENDED: 'SUSPENDED', REJECTED: 'SUSPENDED', CANCELLED: 'CANCELLED',
    }
    return map[raw.toUpperCase()] ?? 'PENDING'
  },

  /**
   * Always false. A mock must not be able to wave a forged webhook through — if
   * this returned true, a test could pass while the real signature check was
   * broken, and someone could point a staging webhook at it and be believed.
   * Tests that need a valid signature should exercise the real verifier.
   */
  verifyWebhookSignature(): boolean {
    return false
  },

  /** Also always false, for the same reason. */
  isAllowedWebhookIp(): boolean {
    return false
  },

  getNextDebitDate(debitDay: number): string {
    const now = new Date()
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), debitDay))
    if (candidate <= now) candidate.setUTCMonth(candidate.getUTCMonth() + 1)
    return candidate.toISOString().slice(0, 10)
  },
}
