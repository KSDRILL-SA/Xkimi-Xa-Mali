import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

/**
 * The console's half of the Founder badge.
 *
 * The rules — the cap of four, the audit entry, the notification — live once, in
 * the member app. This reaches across to them rather than keeping a second copy,
 * which is the decision recorded for reversals (#283): two implementations of a
 * rule are two rules, and the one nobody is looking at is the one that drifts.
 *
 * So what is worth testing here is the reaching: that the acting admin travels
 * with the request, that the right verb is used, and that a refusal from the
 * other side arrives as something a person can read rather than as a generic
 * failure.
 */

vi.mock('@/lib/api', () => ({ internalAdminRequest: vi.fn() }))

import { internalAdminRequest } from '@/lib/api'
import { setFounderBadge } from '@/lib/founder-badge'

const request = internalAdminRequest as MockedFunction<typeof internalAdminRequest>
const ADMIN_ROLES = ['ADMIN']

beforeEach(() => {
  vi.clearAllMocks()
  request.mockResolvedValue({ ok: true, status: 201, data: { userId: 'm-1' } })
})

describe('granting', () => {
  it('names the acting admin, because the audit entry records who decided', async () => {
    await setFounderBadge('admin-1', ADMIN_ROLES, 'm-1', true, { note: 'Chairman' })

    const [method, path, body, opts] = request.mock.calls[0]!
    expect(method).toBe('POST')
    expect(path).toBe('/api/v1/admin/distinctions')
    expect(body).toMatchObject({ userId: 'm-1', kind: 'FOUNDER', note: 'Chairman' })
    // "system" would be a lie about a decision a person made.
    expect(opts).toMatchObject({ adminUserId: 'admin-1' })
  })

  it('refuses a caller who is not an admin, before reaching across', async () => {
    await expect(setFounderBadge('nobody', [], 'm-1', true)).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
})

describe('removing', () => {
  it('sends the reason with the request', async () => {
    // Removal is an erratum for a badge on the wrong account, not a way to take
    // an honour back — so the reason is not optional.
    await setFounderBadge('admin-1', ADMIN_ROLES, 'm-1', false, {
      reason: 'granted to the wrong account',
    })

    const [method, , body] = request.mock.calls[0]!
    expect(method).toBe('DELETE')
    expect(body).toMatchObject({ kind: 'FOUNDER', reason: 'granted to the wrong account' })
  })
})

describe('when the member app refuses', () => {
  it('surfaces the cap message rather than replacing it with something generic', async () => {
    // "There are already 4 FOUNDER distinctions and the limit is 4" is written
    // to be read by a person standing in the console. Swallowing it would leave
    // them with a failure and no idea which rule they hit.
    request.mockResolvedValue({
      ok: false,
      status: 409,
      data: null,
      error: { code: 'CONFLICT', message: 'There are already 4 FOUNDER distinctions and the limit is 4.' },
    })

    await expect(setFounderBadge('admin-1', ADMIN_ROLES, 'm-5', true)).rejects.toThrow(
      /already 4 FOUNDER distinctions/,
    )
  })

  it('says so when the member app cannot be reached at all', async () => {
    request.mockResolvedValue({ ok: false, status: 0, data: null, error: { message: 'Network error' } })

    await expect(setFounderBadge('admin-1', ADMIN_ROLES, 'm-1', true)).rejects.toThrow(/Network error/)
  })
})
