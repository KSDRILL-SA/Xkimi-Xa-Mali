-- Recording a member's cash or EFT payment toward a goal.
--
-- The contribution path already had this; goals did not, and the gap was the
-- same one twice. `payToGoal` requires an active Netcash mandate, and Netcash
-- declined the DebiCheck application — so no member can give to a goal through
-- the gateway. The only other route, an admin recording goal progress, credits
-- nobody: it moves the goal total with no member attached and refuses the
-- primary fund outright. A member who handed over cash for a goal could not be
-- recorded as having done so.
--
-- These four mirror the columns on `transactions` exactly. They are the same
-- claim about the same kind of money, and two different shapes for it would be
-- two things to reason about when reconciling one bank statement.
ALTER TABLE "goal_payments" ADD COLUMN IF NOT EXISTS "offlineReference" TEXT;
ALTER TABLE "goal_payments" ADD COLUMN IF NOT EXISTS "recordedById" TEXT;
ALTER TABLE "goal_payments" ADD COLUMN IF NOT EXISTS "proofUrl" TEXT;
ALTER TABLE "goal_payments" ADD COLUMN IF NOT EXISTS "proofWitness" TEXT;

-- Both media routes resolve a proof by pathname before serving any bytes.
CREATE INDEX IF NOT EXISTS "goal_payments_proofUrl_idx" ON "goal_payments"("proofUrl");
