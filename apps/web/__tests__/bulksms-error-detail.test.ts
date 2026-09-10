import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { BULKSMS_USERNAME: 'u', BULKSMS_PASSWORD: 'p' },
}))

import { getSMSStatus } from '@/lib/bulksms'

/**
 * Every BulkSMS error this system actually logged in production read
 * "BulkSMS 403: " — the status code, then nothing. `body.detail ?? body.type
 * ?? res.statusText` only falls through on `null`/`undefined`, and BulkSMS
 * returns `detail: ""` for at least this error class, so the empty string
 * won every time and the real reason never reached a log anyone could read.
 * `getSMSStatus` is used here (rather than `sendSMS`) specifically because
 * it is not wrapped in `withRetry` — the error-parsing behaviour is what is
 * under test, not the retry policy.
 */
describe('BulkSMS error responses — the detail actually reaches the thrown error', () => {
  const mockFetch = (status: number, statusText: string, body?: unknown) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText,
      json: async () => body,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    }))
  }

  afterEach(() => vi.unstubAllGlobals())

  it('falls through an empty detail to type, rather than using the empty string', async () => {
    mockFetch(403, 'Forbidden', { type: 'blocked', detail: '' })
    await expect(getSMSStatus('msg-1')).rejects.toThrow('BulkSMS 403: blocked')
  })

  it('uses a populated detail when one is actually sent', async () => {
    mockFetch(402, 'Payment Required', { type: 'insufficient-credit', detail: 'Not enough credit' })
    await expect(getSMSStatus('msg-2')).rejects.toThrow('BulkSMS 402: Not enough credit')
  })

  it('falls back to the raw body when the shape is not one this recognises', async () => {
    mockFetch(403, 'Forbidden', { message: 'Account suspended', code: 'ACCOUNT_LOCKED' })
    const err = await getSMSStatus('msg-3').catch((e: Error) => e)
    expect(err.message).toContain('Account suspended')
    expect(err.message).toContain('ACCOUNT_LOCKED')
  })

  it('falls back to statusText for a non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new SyntaxError('not json') },
      text: async () => '',
    }))
    await expect(getSMSStatus('msg-4')).rejects.toThrow('BulkSMS 500: Internal Server Error')
  })
})
