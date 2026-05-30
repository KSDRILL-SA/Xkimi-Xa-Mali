-- Phase 2: Schema hardening — security fields, retry tracking, new indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- User: brute-force login protection
ALTER TABLE "users" ADD COLUMN "loginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- PaymentMandate: debit delay tracking + gateway failure reason
ALTER TABLE "payment_mandates" ADD COLUMN "delayedUntil" TIMESTAMP(3);
ALTER TABLE "payment_mandates" ADD COLUMN "failureReason" TEXT;
CREATE INDEX "payment_mandates_status_idx" ON "payment_mandates"("status");

-- Transaction: retry counter + failure reason for debit-run engine
ALTER TABLE "transactions" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "failureReason" TEXT;

-- Contribution: extra indexes for admin reports and dashboard filters
CREATE INDEX "contributions_userId_status_idx" ON "contributions"("userId", "status");
CREATE INDEX "contributions_periodYear_periodMonth_idx" ON "contributions"("periodYear", "periodMonth");

-- Notification: retry tracking
ALTER TABLE "notifications" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "notifications" ADD COLUMN "errorMessage" TEXT;
CREATE INDEX "notifications_userId_status_idx" ON "notifications"("userId", "status");

-- AuditLog: index for action-based searches
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- InvitationStatus: add EXPIRED variant
ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- LoginHistory: track login events for security analysis
CREATE TABLE "login_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_history_userId_createdAt_idx" ON "login_history"("userId", "createdAt");
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SystemConfig: admin-managed key-value configuration store
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);
