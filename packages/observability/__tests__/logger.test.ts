import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above every other statement in the file, so the spies it
// closes over have to be created inside vi.hoisted or they do not exist yet.
const { captureException, captureMessage, addBreadcrumb } = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
}))

vi.mock('@sentry/nextjs', () => ({ captureException, captureMessage, addBreadcrumb }))

import { logger } from '../src/logger'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('logger.error — nothing is allowed to go unreported', () => {
  it('reports a bare error with no metadata at all', () => {
    // The regression this package was extracted with: the previous version only
    // reached Sentry when meta was present, so the shortest possible call — the
    // one reached for in a hurry — was written to the console and dropped.
    logger.error('Payment failed')

    expect(captureMessage).toHaveBeenCalledWith('Payment failed', expect.objectContaining({ level: 'error' }))
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports a real Error as an exception, not a string', () => {
    const err = new Error('gateway timeout')
    logger.error('Debit failed', { err, userId: 'u1' })

    expect(captureException).toHaveBeenCalledWith(err, expect.anything())
    expect(captureMessage).not.toHaveBeenCalled()
  })

  it('accepts the error under `error` as well as `err`', () => {
    const error = new Error('boom')
    logger.error('Something broke', { error })
    expect(captureException).toHaveBeenCalledWith(error, expect.anything())
  })

  it('keeps context as extras but not the error itself — Sentry shows that separately', () => {
    const err = new Error('nope')
    logger.error('Mandate rejected', { err, mandateId: 'm1', amount: 500 })

    const [, options] = captureException.mock.calls[0]!
    expect(options.extra).toEqual({ mandateId: 'm1', amount: 500 })
    expect(options.extra).not.toHaveProperty('err')
  })

  it('reports a non-Error value under `err` as a message, keeping the context', () => {
    logger.error('Webhook rejected', { err: 'not an Error instance', ref: 'tx-1' })

    expect(captureException).not.toHaveBeenCalled()
    const [message, options] = captureMessage.mock.calls[0]!
    expect(message).toBe('Webhook rejected')
    expect(options.extra).toMatchObject({ ref: 'tx-1' })
  })
})

describe('logger.warn', () => {
  it('leaves a breadcrumb so the trail survives with a later failure', () => {
    logger.warn('Stale webhook rejected', { ref: 'tx-9' })

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Stale webhook rejected', level: 'warning' }),
    )
    expect(captureException).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })
})

describe('logger.info / debug — never reported', () => {
  it('does not send routine logs to Sentry', () => {
    logger.info('Contribution recorded', { amount: 100 })
    logger.debug('cache hit')

    expect(captureException).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
    expect(addBreadcrumb).not.toHaveBeenCalled()
  })
})

describe('logger.timed', () => {
  it('returns the value and records the duration', async () => {
    const result = await logger.timed('sync', async () => 'done')
    expect(result).toBe('done')
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports the failure and rethrows, so timing never swallows an error', async () => {
    const err = new Error('failed')
    await expect(logger.timed('sync', async () => { throw err })).rejects.toThrow(err)
    expect(captureException).toHaveBeenCalledWith(err, expect.anything())
  })
})

describe('serialization', () => {
  it('does not throw on metadata holding an Error among plain values', () => {
    expect(() => logger.info('mixed', { err: new Error('x'), n: 1, s: 'a', nested: { a: 1 } })).not.toThrow()
  })
})
