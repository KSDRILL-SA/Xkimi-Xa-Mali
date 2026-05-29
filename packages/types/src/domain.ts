import type {
  User,
  Role,
  BankAccount,
  PaymentMandate,
  Contribution,
  Transaction,
  Goal,
  GoalProgress,
  Notification,
  NotificationPreference,
  AuditLog,
  Invitation,
  UserStatus,
  MandateStatus,
  ContributionStatus,
  TransactionStatus,
  GoalStatus,
  GoalType,
  NotificationChannel,
} from '@prisma/client'

export type {
  User,
  Role,
  BankAccount,
  PaymentMandate,
  Contribution,
  Transaction,
  Goal,
  GoalProgress,
  Notification,
  NotificationPreference,
  AuditLog,
  Invitation,
  UserStatus,
  MandateStatus,
  ContributionStatus,
  TransactionStatus,
  GoalStatus,
  GoalType,
  NotificationChannel,
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

export type MemberSummary = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: UserStatus
  createdAt: Date
  _count: {
    contributions: number
    mandates: number
  }
}

export type MemberDetail = User & {
  roles: Array<{ role: Role }>
  bankAccounts: Pick<BankAccount, 'id' | 'bankName' | 'accountType' | 'createdAt'>[]
  mandates: Pick<PaymentMandate, 'id' | 'status' | 'amount' | 'debitDay' | 'createdAt'>[]
  contributions: Pick<Contribution, 'id' | 'periodMonth' | 'periodYear' | 'amountDue' | 'amountPaid' | 'status'>[]
  notificationPreference: Pick<NotificationPreference, 'sms' | 'email' | 'push'> | null
  _count: { contributions: number; mandates: number }
}

export type GoalSummary = Pick<Goal, 'id' | 'title' | 'type' | 'status' | 'targetAmount' | 'currentAmount' | 'deadline' | 'lockedAt' | 'createdAt'>

export type AuditRow = {
  id: string
  action: string
  entity: string
  entityId: string
  payload: unknown
  ipAddress: string | null
  createdAt: Date
  user: { id: string; firstName: string; lastName: string; email: string } | null
}
