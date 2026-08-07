-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "invitations" (
    "id"            TEXT            NOT NULL,
    "codeHash"      TEXT            NOT NULL,
    "codePrefix"    TEXT            NOT NULL,
    "firstName"     TEXT            NOT NULL,
    "lastName"      TEXT            NOT NULL,
    "email"         TEXT            NOT NULL,
    "phone"         TEXT            NOT NULL,
    "minimumAmount" DECIMAL(10,2)   NOT NULL,
    "status"        "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById"   TEXT            NOT NULL,
    "acceptedById"  TEXT,
    "expiresAt"     TIMESTAMP(3)    NOT NULL,
    "acceptedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_codeHash_key"     ON "invitations"("codeHash");
CREATE UNIQUE INDEX "invitations_email_key"         ON "invitations"("email");
CREATE UNIQUE INDEX "invitations_phone_key"         ON "invitations"("phone");
CREATE UNIQUE INDEX "invitations_acceptedById_key"  ON "invitations"("acceptedById");
CREATE INDEX        "invitations_invitedById_idx"   ON "invitations"("invitedById");
CREATE INDEX        "invitations_email_idx"         ON "invitations"("email");
CREATE INDEX        "invitations_status_idx"        ON "invitations"("status");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
