-- Phase 1 — Database & Data Integrity
--
-- Two corrections, both additive/idempotent so a redeploy is a no-op.
--
-- 1. Restore foreign-key and hot-path indexes the schema declares but the live
--    database was missing (a prior raw-SQL hardening migration replaced Prisma's
--    stock indexes with partial ones and did not recreate these plain indexes).
--    Every column below is a FK join target or a WHERE/ORDER predicate on a hot
--    query path, per DB-D08. All are absent from the live schema and from any
--    partial index, so these are real sequential-scan risks — most critically
--    transactions.mandateId on the money table and accounts/sessions.userId on
--    every authentication.
--
-- 2. Drop the erroneous full-uniqueness on invitation contact fields. The invite
--    service only rejects a *pending* duplicate (or an existing user); re-inviting
--    a contact whose earlier invite expired or was revoked is intended behaviour.
--    The partial "one PENDING invite per contact" unique index already enforces
--    the real rule — the full uniques were rejecting legitimate re-invites with a
--    raw P2002 error.

-- ─── 1. Missing indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "accounts_userId_idx"              ON "accounts"("userId");
CREATE INDEX IF NOT EXISTS "sessions_userId_idx"              ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS "user_roles_roleId_idx"            ON "user_roles"("roleId");
CREATE INDEX IF NOT EXISTS "notifications_templateId_idx"     ON "notifications"("templateId");
CREATE INDEX IF NOT EXISTS "payment_mandates_bankAccountId_idx" ON "payment_mandates"("bankAccountId");
CREATE INDEX IF NOT EXISTS "transactions_mandateId_idx"       ON "transactions"("mandateId");
CREATE INDEX IF NOT EXISTS "transactions_status_retryCount_idx" ON "transactions"("status", "retryCount");

-- ─── 2. Remove erroneous full uniques (keep the partial-pending uniques) ───────
DROP INDEX IF EXISTS "invitations_email_key";
DROP INDEX IF EXISTS "invitations_phone_key";
