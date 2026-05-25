import { z } from 'zod'
import { isValidBankName, isValidAccountNumberFormat, isValidBranchCode } from '@/lib/sa-banks'

const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/

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
  line1: z.string().min(1, 'Street address is required').max(100),
  line2: z.string().max(100).optional().or(z.literal('')),
  city: z.string().min(1, 'City is required').max(50),
  province: z.enum(SA_PROVINCES, { errorMap: () => ({ message: 'Select a province' }) }),
  postalCode: z.string().regex(/^\d{4}$/, 'Postal code must be 4 digits'),
})

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50).optional(),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50).optional(),
  phone: z.string().regex(SA_PHONE_REGEX, 'Enter a valid SA mobile number').optional(),
  address: AddressSchema.optional(),
})

export const CreateBankAccountSchema = z.object({
  bankName: z.string().refine(isValidBankName, 'Select a supported bank'),
  accountNumber: z
    .string()
    .refine(isValidAccountNumberFormat, 'Account number must be 6–12 digits'),
  accountType: z.enum(['SAVINGS', 'CHEQUE', 'TRANSMISSION']),
  branchCode: z.string().refine(isValidBranchCode, 'Branch code must be 6 digits'),
  isPrimary: z.boolean().optional(),
})

export const UpdateBankAccountSchema = z.object({
  bankName: z.string().refine(isValidBankName, 'Select a supported bank').optional(),
  accountType: z.enum(['SAVINGS', 'CHEQUE', 'TRANSMISSION']).optional(),
  branchCode: z.string().refine(isValidBranchCode, 'Branch code must be 6 digits').optional(),
  isPrimary: z.boolean().optional(),
})

export const NotificationPreferencesSchema = z.object({
  sms: z.boolean().optional(),
  email: z.boolean().optional(),
  push: z.boolean().optional(),
})

export type AddressInput = z.infer<typeof AddressSchema>
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
export type CreateBankAccountInput = z.infer<typeof CreateBankAccountSchema>
export type UpdateBankAccountInput = z.infer<typeof UpdateBankAccountSchema>
export type NotificationPreferencesInput = z.infer<typeof NotificationPreferencesSchema>
