-- Performance indexes: cover FK and high-cardinality filter fields that were missing
-- ─────────────────────────────────────────────────────────────────────────────

-- Goal.lockedById — FK without index; queried when listing goals locked by a user
CREATE INDEX "goals_lockedById_idx" ON "goals"("lockedById");

-- Transaction.type — enum filter used in admin contribution reports and audit queries
CREATE INDEX "transactions_type_idx" ON "transactions"("type");

-- PasswordResetToken.expiresAt — token cleanup job scans by expiry; full-table scan without index
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- EmailVerificationToken.expiresAt — same pattern as password reset cleanup
CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

-- PaymentMandate.delayedUntil — Inngest mandate-delay-handler queries ACTIVE mandates where
-- delayedUntil <= now() to determine when to resume debit orders
CREATE INDEX "payment_mandates_delayedUntil_idx" ON "payment_mandates"("delayedUntil");
