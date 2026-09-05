import { z } from 'zod'
import { isValidSAId } from './sa-id'
import {
  MIN_CONTRIBUTION_ZAR, MAX_CONTRIBUTION_ZAR,
  TRANSACTION_TYPES, TRANSACTION_STATUSES,
} from './constants'
import { refusePeriod, PERIOD_REFUSAL_MESSAGE } from './contribution-period'
import { isValidBankName, isValidAccountNumberFormat, isValidBranchCode } from './banks'

const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/
const SA_ID_REGEX    = /^\d{13}$/

// One implementation, in `sa-id`, which also derives the date of birth the
// number already carries. This file held a second copy of the same checksum —
// identical today, and the kind of pair that stops being identical the first
// time somebody improves one of them.
const validateSAId = isValidSAId

// ── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  // Emails are case-insensitive — normalise so "Kurhula@x.com" matches the
  // stored "kurhula@x.com" record.
  email:    z.string().trim().toLowerCase().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

/**
 * The password strength rule, in one place.
 *
 * It was in three, and they disagreed. `RegisterSchema` and the reset and
 * change schemas below all required twelve characters. The registration *route*
 * validated by hand — eight characters, one uppercase, one digit — and never
 * imported any of them, so the only path that creates an account enforced the
 * weakest rule in the codebase, and the comment below argued against exactly
 * the rule it was applying.
 *
 * Anything that accepts a new password imports this. A second copy of the rule
 * is how the first drift happened.
 */
export const PASSWORD_MIN_LENGTH = 12

/**
 * Length over composition. Twelve characters of something a member will
 * actually remember beats eight with a capital and a digit bolted on, which in
 * practice produces `Password1` — the shape attackers try first. Current NIST
 * guidance, and also the kinder rule.
 */
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)

export const RegisterSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Please enter a valid email address'),
  phone:    z.string().regex(SA_PHONE_REGEX, 'Please enter a valid SA mobile number (e.g. 0821234567)'),
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName:  z.string().min(2, 'Last name must be at least 2 characters').max(50),
  idNumber:  z
    .string()
    .regex(SA_ID_REGEX, 'SA ID must be 13 digits')
    .refine(validateSAId, 'Please enter a valid SA ID number'),
  // Only new and changed passwords are held to the policy. LoginSchema
  // deliberately applies no strength rule at all, so an existing password keeps
  // working until its owner is asked to replace it.
  password: PasswordSchema,
  consentToPopia: z.literal(true, {
    errorMap: () => ({ message: 'You must consent to our privacy policy' }),
  }),
})

export const RegisterStep2Schema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName:  z.string().min(2, 'Last name must be at least 2 characters').max(50),
  // Confirmed, not supplied.
  //
  // The admin who invited this person recorded their ID, because they are the
  // one who knows them. What the member does here is show they are the person
  // that invitation was for. It was optional and self-reported before, which
  // left the Foundation trusting an unverified identity for the field that
  // ties a bank account to a person — and nobody could correct it afterwards.
  idNumber:  z
    .string()
    .regex(SA_ID_REGEX, 'SA ID must be 13 digits')
    .refine(validateSAId, 'Please enter a valid SA ID number'),
  password: PasswordSchema,
  consentToPopia: z.boolean().refine((v) => v, 'You must consent to our privacy policy'),
})

export const PasswordResetRequestSchema = z.object({
  // Same normalisation as LoginSchema — without it, "Kurhula@x.com" silently
  // fails to match the stored "kurhula@x.com" record. The route always
  // returns a generic success message (no user enumeration), so a casing
  // mismatch here is indistinguishable from "email not registered" to the
  // person requesting the reset — this was a real, reported bug, not
  // theoretical.
  email: z.string().trim().toLowerCase().email('Please enter a valid email address'),
})

const PasswordResetFields = z.object({
  token:           z.string().min(1),
  password:        PasswordSchema,
  confirmPassword: z.string(),
})

export const PasswordResetSchema = PasswordResetFields.refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

/**
 * Same rules, minus `token` — for the form's own resolver.
 *
 * The token never has an input field; it arrives as a page prop (from the
 * emailed link's query string) and is merged in only at submit time. Using
 * the full `PasswordResetSchema` as the form's resolver was a real, shipped
 * bug: react-hook-form validates the form's actual field values, which never
 * include `token`, against a schema that requires it — validation fails
 * silently on every submit, `onSubmit` never runs, and since no field is
 * bound to `token` there's nowhere for `errors.token` to render. The button
 * looks like it does nothing at all, with no visible error.
 */
export const PasswordResetFormSchema = PasswordResetFields.omit({ token: true }).refine(
  (d) => d.password === d.confirmPassword,
  { message: 'Passwords do not match', path: ['confirmPassword'] },
)

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword:     PasswordSchema,
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
  // A flat R100 floor here used to make the last partial payment on any
  // period impossible whenever less than R100 remained owed — the schema
  // has no idea what's actually still due, only what the *first* payment on
  // a fresh period should look like. `submitManualPayment` knows the real
  // remaining balance and enforces the R100 minimum there, capped at
  // whatever is actually left, so this only guards against a non-positive
  // amount and the top-level sanity ceiling.
  amount:      z.number().positive('Amount must be greater than zero').max(10_000, 'Maximum contribution is R10,000'),
  periodMonth: z.number().int().min(1).max(12),
  periodYear:  z.number().int().min(2024).max(new Date().getFullYear() + 1, 'Cannot pay for periods too far in the future'),
  budgetOverrideConfirmed: z.boolean().optional(),
  budgetOverrideReason:    z.string().max(200, 'Reason cannot exceed 200 characters').optional(),
  /**
   * One token per payment the member *intends*, supplied by the client.
   *
   * A member may legitimately pay twice in the same period — a partial now and
   * the balance later — so the server cannot derive this from the period the way
   * the debit run does. What it can do is refuse to submit the same *intent*
   * twice: a double tap, a network retry and a browser back-and-resubmit all
   * carry the token that was generated when the form was opened, while a
   * genuinely new payment carries a fresh one.
   *
   * **Required.** It was optional, and the server filled the gap with
   * `randomUUID()` — so a caller that omitted it got a fresh identity on every
   * request and no protection at all, from a column named `idempotencyKey`.
   * The warning that was logged in that case went to a log nobody reads.
   *
   * For a money-moving request the server is not entitled to invent the thing
   * that makes it safe to retry. A client that cannot name its intent has not
   * expressed one, and is refused. Every client already sends this.
   */
  idempotencyKey: z.string().uuid('An idempotency token is required for a payment'),
})

/**
 * A contribution that reached the group's bank account without the gateway —
 * cash handed over, or an EFT the member pushed themselves — recorded after
 * the fact by an admin who has seen it on the statement.
 *
 * This exists because Netcash declined the DebiCheck application: their
 * processing bank requires an applicant to already hold an active debit-order
 * base, which a new stokvel by definition cannot. Members have been paying by
 * EFT since June 2026 regardless, and until now none of it could be recorded —
 * every payment path in the system required a gateway mandate.
 *
 * Note what is NOT here: no budget-override fields, no idempotency token. This
 * is not a member spending money, it is an admin recording money that has
 * already arrived, so a budget cannot be exceeded by writing it down. Double
 * submission is guarded in the service instead, against the reference — the
 * one thing that identifies a specific real-world payment.
 */
export const OfflineContributionSchema = z.object({
  userId: z.string().min(1, 'Choose a member'),
  amount: z
    .number()
    .positive('Amount must be greater than zero')
    .max(MAX_CONTRIBUTION_ZAR, `Maximum contribution is R${MAX_CONTRIBUTION_ZAR.toLocaleString('en-ZA')}`),
  periodMonth: z.number().int().min(1).max(12),
  // No `.max(currentYear + 1)` like ManualContributionSchema: that schema is a
  // member paying forward, this one is an admin recording something that has
  // already happened, and the backlog being recorded here is months in the
  // past. The window is enforced by refusePeriod below, which allows a year
  // either side.
  periodYear: z.number().int().min(2024),
  /**
   * What the member owed for this period, when the system has no way to know.
   *
   * Optional, and only consulted when the period does not exist yet. Where the
   * member has an active mandate the obligation is already established and that
   * amount wins — an admin should not be able to quietly restate what somebody
   * agreed to pay.
   *
   * It matters for exactly the members this feature was built for: someone with
   * no mandate has no recorded obligation at all, so without this the period is
   * created owing precisely what was received, and a part payment settles it in
   * full. Somebody who owed R500 and paid R200 would be marked up to date.
   */
  amountDue: z
    .number()
    .positive('Amount due must be greater than zero')
    .max(MAX_CONTRIBUTION_ZAR, `Maximum contribution is R${MAX_CONTRIBUTION_ZAR.toLocaleString('en-ZA')}`)
    .optional(),
  /**
   * When the money actually reached the account — not when somebody got round
   * to capturing it. This is the date the member's statement will show, and
   * for the June–August backlog it is months before the record is written.
   */
  receivedAt: z.coerce
    .date()
    .max(new Date(Date.now() + 24 * 60 * 60 * 1000), 'That date is in the future — money cannot have arrived yet'),
  /**
   * What this was matched against on the bank statement: an EFT reference, a
   * deposit slip number. Required, and deliberately so.
   *
   * A gateway transaction is self-evidencing — the provider holds the record
   * and gatewayRef points at it. An offline row is one person's claim that
   * money arrived, and the only thing that makes the claim checkable by
   * somebody else later is a pointer back to the bank statement. Without it
   * this feature is an admin being able to mark contributions paid on their
   * word alone.
   */
  reference: z
    .string()
    .trim()
    .min(3, 'Enter the bank reference or deposit slip number this payment appears under')
    .max(120, 'Reference cannot exceed 120 characters'),
  /** Optional context — "paid in cash at the August meeting", etc. */
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional(),
  /**
   * The stored proof of payment — a blob pathname, or a `data:` URL in local
   * development. Never the bytes: the file is read and stored by the console,
   * which owns the upload adapter, and only the reference crosses to this app.
   *
   * Members already send proof of payment to the WhatsApp group. Attaching it
   * here is what turns an offline row from one admin's assertion into something
   * a third person can check against the bank a year later.
   */
  proofUrl: z.string().trim().min(1).max(1024).optional(),
  /**
   * Who counted the money, when there is no document to attach.
   *
   * Cash handed over at a meeting has no proof of payment. A hard file
   * requirement would mean either the money goes unrecorded — the exact failure
   * the offline path exists to prevent — or somebody attaches something
   * irrelevant to get past the gate. So the absence is recorded instead, and
   * named: a row evidenced by attestation is visibly different from one
   * evidenced by a document, and from one evidenced by nothing.
   *
   * Long enough to want two names in it. That is the point — one person's
   * unwitnessed word about cash is what this is trying not to be.
   */
  proofWitness: z
    .string()
    .trim()
    .min(10, 'Say who counted the money and where — one name is not a witness')
    .max(300, 'Witness note cannot exceed 300 characters')
    .optional(),
}).refine(
  (v) => refusePeriod({ month: v.periodMonth, year: v.periodYear }) === null,
  { message: PERIOD_REFUSAL_MESSAGE.OUTSIDE_WINDOW, path: ['periodYear'] },
).refine(
  // Exactly one. Neither means an unevidenced claim about money, which is the
  // thing this whole field exists to stop. Both means the witness note is
  // decoration on a row that already has a document, and a later reader cannot
  // tell which one the payment actually rests on.
  (v) => (v.proofUrl ? 1 : 0) + (v.proofWitness ? 1 : 0) === 1,
  {
    message:
      'Attach the proof of payment, or say who counted the cash — one or the other, not both and not neither',
    path: ['proofUrl'],
  },
)

export const GenerateContributionsSchema = z.object({
  month: z.number().int().min(1, 'Month must be 1–12').max(12, 'Month must be 1–12'),
  year:  z.number().int().min(2024, 'Year must be 2024 or later'),
}).refine(
  // A year of 2024-or-later still accepts 2099. Generating is the widest action
  // there is — one press writes an obligation for every active member, with no
  // undo — so the period has to be one somebody could plausibly mean. Shared
  // with the console, which had no check at all.
  (v) => refusePeriod(v) === null,
  { message: PERIOD_REFUSAL_MESSAGE.OUTSIDE_WINDOW, path: ['year'] },
)

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
export type PasswordResetFormInput        = z.infer<typeof PasswordResetFormSchema>
export type ChangePasswordInput           = z.infer<typeof ChangePasswordSchema>
export type CreateMandateInput            = z.infer<typeof CreateMandateSchema>
export type UpdateMandateInput            = z.infer<typeof UpdateMandateSchema>
export type DelayMandateInput             = z.infer<typeof DelayMandateSchema>
export type ManualContributionInput       = z.infer<typeof ManualContributionSchema>
export type OfflineContributionInput      = z.infer<typeof OfflineContributionSchema>
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
/**
 * The smallest payment toward a goal worth making.
 *
 * Netcash's fee is a flat R10, added to what the member is debited so the goal
 * still nets the full amount. At a R10 minimum that meant paying R20 to give
 * R10 — half of it to the gateway — and the same arithmetic applied to a
 * monthly plan set at the minimum, every month.
 *
 * R50 keeps the worst case at a fifth rather than a half. It is deliberately
 * well below the R100 monthly contribution minimum: chipping in extra is
 * supposed to be something a member can do with what they have.
 */
/** What an admin records about somebody they are inviting into the circle. */
export const CreateInvitationSchema = z.object({
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters').max(50),
  lastName:  z.string().trim().min(2, 'Last name must be at least 2 characters').max(50),
  email:     z.string().trim().toLowerCase().email('Please enter a valid email address'),
  phone:     z.string().regex(SA_PHONE_REGEX, 'Please enter a valid SA mobile number'),
  // Required, and checked. The admin is vouching for who this person is.
  idNumber:  z
    .string()
    .trim()
    .regex(SA_ID_REGEX, 'SA ID must be 13 digits')
    .refine(validateSAId, 'That is not a valid SA ID number — check the digits'),
  // How they know them. `invitedById` already records who invited; this is the
  // part that cannot be derived from anything already stored.
  vouchedFor: z.string().trim().max(200).optional(),
  minimumAmount: z
    .number()
    .min(MIN_CONTRIBUTION_ZAR, `The monthly minimum is R${MIN_CONTRIBUTION_ZAR}`)
    .max(MAX_CONTRIBUTION_ZAR, `The monthly maximum is R${MAX_CONTRIBUTION_ZAR}`),
})

export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>

export const MIN_GOAL_PAYMENT = 50

/**
 * The ceiling on a single gift to a goal.
 *
 * Named rather than written inline because the Founder Guide quotes it. A
 * figure typed into a document and typed again into a validator is the same
 * rule in two places, which is how the guide came to promise a daily posting
 * limit nothing enforced.
 */
export const MAX_GOAL_PAYMENT = 50_000

export const GoalPaymentSchema = z.object({
  /** One token per payment the member intends. Required — see ManualContributionSchema. */
  idempotencyKey: z.string().uuid('An idempotency token is required for a payment'),
  amount: z
    .number({ required_error: 'Amount is required' })
    .min(MIN_GOAL_PAYMENT, `The minimum payment toward a goal is R${MIN_GOAL_PAYMENT}`)
    .max(MAX_GOAL_PAYMENT, `Maximum payment is R${MAX_GOAL_PAYMENT.toLocaleString('en-ZA')}`),
})

/**
 * A member's cash or EFT payment toward a goal, recorded by an admin.
 *
 * The sibling of OfflineContributionSchema, and deliberately its twin: the same
 * evidence rule, the same date handling, the same reference. What differs is
 * only what the money is FOR — a period there, a goal here — because that is
 * the one thing the two are not allowed to be vague about. A payment whose
 * purpose is unclear cannot be checked for having already happened, and
 * "already recorded" is scoped to the thing being paid for.
 *
 * It exists because a member with no mandate cannot reach a goal at all.
 * `payToGoal` requires an active Netcash mandate, which the DebiCheck rejection
 * makes impossible, and the only other route — an admin recording goal progress
 * — credits nobody and refuses the primary fund. Cash handed over for a goal
 * was simply not recordable.
 *
 * The primary fund is not a valid destination here, and that is enforced in the
 * service rather than the type: it fills automatically from monthly
 * contributions, so money for it is a contribution and belongs on the other
 * schema. Recording it as a goal payment would leave the member's month still
 * showing unpaid while the fund total rose — the same money counted once and
 * owed twice.
 */
export const OfflineGoalPaymentSchema = z.object({
  userId: z.string().min(1, 'Choose a member'),
  goalId: z.string().min(1, 'Choose which goal this payment is for'),
  amount: z
    .number()
    .min(MIN_GOAL_PAYMENT, `The minimum payment toward a goal is R${MIN_GOAL_PAYMENT}`)
    .max(MAX_GOAL_PAYMENT, `Maximum payment is R${MAX_GOAL_PAYMENT.toLocaleString('en-ZA')}`),
  receivedAt: z.coerce
    .date()
    .max(new Date(Date.now() + 24 * 60 * 60 * 1000), 'That date is in the future — money cannot have arrived yet'),
  reference: z
    .string()
    .trim()
    .min(3, 'Enter the bank reference or deposit slip number this payment appears under')
    .max(120, 'Reference cannot exceed 120 characters'),
  note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional(),
  proofUrl: z.string().trim().min(1).max(1024).optional(),
  proofWitness: z
    .string()
    .trim()
    .min(10, 'Say who counted the money and where — one name is not a witness')
    .max(300, 'Witness note cannot exceed 300 characters')
    .optional(),
}).refine(
  // The same one-of-two rule the contribution schema states, for the same
  // reason: neither is an unevidenced claim about money, and both leaves a
  // later reader unable to tell which one the payment rests on.
  (v) => (v.proofUrl ? 1 : 0) + (v.proofWitness ? 1 : 0) === 1,
  {
    message:
      'Attach the proof of payment, or say who counted the cash — one or the other, not both and not neither',
    path: ['proofUrl'],
  },
)

export type OfflineGoalPaymentInput = z.infer<typeof OfflineGoalPaymentSchema>

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
  // From the shared lists, not written out again here. This schema is where the
  // omission bit hardest: `?type=OFFLINE` was refused as invalid rather than
  // ignored, so the API could not return the one payment kind these members
  // have. See TRANSACTION_TYPES in ./constants.
  status: z.enum(TRANSACTION_STATUSES).optional(),
  type:   z.enum(TRANSACTION_TYPES).optional(),
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
