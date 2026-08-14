-- POPIA data subject requests.
--
-- Only the DataSubjectRequest table, its enums and its keys. `migrate diff` also
-- proposed full UNIQUE indexes on payment_mandates.netcashMandateId and
-- transactions.reversalOfId; those are deliberately PARTIAL unique indexes
-- created in raw SQL (see the comments in schema.prisma) and the @unique markers
-- exist only to keep the Prisma client aware of them. Applying the full versions
-- would change their meaning, so they are excluded here.

-- CreateEnum
CREATE TYPE "DsrKind" AS ENUM ('ACCESS', 'CORRECTION', 'DELETION', 'OBJECTION', 'CONSENT_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "DsrStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REFUSED');

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "subjectId" TEXT,
    "kind" "DsrKind" NOT NULL,
    "status" "DsrStatus" NOT NULL DEFAULT 'RECEIVED',
    "detail" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_subject_requests_status_dueAt_idx" ON "data_subject_requests"("status", "dueAt");

-- CreateIndex
CREATE INDEX "data_subject_requests_subjectId_idx" ON "data_subject_requests"("subjectId");

-- CreateIndex
CREATE INDEX "data_subject_requests_receivedAt_idx" ON "data_subject_requests"("receivedAt");

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
