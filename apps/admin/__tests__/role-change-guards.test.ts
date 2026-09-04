import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The guards on the path the console actually takes.
 *
 * `setMemberRole` existed twice. The member app's copy refused a self-revoke
 * and refused to remove the last admin; this one refused neither, and this one
 * is what `members/[id]/page.tsx` calls. The protection was in the codebase and
 * not on the path anyone took — §9's recurring failure, and the mirror of §4.9:
 * not a feature nobody could reach, but a safeguard nobody could reach.
 *
 * By decision this system has exactly one admin, so "remove the last admin" and
 * "remove your own" were the same click.
 */

const mocks = vi.hoisted(() => ({
  roleFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userRoleCount: vi.fn(),
  userRoleUpsert: vi.fn(),
  userRoleDeleteMany: vi.fn(),
  userUpdate: vi.fn(),
  publishRoleVersion: vi.fn(),
  writeAuditLog: vi.fn(),
  /** What happened inside the transaction, in order. */
  order: [] as string[],
}))

vi.mock('@/lib/db', () => {
  const tables = {
    role: { findUnique: mocks.roleFindUnique },
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    userRole: {
      count: mocks.userRoleCount,
      upsert: mocks.userRoleUpsert,
      deleteMany: mocks.userRoleDeleteMany,
    },
  }
  // The count and the write happen in one transaction now, so the number the
  // policy is given cannot go stale before it is acted on. Same mock instances
  // as the direct client, so every arrangement below still arranges the call
  // that really happens.
  const tx = {
    ...tables,
    $executeRaw: (..._a: unknown[]) => { mocks.order.push('lock'); return Promise.resolve(0) },
    userRole: {
      count: (...a: unknown[]) => { mocks.order.push('count'); return mocks.userRoleCount(...a) },
      upsert: (...a: unknown[]) => { mocks.order.push('write'); return mocks.userRoleUpsert(...a) },
      deleteMany: (...a: unknown[]) => { mocks.order.push('write'); return mocks.userRoleDeleteMany(...a) },
    },
  }
  return {
    db: { ...tables, $transaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(tx)) },
  }
})
vi.mock('@/lib/env', () => ({ env: { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined } }))
vi.mock('@/lib/role-version', () => ({ publishRoleVersion: mocks.publishRoleVersion }))

import { setMemberRole } from '@/lib/services/invitations'
import { writeAuditLog } from '@/lib/services/shared'

vi.mock('@/lib/services/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/shared')>()
  return { ...actual, writeAuditLog: mocks.writeAuditLog }
})

const ADMIN_ROLES = ['ADMIN']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.roleFindUnique.mockResolvedValue({ id: 'role-admin', name: 'ADMIN' })
  mocks.userFindUnique.mockResolvedValue({ id: 'member-2' })
  mocks.userRoleCount.mockResolvedValue(3)
  mocks.userUpdate.mockResolvedValue({ id: 'member-2', roleVersion: 4 })
})

describe('the count and the write are one operation', () => {
  // The guards above are correct and were evaluated against a read taken
  // outside any transaction, with the delete happening after it. Two admins
  // removing each other at the same moment both read three admins, were both
  // told three is enough, and both wrote — each operation individually
  // legitimate, the pair of them leaving nobody able to sign in.
  //
  // There is no stricter check that fixes this: under READ COMMITTED each
  // transaction sees its own delete and not the other's, so re-counting after
  // writing still concludes that an admin remains. The lock is what makes the
  // second caller wait and then see the truth.

  beforeEach(() => { mocks.order.length = 0 })

  it('takes the lock before counting, and writes after', async () => {
    // A lock taken after the count locks nothing — the stale read has already
    // happened. This ordering is the entire fix.
    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', false)

    expect(mocks.order).toEqual(['lock', 'count', 'write'])
  })

  it('does not lock when granting admin', async () => {
    // Adding an admin cannot strand anybody, and the ordinary case should not
    // pay for a lock on a rule it cannot trip.
    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', true)

    expect(mocks.order).toEqual(['write'])
  })

  it('does not lock when the role is not ADMIN', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'role-member', name: 'MEMBER' })

    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'MEMBER', true)

    expect(mocks.order).toEqual(['write'])
  })

  it('releases the lock without writing when the policy refuses', async () => {
    // Thrown inside the transaction, so it rolls back and the lock goes with
    // it. A refusal that left the lock held would shut the console for good.
    mocks.userRoleCount.mockResolvedValue(1)

    await expect(
      setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', false),
    ).rejects.toThrow(/at least one admin must remain/i)

    expect(mocks.order).toEqual(['lock', 'count'])
  })
})

describe('the click that could have ended the system', () => {
  it('refuses an admin removing their own admin role', async () => {
    await expect(
      setMemberRole('admin-1', ADMIN_ROLES, 'admin-1', 'ADMIN', false),
    ).rejects.toThrow(/cannot remove your own admin role/i)

    expect(mocks.userRoleDeleteMany).not.toHaveBeenCalled()
    // Nothing is written at all — no role gone, no version bump, no session
    // ended. A half-applied refusal would be its own outage.
    expect(mocks.userUpdate).not.toHaveBeenCalled()
    expect(mocks.publishRoleVersion).not.toHaveBeenCalled()
  })

  it('refuses removing the last admin', async () => {
    mocks.userRoleCount.mockResolvedValue(1)

    await expect(
      setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', false),
    ).rejects.toThrow(/at least one admin must remain/i)

    expect(mocks.userRoleDeleteMany).not.toHaveBeenCalled()
  })

  it('allows one admin to remove another when more remain', async () => {
    mocks.userRoleCount.mockResolvedValue(2)

    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', false)

    expect(mocks.userRoleDeleteMany).toHaveBeenCalledOnce()
    expect(mocks.publishRoleVersion).toHaveBeenCalledWith('member-2', 4)
  })

  it('counts admins before deciding, rather than trusting the caller', async () => {
    mocks.userRoleCount.mockResolvedValue(2)

    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', false)

    expect(mocks.userRoleCount).toHaveBeenCalledWith({ where: { roleId: 'role-admin' } })
  })
})

describe('MEMBER is not a permission', () => {
  it('refuses to remove it, and says to suspend instead', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'role-member', name: 'MEMBER' })

    await expect(
      setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'MEMBER', false),
    ).rejects.toThrow(/suspend the account instead/i)

    expect(mocks.userRoleDeleteMany).not.toHaveBeenCalled()
  })

  it('still allows granting it, which repairs an account that lost it', async () => {
    mocks.roleFindUnique.mockResolvedValue({ id: 'role-member', name: 'MEMBER' })

    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'MEMBER', true)

    expect(mocks.userRoleUpsert).toHaveBeenCalledOnce()
  })
})

describe('granting is never blocked', () => {
  it('promotes another member to admin', async () => {
    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', true)

    expect(mocks.userRoleUpsert).toHaveBeenCalledOnce()
    // No count is needed to add an admin, so none is taken.
    expect(mocks.userRoleCount).not.toHaveBeenCalled()
  })
})

describe('the audit trail names the same action as the member app', () => {
  it('writes ADMIN_ROLE_REVOKED, not ADMIN_ROLE_REMOVED', async () => {
    // This wrote ADMIN_ROLE_REMOVED while the member app wrote
    // ADMIN_ROLE_REVOKED, so an audit query filtering on the member app's name
    // missed every revocation the console performed — and the console is the
    // only place revocations happen.
    mocks.userRoleCount.mockResolvedValue(2)

    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', false)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_ROLE_REVOKED' }),
    )
  })

  it('writes ADMIN_ROLE_ASSIGNED on a grant', async () => {
    await setMemberRole('admin-1', ADMIN_ROLES, 'member-2', 'ADMIN', true)

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_ROLE_ASSIGNED' }),
    )
  })
})

describe('both apps read the same rule', () => {
  const read = async (relative: string) => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, relative), 'utf8')
  }

  it('neither app carries its own copy of the decision', async () => {
    // Two implementations that happen to agree today is how this happened.
    const adminSvc = await read('../lib/services/invitations.ts')
    const webSvc = await read('../../web/services/invite.service.ts')

    for (const [name, source] of [['admin', adminSvc], ['web', webSvc]] as const) {
      expect(source, name).toContain('refuseRoleChange')
      expect(source, name).toContain('@xxm/utils/role-policy')
      // No local re-statement of the threshold.
      expect(source, name).not.toMatch(/adminCount\s*<=\s*1/)
    }
  })
})
