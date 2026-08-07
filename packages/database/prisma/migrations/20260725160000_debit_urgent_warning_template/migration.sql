-- Add the 'debit-morning-warning-urgent' notification template.
--
-- The morning debit warning now sends a stronger, targeted message to members
-- flagged at-risk (a debit failed in the last 90 days). That relies on this
-- template existing. Seeded for fresh installs; inserted here for existing
-- databases. Idempotent — the slug is unique, so re-running is a no-op.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_debit_morning_warning_urgent',
  'debit-morning-warning-urgent',
  'SMS',
  NULL,
  'Xkimm Xa Mali Foundation: IMPORTANT — R{{amount}} will be deducted tonight at 20:00. A recent debit failed, so please make sure funds are available today to avoid another decline.'
)
ON CONFLICT ("slug") DO NOTHING;
