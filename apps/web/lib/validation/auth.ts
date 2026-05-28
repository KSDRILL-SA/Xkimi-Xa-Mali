import { z } from 'zod'

const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/
const SA_ID_REGEX = /^\d{13}$/

function validateSAId(id: string): boolean {
  if (!SA_ID_REGEX.test(id)) return false
  // Luhn algorithm check
  let sum = 0
  let alternate = false
  for (let i = id.length - 1; i >= 0; i--) {
    let n = parseInt(id[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

export const RegisterSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().regex(SA_PHONE_REGEX, 'Please enter a valid SA mobile number (e.g. 0821234567)'),
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50),
  idNumber: z
    .string()
    .regex(SA_ID_REGEX, 'SA ID must be 13 digits')
    .refine(validateSAId, 'Please enter a valid SA ID number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  consentToPopia: z.literal(true, {
    errorMap: () => ({ message: 'You must consent to our privacy policy' }),
  }),
})

export const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
})

export const PasswordResetSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8)
      .regex(/[A-Z]/)
      .regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const RegisterStep2Schema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName:  z.string().min(2, 'Last name must be at least 2 characters').max(50),
  idNumber:  z
    .string()
    .optional()
    .refine((v) => !v || (SA_ID_REGEX.test(v) && validateSAId(v)), 'Please enter a valid SA ID number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  consentToPopia: z.boolean().refine((v) => v, 'You must consent to our privacy policy'),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type RegisterStep2Input = z.infer<typeof RegisterStep2Schema>
export type LoginInput = z.infer<typeof LoginSchema>
