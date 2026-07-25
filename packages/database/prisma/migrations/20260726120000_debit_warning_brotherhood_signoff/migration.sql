-- Add the brotherhood's sign-off to both debit-day warning SMSes, and take an
-- em dash out of the urgent one.
--
-- The dash matters as much as the joke: any character outside the GSM-7
-- alphabet forces the entire message into UCS-2 encoding, which shrinks an SMS
-- segment from 160 characters to 70. The urgent warning was 172 characters of
-- UCS-2 — three billed segments. As plain GSM-7, and even with the new line
-- added, it is 197 characters across two. The standard warning stays at one.
--
-- Matched on the message TAIL, not the whole body, because the sender prefix
-- has drifted: the seed is create-only (admins may reword templates in the DB),
-- so databases seeded before the rebrand still open with "Xkimm Xa Mali:" while
-- newer rows say "Xkimm Xa Mali Foundation:". Anchoring on the ending updates
-- both without touching whichever prefix a database actually carries.
--
-- The NOT LIKE '%Humesa%' guard makes this idempotent and, together with the
-- tail match, means a genuinely reworded message is left alone.

-- Standard debit-day warning: append the sign-off.
UPDATE "notification_templates"
SET "body" = "body" || ' Humesa Mali N''wa Mfenhe!'
WHERE "slug" = 'debit-morning-warning'
  AND "body" LIKE '%for your monthly contribution.'
  AND "body" NOT LIKE '%Humesa%';

-- Urgent variant: drop the em dash to keep the message in GSM-7, then append.
UPDATE "notification_templates"
SET "body" = replace("body", 'IMPORTANT — R', 'IMPORTANT - R') || ' Humesa Mali N''wa Mfenhe!'
WHERE "slug" = 'debit-morning-warning-urgent'
  AND "body" LIKE '%avoid another decline.'
  AND "body" NOT LIKE '%Humesa%';
