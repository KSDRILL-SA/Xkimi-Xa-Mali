-- The admin who invites somebody records who they are.
--
-- The invitee used to type their own ID at registration, optionally, and
-- nobody could change it afterwards — not the member, not an admin. So a
-- missing or mistyped ID was permanent, on the field that ties a bank account
-- to a person.
--
-- Existing rows are backfilled with the empty string rather than dropped or
-- guessed at. An invitation already sent was made under the old rules and its
-- recipient will supply their own ID as before; the column is NOT NULL so that
-- every invitation from here on carries one.
ALTER TABLE "invitations" ADD COLUMN "idNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "invitations" ADD COLUMN "vouchedFor" TEXT;

-- The default exists only to backfill. New rows must state it.
ALTER TABLE "invitations" ALTER COLUMN "idNumber" DROP DEFAULT;
