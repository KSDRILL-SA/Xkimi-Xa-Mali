-- Offline (cash / EFT) contribution payments.
--
-- Netcash declined the DebiCheck application on 2026-09-01: their processing
-- bank requires an applicant to already hold an active debit-order base, which
-- a new stokvel by definition cannot. Members have nonetheless been paying into
-- the group's bank account by EFT since June 2026, and none of it could be
-- recorded — every payment path in the system required a gateway mandate.
--
-- This makes those payments representable.

-- 1. OFFLINE joins the transaction types.
--
-- Deliberately not folded into MANUAL. MANUAL means "the member pressed pay and
-- we submitted it to the gateway"; OFFLINE rows never had a gateway, hold no
-- mandate and carry no gatewayRef. Collapsing them would leave the ledger
-- unauditable — nobody could later tell which rows had ever been near a real
-- payment provider.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'OFFLINE';

-- 2. mandateId becomes nullable.
--
-- Every gateway-borne payment is authorised by a mandate and still must carry
-- one; that is enforced in the service layer, which refuses to write a
-- non-OFFLINE transaction without it. Cash genuinely has no mandate, and
-- fabricating a placeholder would require a placeholder bank account beneath
-- it — inventing banking details for somebody who never supplied any.
--
-- Widening a NOT NULL column to nullable rewrites no rows and takes no
-- long-lived lock: every existing transaction keeps the mandate it already has.
ALTER TABLE "transactions" ALTER COLUMN "mandateId" DROP NOT NULL;

-- 3. Evidence and attribution for a payment no system observed.
--
-- A gateway transaction is self-evidencing: the provider says it happened and
-- gatewayRef points at their record. An offline row is a person's claim that
-- money arrived, so it carries the two things that make the claim checkable —
-- what it was matched against on the bank statement, and who asserted it.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "offlineReference" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "recordedById" TEXT;
