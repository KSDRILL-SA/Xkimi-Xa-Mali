import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted before any module evaluation
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    loginHistory: { create: vi.fn() },
  },
}))

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn() },
  compare: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 15,
    NEXTAUTH_SECRET: 'test-secret-minimum-32-characters-xx',
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@auth/prisma-adapter', () => ({
  PrismaAdapter: vi.fn().mockReturnValue({}),
}))

vi.mock('next-auth', () => ({
  default: vi.fn((cfg: unknown) => cfg),
}))

vi.mock('next-auth/providers/credentials', () => ({
  default: vi.fn((cfg: unknown) => cfg),
}))

vi.mock('@/lib/validation/auth', () => ({
  LoginSchema: { safeParse: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports — after mocks are registered
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { LoginSchema } from '@/lib/validation/auth'
import { authorizeCredentials } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVE_USER = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  password: '$2b$10$hashedpassword',
  status: 'ACTIVE',
  loginAttempts: 0,
  lockedUntil: null,
  roles: [{ role: { name: 'MEMBER' } }],
}

function setupValidCredentials() {
  ;(LoginSchema.safeParse as MockedFunction<typeof LoginSchema.safeParse>).mockReturnValue({
    success: true,
    data: { email: 'test@example.com', password: 'Password1' },
  } as never)
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authorizeCredentials', () => {
  it('returns null when schema validation fails', async () => {
    ;(LoginSchema.safeParse as MockedFunction<typeof LoginSchema.safeParse>).mockReturnValue({
      success: false,
      error: { errors: [{ message: 'Invalid email' }] },
    } as never)

    const result = await authorizeCredentials({ email: '', password: '' })
    expect(result).toBeNull()
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when user is not found', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>).mockResolvedValue(null)

    const result = await authorizeCredentials({ email: 'x@x.com', password: 'pw' })
    expect(result).toBeNull()
  })

  it('returns null when user has no password (OAuth account)', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, password: null } as never)

    const result = await authorizeCredentials({ email: 'test@example.com', password: 'pw' })
    expect(result).toBeNull()
  })

  it('throws ACCOUNT_LOCKED when lockedUntil is in the future', async () => {
    setupValidCredentials()
    const futureDate = new Date(Date.now() + 10 * 60_000) // 10 min from now
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, lockedUntil: futureDate } as never)

    await expect(authorizeCredentials({ email: 'test@example.com', password: 'pw' }))
      .rejects.toThrow('ACCOUNT_LOCKED')
    // Should short-circuit before bcrypt (performance: no hash work on locked account)
    expect(bcrypt.compare).not.toHaveBeenCalled()
  })

  it('throws EMAIL_NOT_VERIFIED for PENDING user', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, status: 'PENDING' } as never)

    await expect(authorizeCredentials({ email: 'test@example.com', password: 'pw' }))
      .rejects.toThrow('EMAIL_NOT_VERIFIED')
  })

  it('throws ACCOUNT_SUSPENDED for SUSPENDED user', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, status: 'SUSPENDED' } as never)

    await expect(authorizeCredentials({ email: 'test@example.com', password: 'pw' }))
      .rejects.toThrow('ACCOUNT_SUSPENDED')
  })

  it('increments loginAttempts and returns null on wrong password', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, loginAttempts: 2 } as never)
    ;(bcrypt.compare as MockedFunction<typeof bcrypt.compare>).mockResolvedValue(false as never)
    ;(db.user.update as MockedFunction<typeof db.user.update>).mockResolvedValue({} as never)
    ;(db.loginHistory.create as MockedFunction<typeof db.loginHistory.create>).mockResolvedValue({} as never)

    const result = await authorizeCredentials({ email: 'test@example.com', password: 'wrong' })

    expect(result).toBeNull()
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ loginAttempts: 3 }),
      }),
    )
    // Login history recorded on failure
    expect(db.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: false }) }),
    )
  })

  it('sets lockedUntil when attempt count reaches MAX_LOGIN_ATTEMPTS (5)', async () => {
    setupValidCredentials()
    // 4 prior failures — this 5th attempt triggers lockout
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, loginAttempts: 4 } as never)
    ;(bcrypt.compare as MockedFunction<typeof bcrypt.compare>).mockResolvedValue(false as never)
    ;(db.user.update as MockedFunction<typeof db.user.update>).mockResolvedValue({} as never)
    ;(db.loginHistory.create as MockedFunction<typeof db.loginHistory.create>).mockResolvedValue({} as never)

    await authorizeCredentials({ email: 'test@example.com', password: 'wrong' })

    const [{ data }] = (db.user.update as MockedFunction<typeof db.user.update>).mock.calls[0] as [
      { data: { loginAttempts: number; lockedUntil?: Date } },
    ]
    expect(data.loginAttempts).toBe(5)
    expect(data.lockedUntil).toBeInstanceOf(Date)
    // lockedUntil should be ~15 minutes from now
    expect((data.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
  })

  it('resets loginAttempts and lockedUntil on successful login when prior failures exist', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, loginAttempts: 3, lockedUntil: null } as never)
    ;(bcrypt.compare as MockedFunction<typeof bcrypt.compare>).mockResolvedValue(true as never)
    ;(db.user.update as MockedFunction<typeof db.user.update>).mockResolvedValue({} as never)
    ;(db.loginHistory.create as MockedFunction<typeof db.loginHistory.create>).mockResolvedValue({} as never)

    const result = await authorizeCredentials({ email: 'test@example.com', password: 'correct' })

    expect(result).not.toBeNull()
    expect((result as { email: string }).email).toBe('test@example.com')
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { loginAttempts: 0, lockedUntil: null },
      }),
    )
  })

  it('skips counter reset on clean successful login (no prior attempts)', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue({ ...ACTIVE_USER, loginAttempts: 0, lockedUntil: null } as never)
    ;(bcrypt.compare as MockedFunction<typeof bcrypt.compare>).mockResolvedValue(true as never)
    ;(db.loginHistory.create as MockedFunction<typeof db.loginHistory.create>).mockResolvedValue({} as never)

    await authorizeCredentials({ email: 'test@example.com', password: 'correct' })

    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('records success=true in login history on successful login', async () => {
    setupValidCredentials()
    ;(db.user.findUnique as MockedFunction<typeof db.user.findUnique>)
      .mockResolvedValue(ACTIVE_USER as never)
    ;(bcrypt.compare as MockedFunction<typeof bcrypt.compare>).mockResolvedValue(true as never)
    ;(db.loginHistory.create as MockedFunction<typeof db.loginHistory.create>).mockResolvedValue({} as never)

    await authorizeCredentials({ email: 'test@example.com', password: 'correct' })

    expect(db.loginHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', success: true }),
      }),
    )
  })
})
