-- Fix 1: GoalProgress FK — change onDelete from RESTRICT to CASCADE
-- Allows deleting DRAFT goals that already have progress records
ALTER TABLE "goal_progress" DROP CONSTRAINT IF EXISTS "goal_progress_goalId_fkey";
ALTER TABLE "goal_progress" ADD CONSTRAINT "goal_progress_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fix 2: Invitation email/phone — drop global unique constraints
-- Re-enforce only as partial unique (PENDING status) to allow re-inviting after revoke/expiry
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_email_key";
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_phone_key";
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_email_pending_unique"
  ON "invitations"("email") WHERE ("status" = 'PENDING');
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_phone_pending_unique"
  ON "invitations"("phone") WHERE ("status" = 'PENDING');
