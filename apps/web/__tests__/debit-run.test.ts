import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test',
    AUTH_SECRET: 'test-secret',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    WHATSAPP_GROUP_LINK: 'https://example.com',
  },
}))

import { processMandateBatch } from '@/inngest/functions/debit-run'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processMandateBatch', () => {
  it('continues processing later mandates after one throws', async () => {
    const calls: string[] = []

    const result = await processMandateBatch(['first', 'second', 'third'], async (mandate) => {
      calls.push(mandate)
      if (mandate === 'second') throw new Error('boom')
    })

    expect(result).toEqual({ succeeded: 2, failed: 1 })
    expect(calls).toEqual(['first', 'second', 'third'])
  })
})
