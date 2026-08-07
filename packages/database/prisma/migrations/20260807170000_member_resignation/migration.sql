-- A member can leave, and their history stays exactly where it is.
--
-- Under Your Rights the guide promises "Leave the Foundation at any time, with
-- your history intact", and the FAQ answers "Yes, at any time. Your history
-- stays on record but future contributions stop." There was no self-service
-- route at all — leaving was not something the system could do.
--
-- RESIGNED is a fourth UserStatus rather than a deletion or a suspension:
--
--   * Not a deletion, because the guide is explicit that history stays and
--     contributions already made are not refunded. Nothing is removed.
--   * Not SUSPENDED, because suspension is something leadership does TO a
--     member and blocks sign-in. Someone who chose to leave has not been
--     punished, and shutting them out of their own statements would be the
--     opposite of "with your history intact".
--
-- The debit run and contribution generation already collect only from ACTIVE
-- users, so moving out of ACTIVE is what stops future collections. That is the
-- existing mechanism, not a new one.
--
-- Safe inside Prisma's migration transaction on PostgreSQL 12+: adding an enum
-- value is transactional, and the restriction is only on *using* the new value
-- in the same transaction. Nothing here writes a RESIGNED row.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'RESIGNED';

-- When they left. Nullable and additive: every existing member is still here,
-- which an empty column says honestly.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "resignedAt" TIMESTAMP(3);
