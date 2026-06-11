-- CreateEnum
CREATE TYPE "InboxCategory" AS ENUM ('BROADCAST', 'SYSTEM', 'PAYMENT', 'GOAL');

-- CreateTable
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "InboxCategory" NOT NULL DEFAULT 'BROADCAST',
    "readAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_messages_userId_readAt_idx" ON "inbox_messages"("userId", "readAt");

-- CreateIndex
CREATE INDEX "inbox_messages_userId_createdAt_idx" ON "inbox_messages"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
