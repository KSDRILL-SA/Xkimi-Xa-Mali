-- CreateTable
CREATE TABLE "admin_signatures" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "signatureUrl" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextChangeAllowedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_signature_history" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "signatureUrl" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedById" TEXT NOT NULL,

    CONSTRAINT "admin_signature_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_signatures_adminId_key" ON "admin_signatures"("adminId");

-- CreateIndex
CREATE INDEX "admin_signature_history_adminId_replacedAt_idx" ON "admin_signature_history"("adminId", "replacedAt");

-- AddForeignKey
ALTER TABLE "admin_signatures" ADD CONSTRAINT "admin_signatures_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_signature_history" ADD CONSTRAINT "admin_signature_history_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
