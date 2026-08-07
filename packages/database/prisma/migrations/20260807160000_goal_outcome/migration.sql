-- Document what a Goal's money actually bought.
--
-- Step 6 of the guide's Goal flow, and the one it calls the proof of the whole
-- Foundation: "The outcome is documented — the purchase is shown back to the
-- circle. Everyone sees what their money actually did." Nothing recorded it.
-- A Goal reached its target, was marked Achieved, and the story stopped there.
--
-- outcomeNote is the account of what was bought. outcomeProofUrl is a photo or
-- receipt and is OPTIONAL — the founders' decision: a written account should
-- never be blocked because a receipt cannot be found months later, and a goal
-- that can never be closed out helps nobody.
--
-- All nullable and additive. A goal achieved before this migration has no
-- documented outcome, which empty columns say honestly rather than implying one
-- was recorded and lost.
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "outcomeNote"        TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "outcomeProofUrl"    TEXT;
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "outcomeRecordedAt"  TIMESTAMP(3);
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "outcomeRecordedById" TEXT;

ALTER TABLE "goals"
  DROP CONSTRAINT IF EXISTS "goals_outcomeRecordedById_fkey";
ALTER TABLE "goals"
  ADD CONSTRAINT "goals_outcomeRecordedById_fkey"
  FOREIGN KEY ("outcomeRecordedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "goals_outcomeRecordedById_idx" ON "goals"("outcomeRecordedById");
