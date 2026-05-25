import type {
  User,
  Role,
  BankAccount,
  PaymentMandate,
  Contribution,
  Transaction,
  Goal,
  Notification,
  AuditLog,
  UserStatus,
  MandateStatus,
  ContributionStatus,
  TransactionStatus,
  GoalStatus,
} from '@prisma/client'

export type {
  User,
  Role,
  BankAccount,
  PaymentMandate,
  Contribution,
  Transaction,
  Goal,
  Notification,
  AuditLog,
  UserStatus,
  MandateStatus,
  ContributionStatus,
  TransactionStatus,
  GoalStatus,
}

export type UserWithRoles = User & {
  roles: Array<{ role: Role }>
}

export type SafeBankAccount = Omit<BankAccount, 'accountNumber'> & {
  accountNumberMasked: string
}

export type ContributionWithTransactions = Contribution & {
  transactions: Transaction[]
}

export type ApiResponse<T> = {
  data: T
  meta: {
    requestId: string
    timestamp: string
    pagination?: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

export type ApiError = {
  error: {
    code: string
    message: string
    traceId: string
  }
}
