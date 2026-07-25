import { z } from 'zod'
import { isValidBankName, isValidAccountNumberFormat, isValidBranchCode } from './banks'

const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/
const SA_ID_REGEX    = /^\d{13}$/

function validateSAId(id: string): boolean {
  if (!SA_ID_REGEX.test(id)) return false
  let sum = 0
  let alternate = false
  for (let i = id.length - 1; i >= 0; i--) {
    let n = parseInt(id[i]!, 10)
    if (alternate) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  // Emails are case-insensitive — normalise so "Kurhula@x.com" matches the
  // stored "kurhula@x.com" record.
  email:    z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const RegisterSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Please enter a valid email address'),
  phone:    z.string().regex(SA_PHONE_REGEX, 'Please enter a valid SA mobile number (e.g. 0821234567)'),
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName:  z.string().min(2, 'Last name must be at least 2 characters').max(50),
  idNumber:  z
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

export const PasswordResetRequestSchema = z.object({
  email: z.string().email(),
})

export const PasswordResetSchema = z
  .object({
    token:           z.string().min(1),
    password:        z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

// ── Mandates ─────────────────────────────────────────────────────────────────

export const CreateMandateSchema = z.object({
  bankAccountId: z.string().cuid('Invalid bank account'),
  debitDay:      z.number().int().min(1, 'Debit day must be between 1 and 28').max(28, 'Debit day must be between 1 and 28'),
  amount:        z.number().min(100, 'Minimum contribution is R100').max(10_000, 'Maximum contribution is R10,000'),
})

export const UpdateMandateSchema = z.object({
  debitDay: z.number().int().min(1).max(28).optional(),
  amount:   z.number().min(100).max(10_000, 'Maximum contribution is R10,000').optional(),
})

export const DelayMandateSchema = z.object({
  newDate: z.string().date('Please provide a valid date (YYYY-MM-DD)'),
  reason:  z.string().max(200).optional(),
})

// ── Contributions ─────────────────────────────────────────────────────────────

export const ManualContributionSchema = z.object({
  amount:      z.number().min(100, 'Minimum contribution is R100').max(10_000, 'Maximum contribution is R10,000'),
  periodMonth: z.number().int().min(1).max(12),
  periodYear:  z.number().int().min(2024).max(new Date().getFullYear() + 1, 'Cannot pay for periods too far in the future'),
  budgetOverrideConfirmed: z.boolean().optional(),
  budgetOverrideReason:    z.string().max(200, 'Reason cannot exceed 200 characters').optional(),
})

export const GenerateContributionsSchema = z.object({
  month: z.number().int().min(1, 'Month must be 1–12').max(12, 'Month must be 1–12'),
  year:  z.number().int().min(2024, 'Year must be 2024 or later'),
})

// ── Profile ───────────────────────────────────────────────────────────────────

export const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const

export const AddressSchema = z.object({
  line1:      z.string().min(1, 'Street address is required').max(100),
  line2:      z.string().max(100).optional().or(z.literal('')),
  city:       z.string().min(1, 'City is required').max(50),
  province:   z.enum(SA_PROVINCES, { errorMap: () => ({ message: 'Select a province' }) }),
  postalCode: z.string().regex(/^\d{4}$/, 'Postal code must be 4 digits'),
})

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50).optional(),
  lastName:  z.string().min(2, 'Last name must be at least 2 characters').max(50).optional(),
  phone:     z.string().regex(SA_PHONE_REGEX, 'Enter a valid SA mobile number').optional(),
  address:   AddressSchema.optional(),
})

export const CreateBankAccountSchema = z.object({
  bankName:      z.string().refine(isValidBankName, 'Select a supported bank'),
  accountNumber: z.string().refine(isValidAccountNumberFormat, 'Account number must be 6–12 digits'),
  accountType:   z.enum(['SAVINGS', 'CHEQUE', 'TRANSMISSION']),
  branchCode:    z.string().refine(isValidBranchCode, 'Branch code must be 6 digits'),
  isPrimary:     z.boolean().optional(),
})

export const UpdateBankAccountSchema = z.object({
  bankName:    z.string().refine(isValidBankName, 'Select a supported bank').optional(),
  accountType: z.enum(['SAVINGS', 'CHEQUE', 'TRANSMISSION']).optional(),
  branchCode:  z.string().refine(isValidBranchCode, 'Branch code must be 6 digits').optional(),
  isPrimary:   z.boolean().optional(),
})

export const NotificationPreferencesSchema = z.object({
  sms:      z.boolean().optional(),
  email:    z.boolean().optional(),
  push:     z.boolean().optional(),
  whatsapp: z.boolean().optional(),
})

// ── Inferred types ─────────────────────────────────────────────────────────────

export type LoginInput                    = z.infer<typeof LoginSchema>
export type RegisterInput                 = z.infer<typeof RegisterSchema>
export type RegisterStep2Input            = z.infer<typeof RegisterStep2Schema>
export type PasswordResetRequestInput     = z.infer<typeof PasswordResetRequestSchema>
export type PasswordResetInput            = z.infer<typeof PasswordResetSchema>
export type ChangePasswordInput           = z.infer<typeof ChangePasswordSchema>
export type CreateMandateInput            = z.infer<typeof CreateMandateSchema>
export type UpdateMandateInput            = z.infer<typeof UpdateMandateSchema>
export type DelayMandateInput             = z.infer<typeof DelayMandateSchema>
export type ManualContributionInput       = z.infer<typeof ManualContributionSchema>
export type GenerateContributionsInput    = z.infer<typeof GenerateContributionsSchema>
export type AddressInput                  = z.infer<typeof AddressSchema>
export type UpdateProfileInput            = z.infer<typeof UpdateProfileSchema>
export type CreateBankAccountInput        = z.infer<typeof CreateBankAccountSchema>
export type UpdateBankAccountInput        = z.infer<typeof UpdateBankAccountSchema>
export type NotificationPreferencesInput  = z.infer<typeof NotificationPreferencesSchema>

// ── Goal schemas ───────────────────────────────────────────────────────────────

const GOAL_TYPES = ['MONTHLY', 'YEARLY', 'CUSTOM'] as const

export const CreateGoalSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(120, 'Title too long'),
  description: z.string().max(500, 'Description too long').optional(),
  type: z.enum(GOAL_TYPES, { required_error: 'Goal type is required' }),
  targetAmount: z
    .number({ required_error: 'Target amount is required' })
    .min(100, 'Target must be at least R100')
    .max(10_000_000, 'Target cannot exceed R10 million'),
  deadline: z
    .string({ required_error: 'Deadline is required' })
    .date('Deadline must be a valid date (YYYY-MM-DD)')
    .refine((d) => new Date(d) > new Date(), 'Deadline must be in the future'),
})

export const UpdateGoalSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(500).optional(),
  type: z.enum(GOAL_TYPES).optional(),
  targetAmount: z.number().min(100).max(10_000_000).optional(),
  deadline: z
    .string()
    .date('Deadline must be a valid date (YYYY-MM-DD)')
    .refine((d) => new Date(d) > new Date(), 'Deadline must be in the future')
    .optional(),
})

export const RecordProgressSchema = z.object({
  amount: z
    .number({ required_error: 'Amount is required' })
    .min(1, 'Amount must be positive')
    .max(10_000_000, 'Amount too large'),
  note: z.string().max(200).optional(),
})

/**
 * The smallest directed extra payment worth collecting through the gateway —
 * anything less costs more in fees than it adds to the fund. Shared so the
 * schema and the service enforce the same floor.
 */
export const MIN_GOAL_PAYMENT = 10

export const GoalPaymentSchema = z.object({
  amount: z
    .number({ required_error: 'Amount is required' })
    .min(MIN_GOAL_PAYMENT, `The minimum payment toward a goal is R${MIN_GOAL_PAYMENT}`)
    .max(50_000, 'Maximum payment is R50,000'),
})

export type CreateGoalInput      = z.infer<typeof CreateGoalSchema>
export type UpdateGoalInput      = z.infer<typeof UpdateGoalSchema>
export type RecordProgressInput  = z.infer<typeof RecordProgressSchema>
export type GoalPaymentInput     = z.infer<typeof GoalPaymentSchema>

// ── Report / statement schemas ─────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

export const StatementRequestSchema = z.object({
  month: z.number().int().min(1, 'Month must be between 1 and 12').max(12, 'Month must be between 1 and 12'),
  year:  z.number().int().min(2024, 'Year must be 2024 or later').max(CURRENT_YEAR + 1, 'Year too far in the future'),
})

export const AdminReportRequestSchema = z.object({
  month: z.number().int().min(1).max(12),
  year:  z.number().int().min(2024),
})

export const TransactionFilterSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED']).optional(),
  type:   z.enum(['DEBIT_ORDER', 'MANUAL', 'REVERSAL', 'SCHEDULED']).optional(),
  from:   z.string().date().optional(),
  to:     z.string().date().optional(),
  page:   z.number().int().min(1).default(1),
  limit:  z.number().int().min(1).max(100).default(20),
})

export type StatementRequest   = z.infer<typeof StatementRequestSchema>
export type AdminReportRequest = z.infer<typeof AdminReportRequestSchema>
export type TransactionFilter  = z.infer<typeof TransactionFilterSchema>

// ── Community board schemas ─────────────────────────────────────────────────

export const PostMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(500, 'Message cannot exceed 500 characters'),
  replyToId: z.string().cuid('Invalid message id').optional(),
})

export const PinMessageSchema = z.object({
  isPinned: z.boolean({ required_error: 'isPinned is required' }),
})

export type PostMessageInput = z.infer<typeof PostMessageSchema>
export type PinMessageInput  = z.infer<typeof PinMessageSchema>

// ── Budget guard schemas ────────────────────────────────────────────────────

export const CreateBudgetSchema = z.object({
  type: z.enum(['MONTHLY', 'YEARLY', 'CUSTOM']),
  amount: z.number()
    .min(100, 'Budget must be at least R100 (the contribution minimum)')
    .max(10000, 'Budget cannot exceed R10,000'),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
})

export const UpdateBudgetAmountSchema = z.object({
  amount: z.number()
    .min(100, 'Budget must be at least R100 (the contribution minimum)')
    .max(10000, 'Budget cannot exceed R10,000'),
})

export type CreateBudgetInput       = z.infer<typeof CreateBudgetSchema>
export type UpdateBudgetAmountInput = z.infer<typeof UpdateBudgetAmountSchema>
