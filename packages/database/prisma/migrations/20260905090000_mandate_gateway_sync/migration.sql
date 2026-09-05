-- Whether this system and the bank still agree about a mandate.
--
-- ── The window this makes visible ────────────────────────────────────────────
--
-- `updateMandate` and `cancelMandate` both write locally first and tell Netcash
-- second. That ordering is deliberate and stays: a member who asks to stop
-- being collected from must never be collected from again by us, whatever the
-- gateway does.
--
-- Its cost is a window where the two disagree, and the entire response to
-- landing in that window was one alert addressed to nobody in particular.
-- Meanwhile the debit run went on reading the LOCAL amount:
--
--     this system says R700
--     the bank authorised R500
--     the next collection asks for R700 and is refused
--
-- Refused is better than overcharged, but the member experiences a failed
-- collection caused entirely by our own bookkeeping — and nothing stopped it.
--
-- A mandate that is out of step is now marked, and the debit run leaves it
-- alone until somebody has put it right. A known inconsistency held in a safe
-- state, rather than an alert and a hope.
--
-- ── Why a field and not a status ─────────────────────────────────────────────
--
-- `MandateStatus` answers "what is this mandate for the member" — pending,
-- active, cancelled. Sync answers "do we and the bank still agree", which is
-- orthogonal: an ACTIVE mandate can be out of step, and so can a CANCELLED one
-- whose cancellation the gateway refused. Folding them into one enum would make
-- every `status: 'ACTIVE'` filter in the codebase silently mean something new.
CREATE TYPE "GatewaySyncState" AS ENUM ('IN_SYNC', 'PENDING', 'FAILED');

ALTER TABLE "payment_mandates"
  ADD COLUMN IF NOT EXISTS "gatewaySync" "GatewaySyncState" NOT NULL DEFAULT 'IN_SYNC',
  ADD COLUMN IF NOT EXISTS "gatewaySyncReason" TEXT,
  ADD COLUMN IF NOT EXISTS "gatewaySyncAt" TIMESTAMP(3);

-- The debit run and the nightly reconciler both ask "which mandates are out of
-- step", and the answer should be a handful of rows out of fifty.
CREATE INDEX IF NOT EXISTS "payment_mandates_gateway_sync_idx"
  ON "payment_mandates" ("gatewaySync")
  WHERE "gatewaySync" <> 'IN_SYNC';
