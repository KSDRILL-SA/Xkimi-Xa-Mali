-- Directed extra payments toward a goal (primary or additional), collected via
-- the payment gateway. SUCCESS payments count toward the goal; the unique
-- idempotency key makes a retried submission a no-op.

CREATE TABLE "goal_payments" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "goal_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "goal_payments_idempotencyKey_key" ON "goal_payments"("idempotencyKey");
CREATE INDEX "goal_payments_goalId_status_idx" ON "goal_payments"("goalId", "status");
CREATE INDEX "goal_payments_userId_idx" ON "goal_payments"("userId");

ALTER TABLE "goal_payments" ADD CONSTRAINT "goal_payments_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_payments" ADD CONSTRAINT "goal_payments_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
