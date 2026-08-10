import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Who a trusted internal request says it is, and whether that is true.
 *
 * The routes reachable server-to-server took `x-admin-user-id` on faith and
 * granted it `['ADMIN']`. That was never an escalation — anyone holding the
 * shared secret can already reach every trusted route — but it did mean the
 * actor recorded against an action was whatever the header claimed. A
 * reversal, a Founder badge, an invitation: each could be written against any
 * id at all, including an admin who had nothing to do with it.
 *
 * The reversal route quotes the Founder Guide on precisely this point: "the
 * full history stays honest and any of us can retrace exactly what happened,
 * years later." An actor nobody checked is not a history that can be retraced.
 */

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }))

vi.mock('@/lib/env', () => ({ env: { ADMIN_API_SECRET: 'x'.repeat(40) } }))
vi.mock('@/lib/db', () => ({ db: { user: { findFirst: mocks.findFirst } } }))

import { resolveInternalAdmin } from '@/lib/internal-request'

function req(headers: Record<string, string>) {
  return { headers: { get: (k: string) => headers[k] ?? null } } as never
}

beforeEach(() => vi.clearAllMocks())

describe('resolving the acting admin', () => {
  it('returns the id when it names a current admin', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'admin-1' })

    expect(await resolveInternalAdmin(req({ 'x-admin-user-id': 'admin-1' }))).toBe('admin-1')
  })

  it('requires the member to be active, undeleted and actually an ADMIN', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'admin-1' })

    await resolveInternalAdmin(req({ 'x-admin-user-id': 'admin-1' }))

    expect(mocks.findFirst.mock.calls[0]![0]).toMatchObject({
      where: {
        id: 'admin-1',
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { name: 'ADMIN' } } },
      },
    })
  })

  it('returns null when the header names nobody', async () => {
    expect(await resolveInternalAdmin(req({}))).toBeNull()
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  it('returns null when the header names a member who is not an admin', async () => {
    // The query above would not match them, so the lookup comes back empty.
    // Previously this id was simply granted ['ADMIN'] and recorded as the actor.
    mocks.findFirst.mockResolvedValue(null)

    expect(await resolveInternalAdmin(req({ 'x-admin-user-id': 'ordinary-member' }))).toBeNull()
  })

  it('returns null for an admin demoted since the console checked', async () => {
    // The console runs its own `requireAdmin` before calling. This closes the
    // window between that check and this one, which matters most for the
    // actions that are permanent.
    mocks.findFirst.mockResolvedValue(null)

    expect(await resolveInternalAdmin(req({ 'x-admin-user-id': 'was-an-admin' }))).toBeNull()
  })

  it('returns null for an id that does not exist at all', async () => {
    mocks.findFirst.mockResolvedValue(null)

    expect(await resolveInternalAdmin(req({ 'x-admin-user-id': 'made-up' }))).toBeNull()
  })
})
