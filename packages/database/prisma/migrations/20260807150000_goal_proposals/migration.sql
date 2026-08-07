-- A member can propose a Goal, and a rejected proposal stays on the record.
--
-- The guide's six-step Goal flow begins "1 A member proposes it" and continues
-- "2 Leadership reviews it". Only leadership could create a Goal, so the flow
-- started with something a member could not do.
--
-- DRAFT already models "proposed but not approved" and activateGoal already
-- models approval. What was missing was a member entry point and an answer for
-- the other direction — a refusal.
--
-- REJECTED is a fifth GoalStatus rather than a deletion. Decided by the
-- founders, on the guide's own principle that nothing is quietly removed: a
-- member who proposed something can see it was considered and answered, and
-- read why, instead of watching it disappear.
--
-- Safe inside Prisma's migration transaction on PostgreSQL 12+: adding an enum
-- value is transactional, and the restriction is only on *using* the new value
-- in the same transaction. Nothing here writes a REJECTED row.
ALTER TYPE "GoalStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- Who reviewed the proposal, when, and — if refused — why.
--
-- All nullable and additive. Every goal created before this migration was
-- created by leadership directly and was never reviewed by anyone else, which
-- these columns honestly say by being empty.
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "reviewedById"    TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "reviewedAt"      TIMESTAMP(3);

ALTER TABLE "goals"
  DROP CONSTRAINT IF EXISTS "goals_reviewedById_fkey";
ALTER TABLE "goals"
  ADD CONSTRAINT "goals_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "goals_reviewedById_idx" ON "goals"("reviewedById");
