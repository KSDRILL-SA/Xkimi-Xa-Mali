-- Bring every notification template in line with the name the platform actually
-- uses, and take the last em dashes out of the SMS ones.
--
-- The seed already declares "Xkimm Xa Mali Foundation" throughout, but it is
-- create-only by design (admins may reword templates in the database), so the
-- rename never reached any database seeded before it. What was still carrying
-- the old name:
--
--   18 SMS bodies      "Xkimm Xa Mali: ..."      the sender prefix
--    1 push body       same prefix
--    2 email bodies    "...join Xkimm Xa Mali."   in prose, no colon
--   10 email subjects  "Payment failed — Xkimm Xa Mali"
--
-- Matching the bare brand name rather than the prefix covers all four shapes at
-- once. The NOT LIKE guard is what makes it safe to re-run: a blind replace
-- would turn an already-corrected row into "Xkimm Xa Mali Foundation
-- Foundation". After this migration every row carrying the brand carries
-- "Foundation", so the guard can never match again.
--
-- The em dash is a separate problem and applies to SMS ONLY. It is not in the
-- GSM-7 alphabet, and one character outside that alphabet forces the whole
-- message into UCS-2, cutting a segment from 160 characters to 70. Four SMS
-- templates still carried one. Measured across one round of every SMS template,
-- with the longer brand name already included:
--
--   contribution-due-reminder   3 segments -> 2
--   debit-tomorrow-warning      2 segments -> 1
--   goal-activated              2 segments -> 1
--   goal-payment-thanks         2 segments -> 1
--   total                      27 segments -> 23
--
-- Email keeps its em dashes, including the ten in subjects. There is no segment
-- cost there and it is the correct punctuation; the character is only ever a
-- liability under GSM-7.

UPDATE "notification_templates"
SET "body" = replace("body", 'Xkimm Xa Mali', 'Xkimm Xa Mali Foundation')
WHERE "body" LIKE '%Xkimm Xa Mali%'
  AND "body" NOT LIKE '%Xkimm Xa Mali Foundation%';

UPDATE "notification_templates"
SET "subject" = replace("subject", 'Xkimm Xa Mali', 'Xkimm Xa Mali Foundation')
WHERE "subject" LIKE '%Xkimm Xa Mali%'
  AND "subject" NOT LIKE '%Xkimm Xa Mali Foundation%';

-- Em dash, SMS only, where it costs real money.
UPDATE "notification_templates"
SET "body" = replace("body", chr(8212), '-')
WHERE "channel" = 'SMS'
  AND "body" LIKE '%' || chr(8212) || '%';
