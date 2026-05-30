-- Database Hardening V3: Schema enrichment, CHECK constraints, advanced indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- ============================================================================
-- 1. ENUM ADDITIONS
-- ============================================================================

ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "NotifChannel" ADD VALUE IF NOT EXISTS 'WHATSAPP';

-- ============================================================================
-- 2. DECIMAL PRECISION UPGRADE (10,2 → 12,2 for aggregate headroom)
-- ============================================================================

ALTER TABLE "payment_mandates" ALTER COLUMN "amount" TYPE DECIMAL(12,2);
ALTER TABLE "contributions" ALTER COLUMN "amountDue" TYPE DECIMAL(12,2);
ALTER TABLE "contributions" ALTER COLUMN "amountPaid" TYPE DECIMAL(12,2);
ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE DECIMAL(12,2);
ALTER TABLE "goals" ALTER COLUMN "targetAmount" TYPE DECIMAL(12,2);
ALTER TABLE "goals" ALTER COLUMN "currentAmount" TYPE DECIMAL(12,2);
ALTER TABLE "goal_progress" ALTER COLUMN "amount" TYPE DECIMAL(12,2);
ALTER TABLE "invitations" ALTER COLUMN "minimumAmount" TYPE DECIMAL(12,2);

-- ============================================================================
-- 3. NEW COLUMNS
-- ============================================================================

-- BankAccount: track modification time
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);
UPDATE "bank_accounts" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "bank_accounts" ALTER COLUMN "updatedAt" SET NOT NULL;

-- PaymentMandate: approval tracking
ALTER TABLE "payment_mandates" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "payment_mandates" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

-- PaymentMandate: unique constraint on netcashMandateId
CREATE UNIQUE INDEX IF NOT EXISTS "payment_mandates_netcashMandateId_key"
  ON "payment_mandates"("netcashMandateId") WHERE "netcashMandateId" IS NOT NULL;

-- Goal: track creator
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- GoalProgress: track who recorded and optional note
ALTER TABLE "goal_progress" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "goal_progress" ADD COLUMN IF NOT EXISTS "recordedById" TEXT;

-- NotificationTemplate: email subject line
ALTER TABLE "notification_templates" ADD COLUMN IF NOT EXISTS "subject" TEXT;

-- Notification: external provider reference
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;

-- NotificationPreference: dedicated WhatsApp toggle
ALTER TABLE "notification_preferences" ADD COLUMN IF NOT EXISTS "whatsapp" BOOLEAN NOT NULL DEFAULT true;

-- Transaction: reversal chain linking
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "reversalOfId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_reversalOfId_key"
  ON "transactions"("reversalOfId") WHERE "reversalOfId" IS NOT NULL;

-- Invitation: revocation tracking
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "revokedById" TEXT;
ALTER TABLE "invitations" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

-- ============================================================================
-- 4. FOREIGN KEYS FOR NEW COLUMNS
-- ============================================================================

ALTER TABLE "payment_mandates"
  ADD CONSTRAINT "payment_mandates_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goals"
  ADD CONSTRAINT "goals_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goal_progress"
  ADD CONSTRAINT "goal_progress_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "transactions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 5. CHECK CONSTRAINTS (database-level data integrity)
-- ============================================================================

ALTER TABLE "payment_mandates"
  ADD CONSTRAINT "chk_mandate_debit_day" CHECK ("debitDay" >= 1 AND "debitDay" <= 31);

ALTER TABLE "payment_mandates"
  ADD CONSTRAINT "chk_mandate_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "contributions"
  ADD CONSTRAINT "chk_contribution_month" CHECK ("periodMonth" >= 1 AND "periodMonth" <= 12);

ALTER TABLE "contributions"
  ADD CONSTRAINT "chk_contribution_year" CHECK ("periodYear" >= 2020 AND "periodYear" <= 2100);

ALTER TABLE "contributions"
  ADD CONSTRAINT "chk_contribution_due_positive" CHECK ("amountDue" > 0);

ALTER TABLE "contributions"
  ADD CONSTRAINT "chk_contribution_paid_nonneg" CHECK ("amountPaid" >= 0);

ALTER TABLE "transactions"
  ADD CONSTRAINT "chk_transaction_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "transactions"
  ADD CONSTRAINT "chk_transaction_retry_nonneg" CHECK ("retryCount" >= 0);

ALTER TABLE "goals"
  ADD CONSTRAINT "chk_goal_target_positive" CHECK ("targetAmount" > 0);

ALTER TABLE "goals"
  ADD CONSTRAINT "chk_goal_current_nonneg" CHECK ("currentAmount" >= 0);

ALTER TABLE "goal_progress"
  ADD CONSTRAINT "chk_progress_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "invitations"
  ADD CONSTRAINT "chk_invite_minimum_amount" CHECK ("minimumAmount" >= 100);

ALTER TABLE "users"
  ADD CONSTRAINT "chk_user_login_attempts_nonneg" CHECK ("loginAttempts" >= 0);

ALTER TABLE "notifications"
  ADD CONSTRAINT "chk_notification_retry_nonneg" CHECK ("retryCount" >= 0);

ALTER TABLE "contributions"
  ADD CONSTRAINT "chk_contribution_paid_lte_due" CHECK ("amountPaid" <= "amountDue");

ALTER TABLE "payment_mandates"
  ADD CONSTRAINT "chk_mandate_delay_after_create" CHECK ("delayedUntil" IS NULL OR "delayedUntil" > "createdAt");

-- ============================================================================
-- 6. ADVANCED INDEXES
-- ============================================================================

-- User: status-based lookups for admin member listing
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users"("status");
CREATE INDEX IF NOT EXISTS "users_email_status_idx" ON "users"("email", "status");

-- Session: cleanup expired sessions
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions"("expires");

-- BankAccount: primary account lookup per user
CREATE INDEX IF NOT EXISTS "bank_accounts_userId_isPrimary_idx"
  ON "bank_accounts"("userId", "isPrimary");

-- PaymentMandate: find active mandate for user (hot path)
CREATE INDEX IF NOT EXISTS "payment_mandates_userId_status_idx"
  ON "payment_mandates"("userId", "status");

-- Transaction: contribution status recalculation
CREATE INDEX IF NOT EXISTS "transactions_contributionId_status_idx"
  ON "transactions"("contributionId", "status");

-- Contribution: status + period for admin reports
CREATE INDEX IF NOT EXISTS "contributions_status_period_idx"
  ON "contributions"("status", "periodYear", "periodMonth");

-- Goal: status-based queries
CREATE INDEX IF NOT EXISTS "goals_status_idx" ON "goals"("status");
CREATE INDEX IF NOT EXISTS "goals_status_deadline_idx" ON "goals"("status", "deadline");
CREATE INDEX IF NOT EXISTS "goals_createdById_idx" ON "goals"("createdById");

-- GoalProgress: progress by date within a goal
CREATE INDEX IF NOT EXISTS "goal_progress_goalId_recordedAt_idx"
  ON "goal_progress"("goalId", "recordedAt");

-- Notification: queue processing order (status + creation time)
CREATE INDEX IF NOT EXISTS "notifications_status_createdAt_idx"
  ON "notifications"("status", "createdAt");

-- Notification: external reference lookup for delivery receipts
CREATE INDEX IF NOT EXISTS "notifications_externalRef_idx"
  ON "notifications"("externalRef") WHERE "externalRef" IS NOT NULL;

-- NotificationTemplate: channel-based lookups
CREATE INDEX IF NOT EXISTS "notification_templates_channel_idx"
  ON "notification_templates"("channel");

-- Invitation: expiry cleanup
CREATE INDEX IF NOT EXISTS "invitations_status_expiresAt_idx"
  ON "invitations"("status", "expiresAt");

-- LoginHistory: security analysis (failed logins)
CREATE INDEX IF NOT EXISTS "login_history_userId_success_idx"
  ON "login_history"("userId", "success");

-- AuditLog: time-based scans for dashboard activity feed
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- ============================================================================
-- 7. PARTIAL INDEXES (PostgreSQL-specific, high-value)
-- ============================================================================

CREATE INDEX IF NOT EXISTS "idx_mandates_active"
  ON "payment_mandates"("userId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "idx_mandates_pending"
  ON "payment_mandates"("userId")
  WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "idx_contributions_pending"
  ON "contributions"("userId", "dueDate")
  WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "idx_contributions_overdue"
  ON "contributions"("userId", "dueDate")
  WHERE "status" = 'OVERDUE';

CREATE INDEX IF NOT EXISTS "idx_notifications_queued"
  ON "notifications"("createdAt")
  WHERE "status" = 'QUEUED';

CREATE INDEX IF NOT EXISTS "idx_notifications_failed_retryable"
  ON "notifications"("retryCount", "createdAt")
  WHERE "status" = 'FAILED';

CREATE INDEX IF NOT EXISTS "idx_goals_active"
  ON "goals"("deadline")
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "idx_invitations_pending"
  ON "invitations"("expiresAt")
  WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "idx_tokens_unused_password"
  ON "password_reset_tokens"("expiresAt")
  WHERE "usedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_tokens_unused_email"
  ON "email_verification_tokens"("expiresAt")
  WHERE "usedAt" IS NULL;
