-- Phase 3 — Money Paths
--
-- Enforce "at most one PENDING or ACTIVE mandate per user" at the database level.
--
-- mandate.service.createMandate checks for an existing active/pending mandate
-- before creating one, but that check-then-create is not atomic: two concurrent
-- submissions can both pass the check and each create a live DebiCheck mandate at
-- Netcash — resulting in the member being debited twice. This partial unique
-- index makes the invariant race-safe: the second insert fails with P2002, which
-- the service turns into a clean conflict error (and the orphaned Netcash mandate
-- is cancelled by the existing compensation path).
--
-- A REJECTED/CANCELLED/SUSPENDED mandate is outside the predicate, so a member can
-- still create a fresh mandate after an earlier one ends. Verified: no existing
-- user currently holds more than one active/pending mandate, so this is additive.

CREATE UNIQUE INDEX IF NOT EXISTS "payment_mandates_one_active_per_user"
  ON "payment_mandates"("userId")
  WHERE "status" IN ('PENDING', 'ACTIVE');
