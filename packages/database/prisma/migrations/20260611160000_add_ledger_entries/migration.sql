-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('POOL');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL DEFAULT 'POOL',
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "memberId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_account_createdAt_idx" ON "ledger_entries"("account", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_memberId_idx" ON "ledger_entries"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_refType_refId_direction_key" ON "ledger_entries"("refType", "refId", "direction");
