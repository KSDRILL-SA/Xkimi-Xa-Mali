import { z } from 'zod'

const CURRENT_YEAR = new Date().getFullYear()

export const StatementRequestSchema = z.object({
  month: z
    .number()
    .int()
    .min(1, 'Month must be between 1 and 12')
    .max(12, 'Month must be between 1 and 12'),
  year: z
    .number()
    .int()
    .min(2024, 'Year must be 2024 or later')
    .max(CURRENT_YEAR + 1, 'Year too far in the future'),
})

export const AdminReportRequestSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2024),
})

export const TransactionFilterSchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED']).optional(),
  type: z.enum(['DEBIT_ORDER', 'MANUAL', 'REVERSAL']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

export type StatementRequest = z.infer<typeof StatementRequestSchema>
export type AdminReportRequest = z.infer<typeof AdminReportRequestSchema>
export type TransactionFilter = z.infer<typeof TransactionFilterSchema>
