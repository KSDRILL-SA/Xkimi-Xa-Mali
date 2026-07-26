import { describe, it, expect, vi, beforeEach } from 'vitest'

const { auth, redirect, defaultLimit, bulkLimit, warn } = vi.hoisted(() => ({
  auth: vi.fn(),
  // The real redirect throws to unwind; mirroring that is what proves the guard
  // stops rather than falls through to the action.
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`) }),
  defaultLimit: vi.fn(),
  bulkLimit: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '41.0.0.9, 10.0.0.1']]) as unknown as Headers,
}))
vi.mock('@/lib/auth', () => ({ auth }))
vi.mock('@xxm/observability', () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/rate-limit', () => ({
  adminActionRatelimit: { limit: defaultLimit },
  adminBulkActionRatelimit: { limit: bulkLimit },
}))

import { requireAdmin } from '@/lib/admin-action'

const ADMIN_SESSION = { user: { id: 'admin-1', roles: ['ADMIN'] } }

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue(ADMIN_SESSION)
  defaultLimit.mockResolvedValue({ success: true })
  bulkLimit.mockResolvedValue({ success: true })
})

describe('requireAdmin — authorization', () => {
  it('sends an unauthenticated caller to login and never reaches the limiter', async () => {
    auth.mockResolvedValue(null)
    await expect(requireAdmin('goal.delete')).rejects.toThrow('REDIRECT:/login')
    expect(defaultLimit).not.toHaveBeenCalled()
  })

  it('refuses a signed-in member who is not an admin', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', roles: ['MEMBER'] } })
    await expect(requireAdmin('goal.delete')).rejects.toThrow('REDIRECT:/forbidden')
    expect(defaultLimit).not.toHaveBeenCalled()
  })

  it('refuses a session carrying no roles at all', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' } })
    await expect(requireAdmin('goal.delete')).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('records the attempt so a non-admin probing actions is visible', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', roles: ['MEMBER'] } })
    await expect(requireAdmin('member.grantAdmin')).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith(
      'Non-admin attempted an admin action',
      expect.objectContaining({ action: 'member.grantAdmin', userId: 'u1' }),
    )
  })
})

describe('requireAdmin — throttling', () => {
  it('keys the limit on the admin id, not an IP a caller could forge', async () => {
    await requireAdmin('goal.update')
    expect(defaultLimit).toHaveBeenCalledWith('admin-1')
  })

  it('stops the action when the bucket is empty', async () => {
    defaultLimit.mockResolvedValue({ success: false })
    await expect(requireAdmin('goal.update')).rejects.toThrow('REDIRECT:/too-many-requests')
  })

  it('sends fan-out actions to the tighter bucket', async () => {
    await requireAdmin('contributions.generate', { bulk: true })
    expect(bulkLimit).toHaveBeenCalledWith('admin-1')
    expect(defaultLimit).not.toHaveBeenCalled()
  })

  it('a full bulk bucket does not consume the ordinary one', async () => {
    bulkLimit.mockResolvedValue({ success: false })
    await expect(requireAdmin('notifications.broadcast', { bulk: true }))
      .rejects.toThrow('REDIRECT:/too-many-requests')
    expect(defaultLimit).not.toHaveBeenCalled()
  })

  it('records which bucket refused, so a limit that is too tight is diagnosable', async () => {
    bulkLimit.mockResolvedValue({ success: false })
    await expect(requireAdmin('contributions.generate', { bulk: true })).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith(
      'Admin action rate limited',
      expect.objectContaining({ action: 'contributions.generate', bucket: 'bulk' }),
    )
  })
})

describe('requireAdmin — context handed back', () => {
  it('returns the admin identity for the audit entry', async () => {
    const ctx = await requireAdmin('mandate.approve')
    expect(ctx.userId).toBe('admin-1')
    expect(ctx.roles).toEqual(['ADMIN'])
  })

  it('takes the first forwarded hop, so appended hops cannot rewrite the audit IP', async () => {
    const ctx = await requireAdmin('mandate.approve')
    expect(ctx.ip).toBe('41.0.0.9')
  })
})
