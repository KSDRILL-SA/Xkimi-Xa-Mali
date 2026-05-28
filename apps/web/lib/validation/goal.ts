import { z } from 'zod'

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
    .refine(
      (d) => new Date(d) > new Date(),
      'Deadline must be in the future',
    ),
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

export type CreateGoalInput = z.infer<typeof CreateGoalSchema>
export type UpdateGoalInput = z.infer<typeof UpdateGoalSchema>
export type RecordProgressInput = z.infer<typeof RecordProgressSchema>
