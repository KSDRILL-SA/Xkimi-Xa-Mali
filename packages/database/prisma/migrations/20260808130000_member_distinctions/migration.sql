-- A permanent, granted distinction — today only FOUNDER.
--
-- Deliberately NOT a fifth value in "BadgeTier". That column is recalculated
-- from contribution behaviour on every status change, so a FOUNDER written there
-- would be silently overwritten the next time that founder paid a contribution,
-- and TIER_RANK would gain a fifth entry it has no ordering for. A tier is
-- earned; this is conferred. See docs/founder-badge-plan.md.
--
-- Additive. No existing row is touched and nothing is backfilled: the badge is
-- granted by an admin after the account exists.

CREATE TYPE "DistinctionKind" AS ENUM ('FOUNDER');

CREATE TABLE "member_distinctions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DistinctionKind" NOT NULL,
    -- Who granted it. There is one admin and he is himself a founder, so
    -- self-grants are expected; storing this is what makes one visible as such
    -- rather than indistinguishable from a grant by somebody else.
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "member_distinctions_pkey" PRIMARY KEY ("id")
);

-- A double grant is impossible in the database, not merely in the service.
CREATE UNIQUE INDEX "member_distinctions_userId_kind_key" ON "member_distinctions"("userId", "kind");

-- Counting the holders of a kind is the cap check, and runs on every grant.
CREATE INDEX "member_distinctions_kind_idx" ON "member_distinctions"("kind");

ALTER TABLE "member_distinctions"
  ADD CONSTRAINT "member_distinctions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No cascade on the granter: a granted badge must not disappear because the
-- person who granted it was removed.
ALTER TABLE "member_distinctions"
  ADD CONSTRAINT "member_distinctions_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
