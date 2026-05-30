-- Add roleVersion column for JWT session invalidation on role/status changes
ALTER TABLE "users" ADD COLUMN "roleVersion" INTEGER NOT NULL DEFAULT 0;
