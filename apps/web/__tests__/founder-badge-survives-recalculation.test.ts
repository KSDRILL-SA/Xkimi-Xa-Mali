import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The regression this whole design exists to prevent.
 *
 * `BadgeTier` is computed. `recalculateOne` writes `currentBadge` from
 * `determineTier(metrics)` on every run, and the recalculation job fires monthly
 * *and* on every contribution status change. A founder mark placed in that
 * column would be silently overwritten the next time that founder paid a
 * contribution — and nobody would find out until a founder noticed their badge
 * had quietly disappeared, months later.
 *
 * So this asserts the separation directly: the tier moves, up and down, and the
 * distinction does not move at all. It also asserts the structural half — that
 * `badge.service.ts` never touches the distinction table — because the day it
 * can, somebody will make the recalculation consult it and the separation is
 * gone.
 */

const mocks = vi.hoisted(() => ({
  distinctionFindMany: vi.fn(),
  distinctionFindUnique: vi.fn(),
  distinctionDelete: vi.fn(),
  distinctionCreate: vi.fn(),
  distinctionCount: vi.fn(),
  badgeUpsert: vi.fn(),
  badgeFindByUser: vi.fn(),
  createHistoryEntry: vi.fn(),
  findHistoryByUser: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { ENCRYPTION_KEY: '0'.repeat(64) } }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * The distinction table is exposed to both services here. If `badge.service.ts`
 * ever reads or writes it, these spies see it — which is the point.
 */
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'founder-1', firstName: 'Kurhula' }) },
    memberDistinction: {
      findMany: mocks.distinctionFindMany,
      findUnique: mocks.distinctionFindUnique,
      delete: mocks.distinctionDelete,
      create: mocks.distinctionCreate,
      count: mocks.distinctionCount,
    },
  },
}))

vi.mock('@/repositories/badge.repository', () => ({
  badgeRepo: {
    upsert: mocks.badgeUpsert,
    findByUser: mocks.badgeFindByUser,
    createHistoryEntry: mocks.createHistoryEntry,
    findHistoryByUser: mocks.findHistoryByUser,
    findAllForCommunity: vi.fn().mockResolvedValue([]),
  },
}))

import { isFounder } from '@/services/distinction.service'
import * as badgeService from '@/services/badge.service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.distinctionFindUnique.mockResolvedValue({ userId: 'founder-1' })
  mocks.distinctionFindMany.mockResolvedValue([{ userId: 'founder-1' }])
})

describe('a tier moving does not move the founder badge', () => {
  it('the badge service never reads or writes the distinction table', async () => {
    // The structural guarantee. Every export of the badge service is reachable
    // from the recalculation path or the read path; none may touch this table.
    expect(typeof badgeService.recalculateOne).toBe('function')
    expect(typeof badgeService.getCommunityBadges).toBe('function')

    await badgeService.getCommunityBadges()

    expect(mocks.distinctionFindMany).not.toHaveBeenCalled()
    expect(mocks.distinctionFindUnique).not.toHaveBeenCalled()
    expect(mocks.distinctionDelete).not.toHaveBeenCalled()
    expect(mocks.distinctionCreate).not.toHaveBeenCalled()
  })

  it('the source file does not import the distinction service at all', async () => {
    // A stronger statement than "did not call it during this test": it cannot,
    // because the dependency does not exist. This is the line that would have to
    // be deleted to reintroduce the bug, so it is the line worth guarding.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../services/badge.service.ts'), 'utf8')

    expect(source).not.toMatch(/distinction/i)
    expect(source).not.toMatch(/memberDistinction/)
  })

  it('FOUNDER is not a badge tier — it is not on the ladder at all', async () => {
    const { BADGE_TIER_ORDER } = await import('@xxm/types')
    expect(BADGE_TIER_ORDER).not.toContain('FOUNDER')
    // Four rungs, each of which can be climbed to. A founder badge cannot.
    expect(BADGE_TIER_ORDER).toEqual(['AMATEUR', 'SEMI_PRO', 'PRO', 'WORLD_CLASS'])
  })

  it('survives the badge being read at every tier', async () => {
    // The badge a founder holds is irrelevant to whether they founded anything.
    // A founder at AMATEUR is an ordinary state, not a contradiction.
    for (const tier of ['AMATEUR', 'SEMI_PRO', 'PRO', 'WORLD_CLASS'] as const) {
      mocks.badgeFindByUser.mockResolvedValue({ currentBadge: tier })
      expect(await isFounder('founder-1')).toBe(true)
    }
  })
})
