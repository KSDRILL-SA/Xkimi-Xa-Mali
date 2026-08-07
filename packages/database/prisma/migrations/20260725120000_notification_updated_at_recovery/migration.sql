-- Notification stalled-recovery support.
--
-- The flush worker claims a batch atomically (findReady sets status='FAILED',
-- errorMessage='in-flight' via raw SQL) and then dispatches. If the worker
-- process dies between the claim and the final status write, those rows stay
-- 'in-flight' forever and are never retried — a lost notification.
--
-- Add updatedAt so a stalled claim can be detected by age. findReady now stamps
-- updatedAt=NOW() on claim; recoverStalledNotifications requeues 'in-flight' rows
-- whose claim is older than the max processing window. Backfilled to NOW() for
-- existing rows (none are legitimately mid-flight at migration time).

ALTER TABLE "notifications"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "notifications_status_updatedAt_idx"
  ON "notifications"("status", "updatedAt");
