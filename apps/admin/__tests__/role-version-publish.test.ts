import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@upstash/redis', () => ({
  Redis: class {
    set = mocks.set
  },
}))

vi.mock('@/lib/db', () => ({ db: { user: { findUnique: vi.fn() } } }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/env', () => ({
  env: {
    UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  },
}))

beforeEach(() => {
  vi.resetModules()
  mocks.set.mockReset().mockResolvedValue('OK')
  mocks.warn.mockReset()
})

describe('publishRoleVersion', () => {
  it('writes the new session version to the shared Redis key', async () => {
    const { publishRoleVersion } = await import('@/lib/role-version')

    await publishRoleVersion('member-1', 7)

    expect(mocks.set).toHaveBeenCalledWith('xxm:role-version:member-1', '7')
  })

  it('logs a failed write without rolling back the completed database mutation', async () => {
    mocks.set.mockRejectedValueOnce(new Error('Redis unavailable'))
    const { publishRoleVersion } = await import('@/lib/role-version')

    await expect(publishRoleVersion('member-1', 7)).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledWith(
      'Could not publish role version to Redis',
      expect.objectContaining({ userId: 'member-1' }),
    )
  })
})
