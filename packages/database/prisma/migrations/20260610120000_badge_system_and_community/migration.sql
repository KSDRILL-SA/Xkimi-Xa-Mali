-- CreateEnum
CREATE TYPE "BadgeTier" AS ENUM ('AMATEUR', 'SEMI_PRO', 'PRO', 'WORLD_CLASS');

-- CreateTable
CREATE TABLE "badge_scores" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentBadge" "BadgeTier" NOT NULL DEFAULT 'AMATEUR',
    "overallScore" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "consistencyScore" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "timelinessScore" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "generosityScore" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "streakBonus" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "progressToNext" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "totalPaidMonths" INTEGER NOT NULL DEFAULT 0,
    "totalOnTimeMonths" INTEGER NOT NULL DEFAULT 0,
    "totalOverdue" INTEGER NOT NULL DEFAULT 0,
    "overdueInLast6" INTEGER NOT NULL DEFAULT 0,
    "monthsActive" INTEGER NOT NULL DEFAULT 0,
    "avgContribution" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "graceUntil" TIMESTAMP(3),
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badge_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badge_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromBadge" "BadgeTier",
    "toBadge" "BadgeTier" NOT NULL,
    "trigger" TEXT NOT NULL,
    "score" DECIMAL(6,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badge_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "replyToId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "editableUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "badge_scores_userId_key" ON "badge_scores"("userId");

-- CreateIndex
CREATE INDEX "badge_scores_currentBadge_idx" ON "badge_scores"("currentBadge");

-- CreateIndex
CREATE INDEX "badge_scores_overallScore_idx" ON "badge_scores"("overallScore");

-- CreateIndex
CREATE INDEX "badge_history_userId_createdAt_idx" ON "badge_history"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "community_messages_createdAt_idx" ON "community_messages"("createdAt");

-- CreateIndex
CREATE INDEX "community_messages_userId_createdAt_idx" ON "community_messages"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "community_messages_isPinned_idx" ON "community_messages"("isPinned");

-- AddForeignKey
ALTER TABLE "badge_scores" ADD CONSTRAINT "badge_scores_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "badge_history" ADD CONSTRAINT "badge_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "community_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: seed an initial BadgeScore row for every existing active user
INSERT INTO "badge_scores" ("id", "userId", "lastCalculatedAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
WHERE "status" = 'ACTIVE'
ON CONFLICT ("userId") DO NOTHING;
