-- A member's standing commitment to fund one goal every month.
--
-- Collections are charged against the member's existing mandate; there is no
-- mandate per plan, because a member may hold only one active mandate at a
-- time. A plan is an instruction, not money — every rand it moves is still a
-- goal_payments row, so a goal's derived total and its reversal behaviour are
-- untouched by this table existing.

CREATE TYPE "GoalPlanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "goal_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "debitDay" INTEGER NOT NULL,
    "status" "GoalPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastCollectedPeriod" TEXT,
    "failedRuns" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "goal_plans_userId_status_idx" ON "goal_plans"("userId", "status");

-- The collection job's only query: every ACTIVE plan due on a given day.
CREATE INDEX "goal_plans_status_debitDay_idx" ON "goal_plans"("status", "debitDay");

-- One live plan per member per goal. Partial, because a member who cancels a
-- plan and later rejoins the same goal must be able to — a plain unique
-- constraint would refuse them forever on the strength of a plan they stopped.
-- Prisma's DSL cannot express a partial index, so it lives here and is one of
-- the shapes `prisma migrate diff` will always report as drift.
CREATE UNIQUE INDEX "goal_plans_user_goal_active_key"
    ON "goal_plans"("userId", "goalId")
    WHERE "status" = 'ACTIVE';

-- A day outside 1–31 could never be collected, and a non-positive amount is not
-- a commitment. Refused by the database rather than only by the service, so a
-- bad row cannot arrive by any other route.
ALTER TABLE "goal_plans"
    ADD CONSTRAINT "chk_goal_plan_debit_day" CHECK ("debitDay" BETWEEN 1 AND 31);

ALTER TABLE "goal_plans"
    ADD CONSTRAINT "chk_goal_plan_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "goal_plans" ADD CONSTRAINT "goal_plans_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
