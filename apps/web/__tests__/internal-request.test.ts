import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A fixed 32+ char secret so the length rule is satisfied for the happy path.
// vi.hoisted so the (hoisted) vi.mock factory can safely reference it.
const { SECRET } = vi.hoisted(() => ({ SECRET: 'x'.repeat(40) }))

vi.mock('@/lib/env', () => ({ env: { ADMIN_API_SECRET: SECRET } }))

// A nonce store that behaves like Redis: SET NX returns 'OK' the first time and
// null for a key that already exists. The distinction IS the replay check.
const store = vi.hoisted(() => {
  const keys = new Set<string>()
  return {
    keys,
    configured: { value: true },
    set: vi.fn(async (key: string, _v: string, opts?: { nx?: boolean }) => {
      if (opts?.nx && keys.has(key)) return null
      keys.add(key)
      return 'OK'
    }),
  }
})
vi.mock('@/lib/redis', () => ({
  redis: { set: store.set },
  get REDIS_CONFIGURED() { return store.configured.value },
}))

const live = vi.hoisted(() => ({ value: false }))
vi.mock('@xxm/utils', async (orig) => ({
  ...(await orig<typeof import('@xxm/utils')>()),
  isLiveDeployment: () => live.value,
}))

import { verifyInternalRequest } from '@/lib/internal-request'

let nonceSeq = 0
/** A fresh nonce, so unrelated cases do not collide in the shared store. */
const nonce = () => `nonce-${++nonceSeq}-aaaaaaaa`

function req(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/v1/admin/notifications/broadcast', {
    method: 'POST',
    headers,
  })
}

const fresh = () => String(Date.now())

describe('verifyInternalRequest — trusted server-to-server auth', () => {
  it('accepts the correct secret with a fresh timestamp', async () => {
    expect(await verifyInternalRequest(req({ 'x-admin-secret': SECRET, 'x-admin-timestamp': fresh(), 'x-admin-nonce': nonce() }))).toBe(true)
  })

  it('rejects a wrong secret of the same length', async () => {
    expect(await verifyInternalRequest(req({ 'x-admin-secret': 'y'.repeat(40), 'x-admin-timestamp': fresh() }))).toBe(false)
  })

  it('rejects a secret of a different length (no timingSafeEqual throw)', async () => {
    expect(await verifyInternalRequest(req({ 'x-admin-secret': 'short', 'x-admin-timestamp': fresh() }))).toBe(false)
  })

  it('rejects a missing secret header', async () => {
    expect(await verifyInternalRequest(req({ 'x-admin-timestamp': fresh() }))).toBe(false)
  })

  it('rejects a missing timestamp', async () => {
    expect(await verifyInternalRequest(req({ 'x-admin-secret': SECRET }))).toBe(false)
  })

  it('rejects a stale timestamp (older than 5 minutes)', async () => {
    const stale = String(Date.now() - 6 * 60 * 1000)
    expect(await verifyInternalRequest(req({ 'x-admin-secret': SECRET, 'x-admin-timestamp': stale }))).toBe(false)
  })

  it('rejects a non-numeric timestamp', async () => {
    expect(await verifyInternalRequest(req({ 'x-admin-secret': SECRET, 'x-admin-timestamp': 'not-a-number' }))).toBe(false)
  })
})

describe('replay', () => {
  // The window used to be the whole defence, and the old comment said so: a
  // timestamp within ±5 minutes "to limit replay". Limit is what it did. A
  // captured request stayed valid for the rest of its five minutes and could be
  // sent again, unchanged, as often as anybody liked — against routes that
  // reverse transactions, change roles and record payments.

  beforeEach(() => {
    store.keys.clear()
    store.configured.value = true
    live.value = false
    vi.clearAllMocks()
  })

  const trusted = (n: string) => req({
    'x-admin-secret': SECRET, 'x-admin-timestamp': fresh(), 'x-admin-nonce': n,
  })

  it('accepts a nonce once and refuses the same one afterwards', async () => {
    const n = nonce()

    expect(await verifyInternalRequest(trusted(n))).toBe(true)
    expect(await verifyInternalRequest(trusted(n))).toBe(false)
    expect(await verifyInternalRequest(trusted(n))).toBe(false)
  })

  it('claims atomically, so two copies arriving together cannot both win', async () => {
    const n = nonce()

    const [a, b] = await Promise.all([
      verifyInternalRequest(trusted(n)),
      verifyInternalRequest(trusted(n)),
    ])

    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('claims with SET NX and a TTL that outlives the timestamp window', async () => {
    // A nonce only has to survive as long as its request would still be
    // accepted. Without NX the claim is a write that always succeeds, which is
    // no claim at all.
    await verifyInternalRequest(trusted(nonce()))

    expect(store.set).toHaveBeenCalledWith(
      expect.stringContaining('xxm:internal-nonce:'),
      '1',
      expect.objectContaining({ nx: true, ex: expect.any(Number) }),
    )
    const opts = store.set.mock.calls[0]![2] as { ex: number }
    expect(opts.ex).toBeGreaterThan(5 * 60)
  })

  it('refuses a trusted request that carries no nonce', async () => {
    // It cannot be replay-checked, so it is not trusted.
    expect(
      await verifyInternalRequest(req({ 'x-admin-secret': SECRET, 'x-admin-timestamp': fresh() })),
    ).toBe(false)
  })

  it('does not reach the nonce store when the secret is wrong', async () => {
    // No point letting an unauthenticated caller fill the keyspace.
    await verifyInternalRequest(req({
      'x-admin-secret': 'y'.repeat(40), 'x-admin-timestamp': fresh(), 'x-admin-nonce': nonce(),
    }))

    expect(store.set).not.toHaveBeenCalled()
  })
})

describe('when there is nowhere to keep nonces', () => {
  beforeEach(() => {
    store.keys.clear()
    store.configured.value = false
    vi.clearAllMocks()
  })

  it('closes the trusted channel on a live deployment', async () => {
    // `redis` is a no-op shim when Upstash is unconfigured, and its set()
    // reports success without storing anything — so a nonce store that always
    // says "new" is not a weaker control, it is the absence of one wearing the
    // appearance of a control. Better the console stops working loudly.
    live.value = true

    expect(await verifyInternalRequest(req({
      'x-admin-secret': SECRET, 'x-admin-timestamp': fresh(), 'x-admin-nonce': nonce(),
    }))).toBe(false)
  })

  it('lets a developer work without Upstash', async () => {
    live.value = false

    expect(await verifyInternalRequest(req({
      'x-admin-secret': SECRET, 'x-admin-timestamp': fresh(), 'x-admin-nonce': nonce(),
    }))).toBe(true)
  })
})

describe('the caller sends one', () => {
  it('the admin app attaches a nonce to every trusted request', async () => {
    // A check nothing sends the header for would refuse every real request, so
    // the two halves are pinned together.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../../admin/lib/api.ts'), 'utf8')

    expect(src).toContain("'x-admin-nonce'")
    expect(src).toContain('randomUUID()')
  })
})
