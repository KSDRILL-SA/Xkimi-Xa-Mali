-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('MONTHLY', 'YEARLY', 'CUSTOM');

-- CreateTable
CREATE TABLE "user_budgets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BudgetType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_budget_amount" CHECK ("amount" >= 100 AND "amount" <= 10000),
    CONSTRAINT "chk_budget_dates" CHECK ("endDate" IS NULL OR "endDate" > "startDate")
);

-- CreateTable
CREATE TABLE "budget_overrides" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contributionId" TEXT,
    "attemptedAmount" DECIMAL(10,2) NOT NULL,
    "budgetAmount" DECIMAL(10,2) NOT NULL,
    "overageAmount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One active budget per type per user (deactivated budgets are kept for history)
CREATE UNIQUE INDEX "user_budgets_active_type_key" ON "user_budgets"("userId", "type") WHERE "isActive" = true;

-- CreateIndex
CREATE INDEX "user_budgets_userId_type_isActive_idx" ON "user_budgets"("userId", "type", "isActive");

-- CreateIndex
CREATE INDEX "budget_overrides_userId_createdAt_idx" ON "budget_overrides"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_budgets" ADD CONSTRAINT "user_budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_overrides" ADD CONSTRAINT "budget_overrides_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "user_budgets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_overrides" ADD CONSTRAINT "budget_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
