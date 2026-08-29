import { describe, it, expect } from 'vitest'
import { PasswordResetRequestSchema, PasswordResetFormSchema, PasswordResetSchema } from '../schemas'

describe('PasswordResetRequestSchema', () => {
  it('normalises email casing, same as LoginSchema', () => {
    const parsed = PasswordResetRequestSchema.parse({ email: 'Kurhula04S@Gmail.com' })
    expect(parsed.email).toBe('kurhula04s@gmail.com')
  })

  it('trims surrounding whitespace', () => {
    const parsed = PasswordResetRequestSchema.parse({ email: '  someone@example.com  ' })
    expect(parsed.email).toBe('someone@example.com')
  })
})

describe('PasswordResetFormSchema', () => {
  // The real bug: the reset-password form's fields are exactly
  // { password, confirmPassword } — no token input exists, so this is what
  // react-hook-form actually hands the resolver on submit.
  const formFields = { password: 'a-strong-password-123', confirmPassword: 'a-strong-password-123' }

  it('accepts the form fields with no token present', () => {
    const result = PasswordResetFormSchema.safeParse(formFields)
    expect(result.success).toBe(true)
  })

  it('still rejects mismatched passwords', () => {
    const result = PasswordResetFormSchema.safeParse({ ...formFields, confirmPassword: 'something-else-123' })
    expect(result.success).toBe(false)
  })

  // Proves the fix actually fixes the reported bug, not just that the new
  // schema is internally consistent: PasswordResetSchema (the old resolver)
  // requires `token`, so the exact same form data that now succeeds against
  // PasswordResetFormSchema must fail against it — that mismatch was the bug.
  it('demonstrates why the full PasswordResetSchema was the wrong resolver for this form', () => {
    const result = PasswordResetSchema.safeParse(formFields)
    expect(result.success).toBe(false)
  })
})
