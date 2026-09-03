-- Proof of payment for an offline contribution.
--
-- Members already send proof of payment to the WhatsApp group when they pay by
-- EFT; until now it was attached to nothing, and an OFFLINE transaction was
-- evidenced only by a reference string an admin typed. These two columns are
-- what makes the row checkable by somebody who was not there.
--
-- Nullable, and no backfill. Rows written before this — the June-to-August
-- backlog included, if any of it was captured already — genuinely have no
-- evidence attached, and inventing a value would assert something untrue about
-- money. They read as "no proof recorded", which is the fact.
--
-- Exactly one of the two is required on a new OFFLINE row, enforced in the
-- service layer rather than by a CHECK constraint: the rule is "one or the
-- other, for OFFLINE only", legacy rows have neither, and a constraint that has
-- to carve those out states the rule worse than the code that owns it.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "proofUrl" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "proofWitness" TEXT;

-- Both media routes resolve a proof by pathname on every request, to confirm a
-- row claims it before any bytes are served. Transactions grow faster than
-- anything else here, so that lookup is indexed rather than scanned.
CREATE INDEX IF NOT EXISTS "transactions_proofUrl_idx" ON "transactions"("proofUrl");
