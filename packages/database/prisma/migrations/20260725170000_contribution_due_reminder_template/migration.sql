-- Add the 'contribution-due-reminder' notification template.
--
-- The early-payment reminder job nudges members a few days before a contribution
-- falls due, encouraging a badge-boosting payment before the automatic debit.
-- Seeded for fresh installs; inserted here for existing databases. Idempotent —
-- the slug is unique, so re-running is a no-op.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_contribution_due_reminder',
  'contribution-due-reminder',
  'SMS',
  NULL,
  'Xkimm Xa Mali Foundation: R{{amount}} is due on {{date}}. Pay early in the app to boost your badge points and protect your streak — or relax, we will debit it automatically.'
)
ON CONFLICT ("slug") DO NOTHING;
