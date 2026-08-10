import { describe, it, expect } from 'vitest'
import {
  LoginSchema,
  RegisterSchema,
  RegisterStep2Schema,
  PasswordResetSchema,
  ChangePasswordSchema,
} from '../src/schemas'

const pw = (password: string) => ({
  token: 't', password, confirmPassword: password,
})

describe('login is never held to the strength policy', () => {
  // The property that makes raising the minimum safe: members who registered
  // under the old eight-character rule must still be able to sign in. If login
  // ever validated shape, tightening the policy would lock out every one of
  // them at once.
  it('accepts a short legacy password', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: 'Pass123' }).success).toBe(true)
  })

  it('accepts a password with no uppercase and no digit', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: 'brotherhood' }).success).toBe(true)
  })

  it('still requires something to be typed', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false)
  })
})

describe('new passwords: length, not composition', () => {
  const cases: Array<[string, (p: string) => boolean]> = [
    ['PasswordResetSchema',  (p) => PasswordResetSchema.safeParse(pw(p)).success],
    ['ChangePasswordSchema', (p) => ChangePasswordSchema.safeParse({ currentPassword: 'x', newPassword: p, confirmPassword: p }).success],
    // The ID is required now: the admin records it on the invitation and the
    // member confirms it here, rather than supplying their own optionally.
    ['RegisterStep2Schema',  (p) => RegisterStep2Schema.safeParse({ firstName: 'Ku', lastName: 'Ma', idNumber: '9001015800088', password: p, consentToPopia: true }).success],
  ]

  for (const [name, check] of cases) {
    it(`${name} accepts a memorable phrase with no capital or digit`, () => {
      expect(check('brotherhood fund')).toBe(true)
    })

    it(`${name} rejects eleven characters`, () => {
      expect(check('elevenchars')).toBe(false)
    })

    it(`${name} rejects the old shape that used to pass`, () => {
      // Exactly what the previous rule encouraged, and what attackers guess first.
      expect(check('Pass1234')).toBe(false)
    })

    it(`${name} accepts twelve characters exactly`, () => {
      expect(check('123456789012')).toBe(true)
    })
  }

  it('RegisterSchema applies the same rule', () => {
    const base = {
      email: 'a@b.com', phone: '0821234567', firstName: 'Ku', lastName: 'Ma',
      idNumber: '9001015800088', consentToPopia: true as const,
    }
    expect(RegisterSchema.safeParse({ ...base, password: 'Pass1234' }).success).toBe(false)
    expect(RegisterSchema.safeParse({ ...base, password: 'brotherhood fund' }).success).toBe(true)
  })

  it('still refuses a mismatched confirmation', () => {
    expect(PasswordResetSchema.safeParse({
      token: 't', password: 'brotherhood fund', confirmPassword: 'brotherhood funds',
    }).success).toBe(false)
  })
})
