-- Add the 'contribution-reversed' notification pair.
--
-- A reversal changes what a member was told they had paid. Until now nothing
-- told them: createReversal moved the money back, recalculated the contribution
-- and wrote an audit entry the member cannot read, in silence.
--
-- Seeded for fresh installs; inserted here for existing databases. Idempotent —
-- the slug is unique, so re-running is a no-op.
--
-- Both slugs are registered in MANDATORY_SLUGS. That is not incidental. The
-- `debit-declined` pair was seeded, left out of MANDATORY_SLUGS, and so would
-- have been filtered away for any member who had switched SMS off — it was
-- never sent once. Money leaving a member's balance is not a message anyone
-- should be able to opt out of.
--
-- The SMS carries no {{reason}} on purpose: a reason may run to 500 characters
-- and would fragment the message across several billable parts. It points at
-- the transactions screen, where the reason is now shown in full; the email
-- carries it inline.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_contribution_reversed_sms',
  'contribution-reversed-sms',
  'SMS',
  NULL,
  'Xkimm Xa Mali Foundation: {{firstName}}, your R{{amount}} payment for {{period}} has been reversed. The reason is on your transactions page: {{url}}'
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_contribution_reversed_email',
  'contribution-reversed-email',
  'EMAIL',
  'A payment has been reversed - Xkimm Xa Mali Foundation',
  'Hi {{firstName}}, your R{{amount}} contribution for {{period}} has been reversed by leadership. Reason given: {{reason}}. Nothing has been deleted - the original payment and the reversing entry both remain in your history. View them here: {{url}}'
)
ON CONFLICT ("slug") DO NOTHING;
