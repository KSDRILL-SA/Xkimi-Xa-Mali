-- CreateTable
CREATE TABLE "goal_pledges" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_pledges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goal_pledges_goalId_idx" ON "goal_pledges"("goalId");

-- CreateIndex
CREATE UNIQUE INDEX "goal_pledges_goalId_userId_key" ON "goal_pledges"("goalId", "userId");

-- AddForeignKey
ALTER TABLE "goal_pledges" ADD CONSTRAINT "goal_pledges_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_pledges" ADD CONSTRAINT "goal_pledges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
